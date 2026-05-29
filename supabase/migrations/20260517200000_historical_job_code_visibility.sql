drop policy if exists job_codes_select_active_or_admin on public.job_codes;
create policy job_codes_select_active_or_admin on public.job_codes
  for select using (
    ((is_active and not is_archived) and public.is_active_profile(auth.uid()))
    or public.is_manager_or_admin()
    or exists (
      select 1
      from public.time_entries entry
      where entry.job_code_id = job_codes.id
        and entry.user_id = auth.uid()
    )
  );

drop policy if exists job_sites_select_active_or_admin on public.job_sites;
create policy job_sites_select_active_or_admin on public.job_sites
  for select using (
    ((is_active and not is_archived) and public.is_active_profile(auth.uid()))
    or public.is_manager_or_admin()
    or exists (
      select 1
      from public.time_entries entry
      join public.job_codes code on code.id = entry.job_code_id
      where entry.user_id = auth.uid()
        and code.job_site_id = job_sites.id
    )
  );
