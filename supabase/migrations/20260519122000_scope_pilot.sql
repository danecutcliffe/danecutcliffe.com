begin;

create table if not exists public.scope_projects (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null,
  notion_url text not null,
  title text not null,
  property_name text not null,
  unit_name text not null,
  job_site_id uuid references public.job_sites(id),
  job_code_id uuid references public.job_codes(id),
  is_active boolean not null default true,
  source_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scope_projects_notion_unit_key
  on public.scope_projects(notion_page_id, unit_name);

create table if not exists public.scope_items (
  id uuid primary key default gen_random_uuid(),
  scope_project_id uuid not null references public.scope_projects(id) on delete cascade,
  section text not null,
  item_text text not null,
  sort_order integer not null,
  source text not null default 'notion',
  created_by uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scope_items_project_section_text_key
  on public.scope_items(scope_project_id, section, item_text);

create index if not exists scope_items_project_sort_idx
  on public.scope_items(scope_project_id, sort_order);

create or replace function public.scope_touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists scope_projects_touch_updated_at on public.scope_projects;
create trigger scope_projects_touch_updated_at
before update on public.scope_projects
for each row execute function public.scope_touch_updated_at();

drop trigger if exists scope_items_touch_updated_at on public.scope_items;
create trigger scope_items_touch_updated_at
before update on public.scope_items
for each row execute function public.scope_touch_updated_at();

alter table public.scope_projects enable row level security;
alter table public.scope_items enable row level security;

drop policy if exists "Authenticated users can view active scope projects" on public.scope_projects;
create policy "Authenticated users can view active scope projects"
on public.scope_projects
for select
to authenticated
using (is_active and public.is_active_profile(auth.uid()));

drop policy if exists "Admins can manage scope projects" on public.scope_projects;
create policy "Admins can manage scope projects"
on public.scope_projects
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can view active scope items" on public.scope_items;
create policy "Authenticated users can view active scope items"
on public.scope_items
for select
to authenticated
using (
  is_active
  and public.is_active_profile(auth.uid())
  and exists (
    select 1
    from public.scope_projects p
    where p.id = scope_project_id
      and p.is_active
  )
);

drop policy if exists "Admins can manage scope items" on public.scope_items;
create policy "Admins can manage scope items"
on public.scope_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.scope_toggle_item(
  p_item_id uuid,
  p_completed boolean
)
returns public.scope_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_item public.scope_items%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if not public.is_admin()
    and not exists (
      select 1
      from public.scope_items i
      join public.scope_projects p on p.id = i.scope_project_id
      join public.time_entries te on te.job_code_id = p.job_code_id
      where i.id = p_item_id
        and p.is_active
        and te.user_id = auth.uid()
        and te.event_type = 'work'
        and te.clock_out is null
    ) then
    raise exception 'Clock into this job before updating scope items.';
  end if;

  update public.scope_items i
  set
    completed_by = case when p_completed then auth.uid() else null end,
    completed_at = case when p_completed then now() else null end
  where i.id = p_item_id
    and i.is_active
    and exists (
      select 1
      from public.scope_projects p
      where p.id = i.scope_project_id
        and p.is_active
    )
  returning * into updated_item;

  if updated_item.id is null then
    raise exception 'Scope item not found.';
  end if;

  return updated_item;
end;
$function$;

create or replace function public.scope_add_item(
  p_scope_project_id uuid,
  p_section text,
  p_item_text text
)
returns public.scope_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inserted_item public.scope_items%rowtype;
  next_sort integer;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if btrim(coalesce(p_item_text, '')) = '' then
    raise exception 'Item text is required.';
  end if;

  if not exists (
    select 1
    from public.scope_projects
    where id = p_scope_project_id
      and is_active
  ) then
    raise exception 'Scope project not found.';
  end if;

  if not public.is_admin()
    and not exists (
      select 1
      from public.scope_projects p
      join public.time_entries te on te.job_code_id = p.job_code_id
      where p.id = p_scope_project_id
        and p.is_active
        and te.user_id = auth.uid()
        and te.event_type = 'work'
        and te.clock_out is null
    ) then
    raise exception 'Clock into this job before adding scope items.';
  end if;

  select coalesce(max(sort_order), 0) + 10
  into next_sort
  from public.scope_items
  where scope_project_id = p_scope_project_id
    and section = coalesce(nullif(btrim(p_section), ''), 'Added on site');

  insert into public.scope_items (
    scope_project_id,
    section,
    item_text,
    sort_order,
    source,
    created_by
  )
  values (
    p_scope_project_id,
    coalesce(nullif(btrim(p_section), ''), 'Added on site'),
    btrim(p_item_text),
    next_sort,
    'employee',
    auth.uid()
  )
  returning * into inserted_item;

  return inserted_item;
end;
$function$;

grant execute on function public.scope_toggle_item(uuid, boolean) to authenticated;
grant execute on function public.scope_add_item(uuid, text, text) to authenticated;

with project as (
  insert into public.scope_projects (
    notion_page_id,
    notion_url,
    title,
    property_name,
    unit_name,
    job_site_id,
    job_code_id,
    source_synced_at
  )
  values (
    '328c5996fcc680598b28e4e6e768e9d3',
    'https://www.notion.so/356-358-Queen-St-Notes-328c5996fcc680598b28e4e6e768e9d3',
    '356-358 Queen St. Notes',
    '356-358 Queen St',
    '358 Upper Unit',
    '91cc0e81-779b-4853-b573-f0c7a328f9ee',
    'c44a072a-642d-4881-8c37-f26a6652d255',
    now()
  )
  on conflict (notion_page_id, unit_name)
  do update set
    notion_url = excluded.notion_url,
    title = excluded.title,
    property_name = excluded.property_name,
    job_site_id = excluded.job_site_id,
    job_code_id = excluded.job_code_id,
    is_active = true,
    source_synced_at = now()
  returning id
),
seed(section, sort_order, item_text) as (
  values
  ('All Rooms', 10, $$Complete remaining demolition and dispose of all debris and materials.$$),
  ('All Rooms', 20, $$Strip old wall hardware, curtain rods, blinds, fasteners and miscellaneous abandoned items as required.$$),
  ('All Rooms', 30, $$Remove all electrical face plates prior to wall preparation and paint work.$$),
  ('All Rooms', 40, $$Apply disinfectant to subfloor areas affected by cat urine.$$),
  ('All Rooms', 50, $$Apply BIN or equivalent primer to affected subfloor areas to contain odour prior to flooring prep.$$),
  ('All Rooms', 60, $$Smooth and level existing subfloors throughout as required so new flooring can be installed without subfloor irregularities telegraphing through.$$),
  ('All Rooms', 70, $$Install new insulation and vapour barrier at exposed or uninsulated exterior wall areas.$$),
  ('All Rooms', 80, $$Remove existing hot water baseboard heaters throughout after the heating system has been drained down and made safe.$$),
  ('All Rooms', 90, $$Replace existing plumbing infrastructure throughout the unit, including new discrete hot water lines as required to isolate water heaters between units.$$),
  ('All Rooms', 100, $$Replace wooden windows with vinyl inserts in all applicable rooms, excluding the small bedroom where a vinyl window is already present.$$),
  ('All Rooms', 110, $$Caulk replacement windows from the exterior and spray foam from the interior.$$),
  ('All Rooms', 120, $$Prep all walls, ceilings, trims, doors and closets for paint.$$),
  ('All Rooms', 130, $$Paint walls, ceilings, trims, doors, closets and all associated finish surfaces as required.$$),
  ('All Rooms', 140, $$Install finish electrical fixtures, receptacles, switches and face plates throughout as required.$$),
  ('All Rooms', 150, $$Install all required transitions, finish trims and final touch ups.$$),
  ('All Rooms', 160, $$Final clean.$$),
  ('Stairs / Entry', 210, $$Carefully remove existing railing, balusters and newel posts at the stairs.$$),
  ('Stairs / Entry', 220, $$Carefully remove existing stair treads and risers, taking all necessary precautions to avoid lead paint contamination.$$),
  ('Stairs / Entry', 230, $$Install temporary plywood stair treads or equivalent safe temporary stair surface after demolition.$$),
  ('Stairs / Entry', 240, $$Remove existing linoleum flooring in the entryway.$$),
  ('Stairs / Entry', 250, $$Level the entry floor so flooring can run continuously across the original threshold from the front entry into the hallway without a bump or lip.$$),
  ('Stairs / Entry', 260, $$Repair cracks on the wall to the right of the stairs, including FibaFuse installation and skim coating as required.$$),
  ('Stairs / Entry', 270, $$Install new stair treads and risers, ensuring the stair assembly is leveled during installation.$$),
  ('Stairs / Entry', 280, $$Install new railings, newel posts, balusters, scuff boards and associated trims.$$),
  ('Stairs / Entry', 290, $$Install appropriate bullnose transition at the top of the stairs where the stairs meet the upper floor.$$),
  ('Stairs / Entry', 300, $$Prep and paint entry walls, ceiling, trims, closet, doors and related finish surfaces.$$),
  ('Stairs / Entry', 310, $$Install finish door hardware and closet hardware as required.$$),
  ('Stairs / Entry', 320, $$Final clean.$$),
  ('Bathroom', 410, $$Complete bathroom demolition and dispose of all debris and materials.$$),
  ('Bathroom', 420, $$Remove existing hot water baseboard heater after the heating system has been drained down and made safe.$$),
  ('Bathroom', 430, $$Demolish existing chimney beginning from the attic and continuing through the bathroom area as required.$$),
  ('Bathroom', 440, $$Patch and rectify framing and floor areas affected by chimney removal.$$),
  ('Bathroom', 450, $$Install new window on the back wall and complete any required framing repairs at the time of installation.$$),
  ('Bathroom', 460, $$Level bathroom floor, including sleepers and new subfloor as required.$$),
  ('Bathroom', 470, $$Rough in plumbing for the new tub or shower location, vanity, toilet and related fixtures.$$),
  ('Bathroom', 480, $$Rough in electrical for new vanity location, lighting, fan and required bathroom fixtures.$$),
  ('Bathroom', 490, $$Insulate exterior walls and install vapour barrier where required.$$),
  ('Bathroom', 500, $$Install new drywall, tape and fill to paint-ready condition.$$),
  ('Bathroom', 510, $$Install new shower base or tub.$$),
  ('Bathroom', 520, $$Install new shower surround around the window opening.$$),
  ('Bathroom', 530, $$Install PVC trim around the bathroom window.$$),
  ('Bathroom', 540, $$Install new bathroom flooring and transition to hallway after floor heights are finalized.$$),
  ('Bathroom', 550, $$Prep and paint walls, ceiling, trims and door.$$),
  ('Bathroom', 560, $$Install new vanity.$$),
  ('Bathroom', 570, $$Install new toilet.$$),
  ('Bathroom', 580, $$Install new mirror.$$),
  ('Bathroom', 590, $$Install finish plumbing fixtures.$$),
  ('Bathroom', 600, $$Install finish electrical fixtures, outlets, switches, lighting and face plates.$$),
  ('Bathroom', 610, $$Install bathroom hardware and all remaining finish items.$$),
  ('Bathroom', 620, $$Final clean.$$),
  ('Kitchen', 710, $$Complete remaining kitchen demolition and dispose of all debris and materials.$$),
  ('Kitchen', 720, $$Rough in new plumbing according to the kitchen plans.$$),
  ('Kitchen', 730, $$Rough in new electrical according to the kitchen plans, including under-cabinet lighting and switching as required.$$),
  ('Kitchen', 740, $$Replace existing electrical panel > 100A upgrade.$$),
  ('Kitchen', 750, $$Route service cable to the panel in the interior wall where practical to clean up the exterior installation.$$),
  ('Kitchen', 760, $$Prep and apply first coats of paint before kitchen cabinet installation.$$),
  ('Kitchen', 770, $$Install flooring.$$),
  ('Kitchen', 780, $$Install new kitchen cabinets after flooring is installed, according to the provided kitchen plans.$$),
  ('Kitchen', 790, $$Install cover panels, filler panels, risers or crown moulding, valances and all required cabinet trims.$$),
  ('Kitchen', 800, $$Measure for countertop after cabinet installation and send measurements to Dane for ordering.$$),
  ('Kitchen', 810, $$Install countertop once received.$$),
  ('Kitchen', 820, $$Install over-the-range microwave prior to backsplash installation where required.$$),
  ('Kitchen', 830, $$Install new backsplash.$$),
  ('Kitchen', 840, $$Grout backsplash.$$),
  ('Kitchen', 850, $$Caulk perimeter around backsplash.$$),
  ('Kitchen', 860, $$Install cabinet pulls and hardware.$$),
  ('Kitchen', 870, $$Install sink in countertop.$$),
  ('Kitchen', 880, $$Install new appliances.$$),
  ('Kitchen', 890, $$Install finish plumbing fixtures and connect all kitchen plumbing.$$),
  ('Kitchen', 900, $$Install finish electrical fixtures, receptacles, switches, under-cabinet lighting, face plates and panel cover.$$),
  ('Kitchen', 910, $$Final paint touch ups as required.$$),
  ('Kitchen', 920, $$Final clean.$$),
  ('Hallways / Bedrooms / Living Room', 1010, $$Complete remaining demolition in hallways, bedrooms and living room as required.$$),
  ('Hallways / Bedrooms / Living Room', 1020, $$Complete subfloor disinfecting, BIN sealing, smoothing and leveling work before flooring installation.$$),
  ('Hallways / Bedrooms / Living Room', 1030, $$Complete window replacement work in all applicable rooms, excluding the small bedroom with existing vinyl window.$$),
  ('Hallways / Bedrooms / Living Room', 1040, $$Complete insulation and vapour barrier work at exposed exterior wall areas.$$),
  ('Hallways / Bedrooms / Living Room', 1050, $$Install new flooring throughout after subfloor preparation is complete.$$),
  ('Hallways / Bedrooms / Living Room', 1060, $$Repair cracked plaster and damaged wall areas, including FibaFuse and skim coating where required.$$),
  ('Hallways / Bedrooms / Living Room', 1070, $$Prep and paint walls, ceilings, trims, doors and closets.$$),
  ('Hallways / Bedrooms / Living Room', 1080, $$Install finish electrical fixtures, receptacles, switches and face plates.$$),
  ('Hallways / Bedrooms / Living Room', 1090, $$Install finish trims, transitions and door hardware as required.$$),
  ('Hallways / Bedrooms / Living Room', 1100, $$Final clean.$$
)
)
insert into public.scope_items (
  scope_project_id,
  section,
  sort_order,
  item_text,
  source
)
select
  project.id,
  seed.section,
  seed.sort_order,
  seed.item_text,
  'notion'
from project
cross join seed
on conflict (scope_project_id, section, item_text) do nothing;

commit;
