create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('employee', 'manager', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.time_event_type as enum ('work', 'break');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  role public.app_role not null default 'employee',
  hourly_rate numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_codes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  job_code_id uuid references public.job_codes(id) on delete restrict,
  event_type public.time_event_type not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  clock_in_lat numeric(10, 7),
  clock_in_lng numeric(10, 7),
  clock_out_lat numeric(10, 7),
  clock_out_lng numeric(10, 7),
  notes text default '',
  is_auto_clocked_out boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_clock_order check (clock_out is null or clock_out > clock_in),
  constraint time_entries_work_requires_job check (event_type = 'break' or job_code_id is not null)
);

create table if not exists public.timesheet_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  status public.approval_status not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timesheet_approvals_week_order check (week_end >= week_start),
  constraint timesheet_approvals_unique_week unique (user_id, week_start)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists job_codes_active_idx on public.job_codes(is_active);
create index if not exists time_entries_user_clock_in_idx on public.time_entries(user_id, clock_in desc);
create index if not exists time_entries_job_clock_in_idx on public.time_entries(job_code_id, clock_in desc);
create index if not exists time_entries_open_idx on public.time_entries(user_id, event_type) where clock_out is null;
create unique index if not exists time_entries_one_open_work_idx on public.time_entries(user_id) where event_type = 'work' and clock_out is null;
create unique index if not exists time_entries_one_open_break_idx on public.time_entries(user_id) where event_type = 'break' and clock_out is null;
create index if not exists audit_log_target_idx on public.audit_log(target_table, target_id, created_at desc);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('manager', 'admin'), false)
$$;

create or replace function public.is_active_profile(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = profile_id), false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
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

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_target_id uuid;
begin
  audit_target_id = coalesce(new.id, old.id);

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    audit_target_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists job_codes_touch_updated_at on public.job_codes;
create trigger job_codes_touch_updated_at before update on public.job_codes for each row execute function public.touch_updated_at();

drop trigger if exists time_entries_touch_updated_at on public.time_entries;
create trigger time_entries_touch_updated_at before update on public.time_entries for each row execute function public.touch_updated_at();

drop trigger if exists timesheet_approvals_touch_updated_at on public.timesheet_approvals;
create trigger timesheet_approvals_touch_updated_at before update on public.timesheet_approvals for each row execute function public.touch_updated_at();

drop trigger if exists time_entries_guard_update on public.time_entries;
create trigger time_entries_guard_update before update on public.time_entries for each row execute function public.guard_time_entry_update();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function public.write_audit_log();

drop trigger if exists job_codes_audit on public.job_codes;
create trigger job_codes_audit after insert or update or delete on public.job_codes for each row execute function public.write_audit_log();

drop trigger if exists time_entries_audit on public.time_entries;
create trigger time_entries_audit after insert or update or delete on public.time_entries for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.job_codes enable row level security;
alter table public.time_entries enable row level security;
alter table public.timesheet_approvals enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_manager_or_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert with check (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists job_codes_select_active_or_admin on public.job_codes;
create policy job_codes_select_active_or_admin on public.job_codes
  for select using ((is_active and public.is_active_profile(auth.uid())) or public.is_manager_or_admin());

drop policy if exists job_codes_admin_insert on public.job_codes;
create policy job_codes_admin_insert on public.job_codes
  for insert with check (public.is_admin());

drop policy if exists job_codes_admin_update on public.job_codes;
create policy job_codes_admin_update on public.job_codes
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists time_entries_select_own_or_admin on public.time_entries;
create policy time_entries_select_own_or_admin on public.time_entries
  for select using ((user_id = auth.uid() and public.is_active_profile(auth.uid())) or public.is_manager_or_admin());

drop policy if exists time_entries_insert_own_or_admin on public.time_entries;
create policy time_entries_insert_own_or_admin on public.time_entries
  for insert with check (
    (
      user_id = auth.uid()
      and created_by = auth.uid()
      and public.is_active_profile(auth.uid())
      and clock_out is null
    )
    or public.is_admin()
  );

drop policy if exists time_entries_update_own_or_admin on public.time_entries;
create policy time_entries_update_own_or_admin on public.time_entries
  for update using ((user_id = auth.uid() and public.is_active_profile(auth.uid())) or public.is_admin())
  with check ((user_id = auth.uid() and public.is_active_profile(auth.uid())) or public.is_admin());

drop policy if exists timesheet_approvals_select_own_or_admin on public.timesheet_approvals;
create policy timesheet_approvals_select_own_or_admin on public.timesheet_approvals
  for select using ((user_id = auth.uid() and public.is_active_profile(auth.uid())) or public.is_manager_or_admin());

drop policy if exists timesheet_approvals_admin_insert on public.timesheet_approvals;
create policy timesheet_approvals_admin_insert on public.timesheet_approvals
  for insert with check (public.is_admin());

drop policy if exists timesheet_approvals_admin_update on public.timesheet_approvals;
create policy timesheet_approvals_admin_update on public.timesheet_approvals
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select using (public.is_admin());

revoke all on public.profiles from anon, authenticated;
revoke all on public.job_codes from anon, authenticated;
revoke all on public.time_entries from anon, authenticated;
revoke all on public.timesheet_approvals from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.job_codes to authenticated;
grant select, insert, update on public.time_entries to authenticated;
grant select, insert, update on public.timesheet_approvals to authenticated;
grant select on public.audit_log to authenticated;
