-- Allow admins to delete time entries.
create policy time_entries_delete_admin
  on public.time_entries
  for delete using (public.is_admin());
