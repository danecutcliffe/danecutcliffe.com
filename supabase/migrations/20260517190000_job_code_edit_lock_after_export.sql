create or replace function public.guard_job_code_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin()
    and (
      new.name is distinct from old.name
      or new.job_site_id is distinct from old.job_site_id
    )
    and exists (
      select 1
      from public.time_entries entry
      join public.timesheet_approvals approval
        on approval.user_id = entry.user_id
       and (entry.clock_in at time zone 'America/Halifax')::date between approval.week_start and approval.week_end
       and approval.status = 'approved'
      where entry.job_code_id = old.id
    ) then
    raise exception 'Job codes used on approved/exported payroll periods cannot be renamed or moved. Archive this job code and create a new one.';
  end if;

  return new;
end;
$$;
