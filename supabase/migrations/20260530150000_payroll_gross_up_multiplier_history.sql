-- Effective-dated payroll gross-up multiplier history.
-- The multiplier applied to a work entry is the one whose effective_date is the
-- latest on or before that entry's Atlantic work date. Back-dating is allowed,
-- so past/already-accrued reporting reflects the multiplier in effect at the time.

create table if not exists public.payroll_gross_up_multipliers (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null unique,
  multiplier numeric not null check (multiplier >= 1),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payroll_gross_up_multipliers enable row level security;

drop policy if exists payroll_gross_up_select_active on public.payroll_gross_up_multipliers;
create policy payroll_gross_up_select_active on public.payroll_gross_up_multipliers
  for select using (public.is_active_profile(auth.uid()) or public.is_admin());

drop policy if exists payroll_gross_up_admin_insert on public.payroll_gross_up_multipliers;
create policy payroll_gross_up_admin_insert on public.payroll_gross_up_multipliers
  for insert with check (public.is_admin());

drop policy if exists payroll_gross_up_admin_update on public.payroll_gross_up_multipliers;
create policy payroll_gross_up_admin_update on public.payroll_gross_up_multipliers
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists payroll_gross_up_admin_delete on public.payroll_gross_up_multipliers;
create policy payroll_gross_up_admin_delete on public.payroll_gross_up_multipliers
  for delete using (public.is_admin());

revoke all on public.payroll_gross_up_multipliers from anon, authenticated;
grant select, insert, update, delete on public.payroll_gross_up_multipliers to authenticated;

-- Seed a baseline row from the existing global setting so all historical entries
-- resolve to a multiplier. Effective from the configured pay-period anchor start.
insert into public.payroll_gross_up_multipliers (effective_date, multiplier)
select
  coalesce((value->>'anchorStart')::date, current_date),
  coalesce((value->>'laborCostMultiplier')::numeric, 1.25)
from public.app_settings
where key = 'pay_period'
on conflict (effective_date) do nothing;

-- Fallback baseline if there is no pay_period settings row at all.
insert into public.payroll_gross_up_multipliers (effective_date, multiplier)
select current_date, 1.25
where not exists (select 1 from public.payroll_gross_up_multipliers);
