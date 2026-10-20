-- Supabase stops auto-granting Data API access to new public tables on
-- 2026-10-30. These tables relied on that default, so a rebuild from migrations
-- (fresh staging, preview branch, local reset) would leave them unreachable.
-- This records the grants production already has (verified 2026-10-20).
-- Row-level security still decides who can use each table. anon is
-- intentionally not granted: no table here needs anonymous access.
-- Every new public table migration must include its own grants.

-- Scope tables: read/write through the API, limited by RLS policies.
grant select, insert, update, delete on
  public.scope_projects,
  public.scope_sections,
  public.scope_items,
  public.scope_notion_databases,
  public.scope_notion_webhook_events,
  public.scope_section_sync_state,
  public.scope_builder_projects,
  public.scope_builder_sections,
  public.scope_builder_items
to authenticated;

grant all on
  public.scope_projects,
  public.scope_sections,
  public.scope_items,
  public.scope_notion_databases,
  public.scope_notion_webhook_events,
  public.scope_section_sync_state,
  public.scope_builder_projects,
  public.scope_builder_sections,
  public.scope_builder_items
to service_role;

-- Lease tables: authenticated stays read-only (granted in
-- 20260919170510_lease_portfolio_data_layer.sql; writes go through admin RPCs).
-- Only the backend service role grant was implicit.
grant all on
  public.lease_dataset_state,
  public.lease_entities,
  public.lease_buildings,
  public.lease_standard_options,
  public.lease_units,
  public.lease_unit_included_options,
  public.lease_unit_responsibility_options,
  public.lease_global_defaults,
  public.lease_backups,
  public.lease_import_history
to service_role;
