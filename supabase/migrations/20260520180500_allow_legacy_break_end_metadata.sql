begin;

-- Some already-cached employee clients can still send edited_by without
-- edited_at while ending a break. Treat that as old punch-flow metadata noise:
-- preserve the previous edit metadata and let the employee finish the break.

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
    if new.edited_by is not distinct from auth.uid() and new.edited_at is null then
      new.edited_by := old.edited_by;
      new.edited_at := old.edited_at;
    elsif new.edited_by is distinct from auth.uid() or new.edited_at is null then
      raise exception 'Employee edit metadata must identify the signed-in employee.';
    end if;
  end if;

  return new;
end;
$function$;

commit;
