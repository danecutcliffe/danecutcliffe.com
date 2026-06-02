begin;

-- Employee punch flow is not a timesheet edit. Preserve true admin/manual edit
-- metadata, but strip self-edit metadata from normal open-entry punch updates so
-- stale clients cannot make clock-outs, break endings, or required notes appear edited.

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
    if new.edited_by is not distinct from auth.uid() then
      new.edited_by := old.edited_by;
      new.edited_at := old.edited_at;
    else
      raise exception 'Only admins can set employee edit metadata.';
    end if;
  end if;

  return new;
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
  and edited_by = user_id;

alter table public.time_entries enable trigger time_entries_audit;
alter table public.time_entries enable trigger time_entries_touch_updated_at;
alter table public.time_entries enable trigger time_entries_guard_update;

commit;
