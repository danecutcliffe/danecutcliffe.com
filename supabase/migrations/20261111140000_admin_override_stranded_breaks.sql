begin;

-- Admin override for the "work change cannot strand a break" rule.
--
-- Normal rule (unchanged): editing or deleting a work entry may not leave a
-- break without a work entry containing its start.
--
-- Why an override is needed: when a punch boundary between two adjacent work
-- entries has to move (entry A ends earlier, entry B starts earlier to match),
-- neither edit can go first. Shrinking A strands the break; growing B first
-- overlaps A. The admin knows the next edit will cover the break again.
--
-- How it works: the override is only reachable through the admin-only RPC
-- below, which sets a transaction-local flag for its own UPDATE. The trigger
-- honours the flag only for UPDATEs made by an admin. Direct table writes and
-- deletes keep the normal rule. Every override is written to audit_log.
-- No table rows are changed by this migration.

create or replace function public.guard_work_change_preserves_breaks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.event_type = 'work' and exists (
      select 1
      from public.time_entries break_entry
      where break_entry.user_id = old.user_id
        and break_entry.event_type = 'break'
        and old.clock_in <= break_entry.clock_in
        and break_entry.clock_in < coalesce(old.clock_out, 'infinity'::timestamptz)
        and not public.break_start_has_work_entry_after_work_change(
          break_entry.user_id,
          break_entry.clock_in,
          old.id,
          null,
          null::public.time_event_type,
          null,
          null
        )
    ) then
      raise exception 'Work entry changes cannot leave existing break entries without a containing work entry.';
    end if;

    return old;
  end if;

  if coalesce(current_setting('time_clock.allow_stranded_breaks', true), '') = 'on'
    and public.is_admin() then
    return new;
  end if;

  if old.event_type = 'work' and exists (
    select 1
    from public.time_entries break_entry
    where break_entry.user_id = old.user_id
      and break_entry.event_type = 'break'
      and old.clock_in <= break_entry.clock_in
      and break_entry.clock_in < coalesce(old.clock_out, 'infinity'::timestamptz)
      and not public.break_start_has_work_entry_after_work_change(
        break_entry.user_id,
        break_entry.clock_in,
        old.id,
        new.user_id,
        new.event_type,
        new.clock_in,
        new.clock_out
      )
  ) then
    raise exception 'Work entry changes cannot leave existing break entries without a containing work entry.';
  end if;

  return new;
end;
$function$;

create or replace function public.admin_update_time_entry_allow_stranded_breaks(
  p_entry_id uuid,
  p_patch jsonb
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  original_entry public.time_entries;
  updated_entry public.time_entries;
  stranded_break_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only admins can override the break rule.';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid time entry change.';
  end if;

  select * into original_entry
  from public.time_entries
  where id = p_entry_id
    and event_type = 'work'
  for update;

  if original_entry.id is null then
    raise exception 'Work entry not found.';
  end if;

  -- An open break that ends up outside every work entry could not be ended by
  -- the employee (the break guard runs on every break update), so never strand one.
  if exists (
    select 1
    from public.time_entries break_entry
    where break_entry.user_id = original_entry.user_id
      and break_entry.event_type = 'break'
      and break_entry.clock_out is null
      and original_entry.clock_in <= break_entry.clock_in
      and break_entry.clock_in < coalesce(original_entry.clock_out, 'infinity'::timestamptz)
  ) then
    raise exception 'This employee is on a break right now. End the break before changing this entry.';
  end if;

  -- Transaction-local: cleared automatically at commit or rollback, and turned
  -- off again right after the one UPDATE it is meant for.
  perform set_config('time_clock.allow_stranded_breaks', 'on', true);

  update public.time_entries
  set
    clock_in = case when p_patch ? 'clock_in' then (p_patch->>'clock_in')::timestamptz else clock_in end,
    clock_out = case when p_patch ? 'clock_out' then (p_patch->>'clock_out')::timestamptz else clock_out end,
    job_code_id = case when p_patch ? 'job_code_id' then (p_patch->>'job_code_id')::uuid else job_code_id end,
    notes = case when p_patch ? 'notes' then p_patch->>'notes' else notes end,
    edited_by = auth.uid(),
    edited_at = now()
  where id = p_entry_id
  returning * into updated_entry;

  perform set_config('time_clock.allow_stranded_breaks', 'off', true);

  select coalesce(array_agg(break_entry.id), '{}'::uuid[]) into stranded_break_ids
  from public.time_entries break_entry
  where break_entry.user_id = original_entry.user_id
    and break_entry.event_type = 'break'
    and original_entry.clock_in <= break_entry.clock_in
    and break_entry.clock_in < coalesce(original_entry.clock_out, 'infinity'::timestamptz)
    and not public.break_start_has_work_entry(break_entry.id, break_entry.user_id, break_entry.clock_in);

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    'break_rule_override',
    'time_entries',
    p_entry_id,
    null,
    jsonb_build_object('patch', p_patch, 'stranded_break_ids', to_jsonb(stranded_break_ids))
  );

  return updated_entry;
end;
$function$;

revoke all on function public.admin_update_time_entry_allow_stranded_breaks(uuid, jsonb) from public;
revoke all on function public.admin_update_time_entry_allow_stranded_breaks(uuid, jsonb) from anon;
grant execute on function public.admin_update_time_entry_allow_stranded_breaks(uuid, jsonb) to authenticated;
grant execute on function public.admin_update_time_entry_allow_stranded_breaks(uuid, jsonb) to service_role;

commit;
