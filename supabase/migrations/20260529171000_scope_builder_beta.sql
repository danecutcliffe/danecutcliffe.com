begin;

create table if not exists public.scope_builder_projects (
  id uuid primary key default gen_random_uuid(),
  job_site_id uuid not null references public.job_sites(id) on delete restrict,
  job_code_id uuid not null references public.job_codes(id) on delete restrict,
  title text not null,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scope_builder_projects_active_job_code_key
  on public.scope_builder_projects(job_code_id)
  where is_active;

create index if not exists scope_builder_projects_site_idx
  on public.scope_builder_projects(job_site_id, is_active);

create table if not exists public.scope_builder_sections (
  id uuid primary key default gen_random_uuid(),
  scope_builder_project_id uuid not null references public.scope_builder_projects(id) on delete cascade,
  title text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scope_builder_sections_active_title_key
  on public.scope_builder_sections(scope_builder_project_id, lower(btrim(title)))
  where is_active;

create index if not exists scope_builder_sections_project_sort_idx
  on public.scope_builder_sections(scope_builder_project_id, is_active, sort_order);

create table if not exists public.scope_builder_items (
  id uuid primary key default gen_random_uuid(),
  scope_builder_project_id uuid not null references public.scope_builder_projects(id) on delete cascade,
  scope_builder_section_id uuid not null references public.scope_builder_sections(id) on delete cascade,
  item_text text not null,
  sort_order integer not null,
  is_complete boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scope_builder_items_section_sort_idx
  on public.scope_builder_items(scope_builder_section_id, is_active, sort_order);

create unique index if not exists scope_builder_items_active_text_key
  on public.scope_builder_items(scope_builder_section_id, lower(btrim(item_text)))
  where is_active;

drop trigger if exists scope_builder_projects_touch_updated_at on public.scope_builder_projects;
create trigger scope_builder_projects_touch_updated_at
before update on public.scope_builder_projects
for each row execute function public.scope_touch_updated_at();

drop trigger if exists scope_builder_sections_touch_updated_at on public.scope_builder_sections;
create trigger scope_builder_sections_touch_updated_at
before update on public.scope_builder_sections
for each row execute function public.scope_touch_updated_at();

drop trigger if exists scope_builder_items_touch_updated_at on public.scope_builder_items;
create trigger scope_builder_items_touch_updated_at
before update on public.scope_builder_items
for each row execute function public.scope_touch_updated_at();

alter table public.scope_builder_projects enable row level security;
alter table public.scope_builder_sections enable row level security;
alter table public.scope_builder_items enable row level security;

drop policy if exists "Admins can manage beta scope builder projects" on public.scope_builder_projects;
create policy "Admins can manage beta scope builder projects"
on public.scope_builder_projects
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage beta scope builder sections" on public.scope_builder_sections;
create policy "Admins can manage beta scope builder sections"
on public.scope_builder_sections
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage beta scope builder items" on public.scope_builder_items;
create policy "Admins can manage beta scope builder items"
on public.scope_builder_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
