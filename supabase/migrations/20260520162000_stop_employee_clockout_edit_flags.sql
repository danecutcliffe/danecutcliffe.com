begin;

-- Normal employee punch flow is not a timesheet edit. Employees can close
-- their own open entries and save the required shift note without setting
-- edited_by / edited_at. Admin/manual corrections still set edit metadata.

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

  if new.edited_by is distinct from old.edited_by
    or new.edited_at is distinct from old.edited_at then
    if new.edited_by is distinct from auth.uid() or new.edited_at is null then
      raise exception 'Employee edit metadata must identify the signed-in employee.';
    end if;
  end if;

  return new;
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
    clock_out_lng = p_clock_out_lng
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
    clock_out_lng = p_clock_out_lng
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

alter table public.time_entries disable trigger time_entries_guard_update;
alter table public.time_entries disable trigger time_entries_touch_updated_at;
alter table public.time_entries disable trigger time_entries_audit;

update public.time_entries
set
  edited_by = null,
  edited_at = null
where edited_by is not null
  and edited_by = user_id
  and (
    edited_at is not null
    or edited_by is not null
  );

alter table public.time_entries enable trigger time_entries_audit;
alter table public.time_entries enable trigger time_entries_touch_updated_at;
alter table public.time_entries enable trigger time_entries_guard_update;

commit;
