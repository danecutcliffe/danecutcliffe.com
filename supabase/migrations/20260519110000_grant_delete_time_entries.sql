-- Grant DELETE privilege on time_entries to the authenticated role.
-- The RLS policy (time_entries_delete_admin) restricts this to admins,
-- but the table-level GRANT was missing, causing "permission denied".
grant delete on public.time_entries to authenticated;
