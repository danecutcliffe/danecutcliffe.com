begin;

-- Break attribution is keyed by the break start. Prevent new/manual break rows
-- from being saved unless that start time is inside a same-employee work entry.

create or replace function public.break_start_has_work_entry(
  candidate_id uuid,
  candidate_user_id uuid,
  candidate_clock_in timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.time_entries work_entry
    where work_entry.user_id = candidate_user_id
      and work_entry.id is distinct from candidate_id
      and work_entry.event_type = 'work'
      and work_entry.clock_in <= candidate_clock_in
      and candidate_clock_in < coalesce(work_entry.clock_out, 'infinity'::timestamptz)
  )
$function$;

create or replace function public.break_start_has_work_entry_after_work_change(
  candidate_user_id uuid,
  candidate_clock_in timestamptz,
  changed_work_entry_id uuid,
  replacement_user_id uuid,
  replacement_event_type public.time_event_type,
  replacement_clock_in timestamptz,
  replacement_clock_out timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.time_entries work_entry
    where work_entry.user_id = candidate_user_id
      and work_entry.id is distinct from changed_work_entry_id
      and work_entry.event_type = 'work'
      and work_entry.clock_in <= candidate_clock_in
      and candidate_clock_in < coalesce(work_entry.clock_out, 'infinity'::timestamptz)
  )
  or (
    replacement_event_type = 'work'
    and replacement_user_id = candidate_user_id
    and replacement_clock_in <= candidate_clock_in
    and candidate_clock_in < coalesce(replacement_clock_out, 'infinity'::timestamptz)
  )
$function$;

create or replace function public.guard_break_start_has_work_entry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.event_type = 'break'
    and not public.break_start_has_work_entry(new.id, new.user_id, new.clock_in) then
    raise exception 'Manual break entries must start within an existing work entry for the employee.';
  end if;

  return new;
end;
$function$;

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

drop trigger if exists time_entries_break_start_work_guard on public.time_entries;
create trigger time_entries_break_start_work_guard
  before insert or update on public.time_entries
  for each row execute function public.guard_break_start_has_work_entry();

drop trigger if exists time_entries_work_break_guard_update on public.time_entries;
create trigger time_entries_work_break_guard_update
  before update of user_id, event_type, clock_in, clock_out on public.time_entries
  for each row execute function public.guard_work_change_preserves_breaks();

drop trigger if exists time_entries_work_break_guard_delete on public.time_entries;
create trigger time_entries_work_break_guard_delete
  before delete on public.time_entries
  for each row execute function public.guard_work_change_preserves_breaks();

commit;
