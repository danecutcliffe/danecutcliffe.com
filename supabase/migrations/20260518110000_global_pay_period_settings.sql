create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values (
  'pay_period',
  jsonb_build_object(
    'anchorStart', public.atlantic_week_start(now())::text,
    'lengthDays', 14
  )
)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_active on public.app_settings;
create policy app_settings_select_active on public.app_settings
  for select using (public.is_active_profile(auth.uid()) or public.is_admin());

drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert on public.app_settings
  for insert with check (public.is_admin());

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update using (public.is_admin()) with check (public.is_admin());

revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;

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
      and (entry_clock_in at time zone 'America/Halifax')::date between approval.week_start and approval.week_end
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
    raise exception 'This pay period has been approved. Ask an admin to unlock it before editing.';
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
