create or replace function public.normalize_job_code(raw_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(raw_code, ''), '[^A-Z0-9]', '', 'g'))
$$;

create or replace function public.assign_job_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  sequence_number integer := 1;
  candidate text;
begin
  if new.code is not null and btrim(new.code) <> '' then
    new.code = public.normalize_job_code(new.code);
    if new.code !~ '^[A-Z]{2}[0-9]{4}$' then
      raise exception 'Job code must use two letters followed by four digits.';
    end if;
    return new;
  end if;

  prefix = public.job_code_prefix(new.name);

  loop
    candidate = prefix || lpad(sequence_number::text, 4, '0');
    exit when not exists (select 1 from public.job_codes where code = candidate and id is distinct from new.id);
    sequence_number = sequence_number + 1;
  end loop;

  new.code = candidate;
  return new;
end;
$$;

drop trigger if exists job_codes_assign_code on public.job_codes;
create trigger job_codes_assign_code
  before insert or update of code on public.job_codes
  for each row execute function public.assign_job_code();

alter table public.job_codes
  drop constraint if exists job_codes_code_format;

alter table public.job_codes
  add constraint job_codes_code_format check (code ~ '^[A-Z]{2}[0-9]{4}$');

create or replace function public.atlantic_week_start(at_time timestamptz)
returns date
language sql
stable
as $$
  select (
    ((at_time at time zone 'America/Halifax')::date)
    - (((extract(dow from (at_time at time zone 'America/Halifax')::date)::int + 6) % 7) * interval '1 day')
  )::date
$$;

create or replace function public.is_timesheet_week_approved(entry_user_id uuid, entry_clock_in timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.timesheet_approvals approval
    where approval.user_id = entry_user_id
      and approval.week_start = public.atlantic_week_start(entry_clock_in)
      and approval.status = 'approved'
  )
$$;

create or replace function public.guard_time_entry_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.user_id <> auth.uid() then
    raise exception 'Only admins can edit another employee time entry.';
  end if;

  if (old.clock_in at time zone 'America/Halifax')::date < (now() at time zone 'America/Halifax')::date
    and public.is_timesheet_week_approved(old.user_id, old.clock_in) then
    raise exception 'This week has been approved. Ask an admin to unlock it before editing.';
  end if;

  if new.user_id <> old.user_id
    or new.job_code_id is distinct from old.job_code_id
    or new.event_type <> old.event_type
    or new.clock_in <> old.clock_in
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
    or new.is_auto_clocked_out <> old.is_auto_clocked_out then
    raise exception 'Employees can only add notes, clock-out data, and edit metadata.';
  end if;

  if old.clock_out is not null and new.clock_out is distinct from old.clock_out then
    raise exception 'Closed time entries require admin edits.';
  end if;

  if new.edited_by is distinct from auth.uid() then
    raise exception 'Employee edits must identify the signed-in employee.';
  end if;

  return new;
end;
$$;

create or replace function public.write_timesheet_approval_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_action text;
begin
  audit_action = case
    when new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then 'timesheet_approved'
    when tg_op = 'UPDATE' and old.status = 'approved' and new.status is distinct from 'approved' then 'timesheet_unapproved'
    else 'timesheet_approval_updated'
  end;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    audit_action,
    'timesheet_approvals',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists timesheet_approvals_audit on public.timesheet_approvals;
create trigger timesheet_approvals_audit
  after insert or update on public.timesheet_approvals
  for each row execute function public.write_timesheet_approval_audit_log();
