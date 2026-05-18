begin;

-- Applied to production on 2026-05-18.
-- Harden timecard authorization so employees can only complete their own
-- open punch flow; admin corrections remain admin-only.

-- The manager role is not currently used. Keep the enum value for compatibility,
-- but remove its broad read privileges by making this helper admin-only.
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.current_user_role() = 'admin', false)
$function$;

-- Harden direct employee updates. Employees may only maintain their own open
-- punch flow. Closed entries and approved pay periods are locked at the DB layer.
create or replace function public.guard_time_entry_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_timesheet_week_approved(old.user_id, old.clock_in) then
    raise exception 'This pay period has been approved. Unlock it before editing time entries.';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.user_id <> auth.uid() then
    raise exception 'Only admins can edit another employee time entry.';
  end if;

  if not public.is_active_profile(auth.uid()) then
    raise exception 'This account is inactive.';
  end if;

  if old.clock_out is not null then
    raise exception 'Closed time entries require admin edits.';
  end if;

  if new.user_id <> old.user_id
    or new.job_code_id is distinct from old.job_code_id
    or new.event_type <> old.event_type
    or new.clock_in <> old.clock_in
    or new.clock_in_lat is distinct from old.clock_in_lat
    or new.clock_in_lng is distinct from old.clock_in_lng
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
    or new.is_auto_clocked_out <> old.is_auto_clocked_out then
    raise exception 'Employees can only complete their own open punch flow.';
  end if;

  if new.clock_out is null and (
    new.clock_out_lat is distinct from old.clock_out_lat
    or new.clock_out_lng is distinct from old.clock_out_lng
  ) then
    raise exception 'Clock-out GPS can only be saved when clocking out.';
  end if;

  if new.edited_by is distinct from auth.uid() then
    raise exception 'Employee punch updates must identify the signed-in employee.';
  end if;

  return new;
end;
$function$;

create or replace function public.employee_clock_in(
  p_job_code_id uuid,
  p_clock_in_lat numeric default null,
  p_clock_in_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inserted_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if not exists (
    select 1 from public.job_codes
    where id = p_job_code_id and is_active and not is_archived
  ) then
    raise exception 'Choose an active job code.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), p_job_code_id, 'work', now(),
    p_clock_in_lat, p_clock_in_lng, '', auth.uid()
  )
  returning * into inserted_entry;

  return inserted_entry;
end;
$function$;

create or replace function public.employee_clock_out(
  p_entry_id uuid,
  p_notes text,
  p_clock_out_lat numeric default null,
  p_clock_out_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if btrim(coalesce(p_notes, '')) = '' then
    raise exception 'A shift note is required before clocking out.';
  end if;

  update public.time_entries
  set
    notes = btrim(p_notes),
    clock_out = now(),
    clock_out_lat = p_clock_out_lat,
    clock_out_lng = p_clock_out_lng,
    edited_by = auth.uid(),
    edited_at = now()
  where id = p_entry_id
    and user_id = auth.uid()
    and event_type = 'work'
    and clock_out is null
  returning * into updated_entry;

  if updated_entry.id is null then
    raise exception 'No open work entry found to clock out.';
  end if;

  return updated_entry;
end;
$function$;

create or replace function public.employee_start_break(
  p_job_code_id uuid,
  p_clock_in_lat numeric default null,
  p_clock_in_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inserted_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), p_job_code_id, 'break', now(),
    p_clock_in_lat, p_clock_in_lng, 'Break', auth.uid()
  )
  returning * into inserted_entry;

  return inserted_entry;
end;
$function$;

create or replace function public.employee_end_break(
  p_entry_id uuid,
  p_clock_out_lat numeric default null,
  p_clock_out_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  update public.time_entries
  set
    clock_out = now(),
    clock_out_lat = p_clock_out_lat,
    clock_out_lng = p_clock_out_lng,
    edited_by = auth.uid(),
    edited_at = now()
  where id = p_entry_id
    and user_id = auth.uid()
    and event_type = 'break'
    and clock_out is null
  returning * into updated_entry;

  if updated_entry.id is null then
    raise exception 'No open break entry found to end.';
  end if;

  return updated_entry;
end;
$function$;

create or replace function public.employee_switch_job(
  p_from_entry_id uuid,
  p_to_job_code_id uuid,
  p_clock_lat numeric default null,
  p_clock_lng numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  closed_entry public.time_entries%rowtype;
  opened_entry public.time_entries%rowtype;
  punch_time timestamptz := now();
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if not exists (
    select 1 from public.job_codes
    where id = p_to_job_code_id and is_active and not is_archived
  ) then
    raise exception 'Choose an active job code.';
  end if;

  update public.time_entries
  set
    clock_out = punch_time,
    clock_out_lat = p_clock_lat,
    clock_out_lng = p_clock_lng,
    edited_by = auth.uid(),
    edited_at = punch_time
  where id = p_from_entry_id
    and user_id = auth.uid()
    and event_type = 'work'
    and clock_out is null
  returning * into closed_entry;

  if closed_entry.id is null then
    raise exception 'No open work entry found to switch from.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), p_to_job_code_id, 'work', punch_time,
    p_clock_lat, p_clock_lng, '', auth.uid()
  )
  returning * into opened_entry;

  return jsonb_build_object(
    'closedEntry', to_jsonb(closed_entry),
    'openedEntry', to_jsonb(opened_entry)
  );
end;
$function$;

grant execute on function public.employee_clock_in(uuid, numeric, numeric) to authenticated;
grant execute on function public.employee_clock_out(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.employee_start_break(uuid, numeric, numeric) to authenticated;
grant execute on function public.employee_end_break(uuid, numeric, numeric) to authenticated;
grant execute on function public.employee_switch_job(uuid, uuid, numeric, numeric) to authenticated;

commit;
