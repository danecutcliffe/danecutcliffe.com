begin;

create table if not exists public.scope_notion_databases (
  id uuid primary key default gen_random_uuid(),
  job_site_id uuid not null references public.job_sites(id) on delete cascade,
  notion_database_id text not null,
  notion_database_url text not null,
  notion_data_source_id text,
  title text not null,
  job_code_property_name text not null default 'Job Code',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scope_notion_databases_job_site_key
  on public.scope_notion_databases(job_site_id);

alter table public.scope_projects
  add column if not exists scope_notion_database_id uuid references public.scope_notion_databases(id),
  add column if not exists notion_data_source_id text,
  add column if not exists notion_title_property_name text not null default 'Name',
  add column if not exists notion_job_code_property_name text not null default 'Job Code',
  add column if not exists sync_status text,
  add column if not exists last_pushed_to_notion_at timestamptz,
  add column if not exists last_pulled_from_notion_at timestamptz;

drop trigger if exists scope_notion_databases_touch_updated_at on public.scope_notion_databases;
create trigger scope_notion_databases_touch_updated_at
before update on public.scope_notion_databases
for each row execute function public.scope_touch_updated_at();

alter table public.scope_notion_databases enable row level security;

drop policy if exists "Authenticated users can view active scope database mappings" on public.scope_notion_databases;
create policy "Authenticated users can view active scope database mappings"
on public.scope_notion_databases
for select
to authenticated
using (is_active and public.is_active_profile(auth.uid()));

drop policy if exists "Admins can manage scope database mappings" on public.scope_notion_databases;
create policy "Admins can manage scope database mappings"
on public.scope_notion_databases
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

with mapping as (
  insert into public.scope_notion_databases (
    job_site_id,
    notion_database_id,
    notion_database_url,
    notion_data_source_id,
    title,
    job_code_property_name,
    is_active,
    last_sync_status
  )
  values (
    '91cc0e81-779b-4853-b573-f0c7a328f9ee',
    'd828917e658d421893ac22cd25925f16',
    'https://www.notion.so/d828917e658d421893ac22cd25925f16',
    '4f1c210e-73bf-4e3e-82c6-fd4ee7ab589a',
    '356-358 Queen Street SOW',
    'Job Code',
    true,
    'linked'
  )
  on conflict (job_site_id)
  do update set
    notion_database_id = excluded.notion_database_id,
    notion_database_url = excluded.notion_database_url,
    notion_data_source_id = excluded.notion_data_source_id,
    title = excluded.title,
    job_code_property_name = excluded.job_code_property_name,
    is_active = true,
    last_sync_status = 'linked'
  returning id
)
update public.scope_projects p
set
  scope_notion_database_id = mapping.id,
  notion_page_id = '365c5996fcc6816d8239c2aa6da2e950',
  notion_url = 'https://www.notion.so/358-Upper-Unit-365c5996fcc6816d8239c2aa6da2e950',
  notion_data_source_id = '4f1c210e-73bf-4e3e-82c6-fd4ee7ab589a',
  notion_title_property_name = 'Name',
  notion_job_code_property_name = 'Job Code',
  title = '358 (Upper Unit)',
  property_name = '356-358 Queen St',
  unit_name = '358 (Upper Unit)',
  job_site_id = '91cc0e81-779b-4853-b573-f0c7a328f9ee',
  job_code_id = 'c44a072a-642d-4881-8c37-f26a6652d255',
  sync_status = 'notion-linked',
  last_pulled_from_notion_at = now(),
  source_synced_at = now()
from mapping
where p.job_code_id = 'c44a072a-642d-4881-8c37-f26a6652d255'
   or (p.notion_page_id = '328c5996fcc680598b28e4e6e768e9d3' and p.unit_name in ('358 Upper Unit', '358 (Upper Unit)'));

commit;
