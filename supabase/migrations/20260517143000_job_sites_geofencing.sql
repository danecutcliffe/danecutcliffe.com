create table if not exists public.job_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geofence_radius_meters integer not null default 250 check (geofence_radius_meters >= 25 and geofence_radius_meters <= 5000),
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_codes
  add column if not exists job_site_id uuid references public.job_sites(id) on delete restrict;

create index if not exists job_sites_active_archived_idx on public.job_sites(is_active, is_archived);
create index if not exists job_codes_job_site_idx on public.job_codes(job_site_id);

drop trigger if exists job_sites_touch_updated_at on public.job_sites;
create trigger job_sites_touch_updated_at before update on public.job_sites for each row execute function public.touch_updated_at();

drop trigger if exists job_sites_audit on public.job_sites;
create trigger job_sites_audit after insert or update or delete on public.job_sites for each row execute function public.write_audit_log();

alter table public.job_sites enable row level security;

drop policy if exists job_sites_select_active_or_admin on public.job_sites;
create policy job_sites_select_active_or_admin on public.job_sites
  for select using (
    (is_active and not is_archived and public.is_active_profile(auth.uid()))
    or public.is_manager_or_admin()
  );

drop policy if exists job_sites_admin_insert on public.job_sites;
create policy job_sites_admin_insert on public.job_sites
  for insert with check (public.is_admin());

drop policy if exists job_sites_admin_update on public.job_sites;
create policy job_sites_admin_update on public.job_sites
  for update using (public.is_admin()) with check (public.is_admin());

revoke all on public.job_sites from anon, authenticated;
grant select, insert, update on public.job_sites to authenticated;

create or replace function public.guard_job_code_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin()
    and exists (
      select 1
      from public.time_entries
      where job_code_id = old.id
    )
    and (
      new.name is distinct from old.name
      or new.job_site_id is distinct from old.job_site_id
    ) then
    raise exception 'Job codes used on time records cannot be renamed or moved. Archive this job code and create a new one.';
  end if;

  return new;
end;
$$;

drop trigger if exists job_codes_guard_update on public.job_codes;
create trigger job_codes_guard_update before update on public.job_codes for each row execute function public.guard_job_code_update();
