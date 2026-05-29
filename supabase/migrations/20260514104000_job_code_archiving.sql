alter table public.job_codes
  add column if not exists is_archived boolean not null default false;

create index if not exists job_codes_archived_idx on public.job_codes(is_archived);

drop policy if exists job_codes_select_active_or_admin on public.job_codes;
create policy job_codes_select_active_or_admin on public.job_codes
  for select using (
    (is_active and not is_archived and public.is_active_profile(auth.uid()))
    or public.is_manager_or_admin()
  );
