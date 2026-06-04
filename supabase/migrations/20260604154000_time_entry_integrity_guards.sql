begin;

-- Lock approved payroll periods against all time-entry mutations and reject
-- overlapping closed work intervals going forward. Admin corrections remain
-- possible after unlocking the period and when the corrected interval is valid.

create or replace function public.has_closed_work_overlap(
  candidate_id uuid,
  candidate_user_id uuid,
  candidate_event_type public.time_event_type,
  candidate_clock_in timestamptz,
  candidate_clock_out timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select candidate_event_type = 'work'
    and candidate_clock_out is not null
    and exists (
      select 1
      from public.time_entries existing
      where existing.user_id = candidate_user_id
        and existing.id is distinct from candidate_id
        and existing.event_type = 'work'
        and candidate_clock_in < coalesce(existing.clock_out, 'infinity'::timestamptz)
        and existing.clock_in < candidate_clock_out
    )
$function$;

create or replace function public.time_entry_touches_approved_period(
  entry_user_id uuid,
  entry_clock_in timestamptz,
  entry_clock_out timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.timesheet_approvals approval
    where approval.user_id = entry_user_id
      and approval.status = 'approved'
      and daterange(approval.week_start, approval.week_end + 1, '[)') &&
        daterange(
          least(
            (entry_clock_in at time zone 'America/Halifax')::date,
            (coalesce(entry_clock_out, entry_clock_in) at time zone 'America/Halifax')::date
          ),
          greatest(
            (entry_clock_in at time zone 'America/Halifax')::date,
            (coalesce(entry_clock_out, entry_clock_in) at time zone 'America/Halifax')::date
          ) + 1,
          '[)'
        )
  )
$function$;

create or replace function public.guard_time_entry_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.time_entry_touches_approved_period(new.user_id, new.clock_in, new.clock_out) then
    raise exception 'This pay period has been approved. Unlock it before adding time entries.';
  end if;

  if public.has_closed_work_overlap(new.id, new.user_id, new.event_type, new.clock_in, new.clock_out) then
    raise exception 'This work entry overlaps another closed work entry for the same employee.';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_time_entry_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.time_entry_touches_approved_period(old.user_id, old.clock_in, old.clock_out)
    or public.time_entry_touches_approved_period(new.user_id, new.clock_in, new.clock_out) then
    raise exception 'This pay period has been approved. Unlock it before editing time entries.';
  end if;

  if public.is_admin() then
    if public.has_closed_work_overlap(new.id, new.user_id, new.event_type, new.clock_in, new.clock_out) then
      raise exception 'This work entry overlaps another closed work entry for the same employee.';
    end if;
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

  if new.edited_by is distinct from old.edited_by
    or new.edited_at is distinct from old.edited_at then
    if new.edited_by is not distinct from auth.uid() then
      new.edited_by := old.edited_by;
      new.edited_at := old.edited_at;
    else
      raise exception 'Only admins can set employee edit metadata.';
    end if;
  end if;

  if public.has_closed_work_overlap(new.id, new.user_id, new.event_type, new.clock_in, new.clock_out) then
    raise exception 'This work entry overlaps another closed work entry for the same employee.';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_time_entry_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.time_entry_touches_approved_period(old.user_id, old.clock_in, old.clock_out) then
    raise exception 'This pay period has been approved. Unlock it before deleting time entries.';
  end if;

  return old;
end;
$function$;

drop trigger if exists time_entries_guard_insert on public.time_entries;
create trigger time_entries_guard_insert
  before insert on public.time_entries
  for each row execute function public.guard_time_entry_insert();

drop trigger if exists time_entries_guard_delete on public.time_entries;
create trigger time_entries_guard_delete
  before delete on public.time_entries
  for each row execute function public.guard_time_entry_delete();

commit;
