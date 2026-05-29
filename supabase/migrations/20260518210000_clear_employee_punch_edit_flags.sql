begin;

-- Backfill historical punch-flow artifacts. Employee self-updates happen during
-- normal clock-out, break-end, note-at-clock-out, and job-switch flows. Those
-- should not be presented as admin/manual timecard edits.
--
-- Preserve true admin/manual corrections where edited_by differs from user_id.
alter table public.time_entries disable trigger time_entries_guard_update;
alter table public.time_entries disable trigger time_entries_touch_updated_at;
alter table public.time_entries disable trigger time_entries_audit;

update public.time_entries
set
  edited_by = null,
  edited_at = null
where edited_by is not null
  and edited_by = user_id;

alter table public.time_entries enable trigger time_entries_audit;
alter table public.time_entries enable trigger time_entries_touch_updated_at;
alter table public.time_entries enable trigger time_entries_guard_update;

commit;
