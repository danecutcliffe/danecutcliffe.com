begin;

alter table public.scope_items
  add column if not exists notion_block_id text,
  add column if not exists notion_parent_block_id text,
  add column if not exists notion_checked boolean not null default false,
  add column if not exists last_pulled_from_notion_at timestamptz,
  add column if not exists last_pushed_to_notion_at timestamptz,
  add column if not exists sync_status text;

create unique index if not exists scope_items_project_notion_block_key
  on public.scope_items(scope_project_id, notion_block_id)
  where notion_block_id is not null;

create table if not exists public.scope_notion_webhook_events (
  id uuid primary key default gen_random_uuid(),
  notion_event_id text unique,
  event_type text not null,
  entity_type text,
  entity_id text,
  notion_database_id text,
  notion_data_source_id text,
  status text not null default 'received',
  message text,
  verification_token text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.scope_notion_webhook_events enable row level security;

drop policy if exists "Admins can view scope notion webhook events" on public.scope_notion_webhook_events;
create policy "Admins can view scope notion webhook events"
on public.scope_notion_webhook_events
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can delete scope notion webhook events" on public.scope_notion_webhook_events;
create policy "Admins can delete scope notion webhook events"
on public.scope_notion_webhook_events
for delete
to authenticated
using (public.is_admin());

commit;
