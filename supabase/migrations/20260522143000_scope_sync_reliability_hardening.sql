begin;

create table if not exists public.scope_sections (
  scope_project_id uuid not null references public.scope_projects(id) on delete cascade,
  section text not null,
  sort_order integer not null,
  notion_block_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope_project_id, section)
);

drop trigger if exists scope_sections_touch_updated_at on public.scope_sections;
create trigger scope_sections_touch_updated_at
before update on public.scope_sections
for each row execute function public.scope_touch_updated_at();

alter table public.scope_sections enable row level security;

drop policy if exists "Authenticated users can view active scope sections" on public.scope_sections;
create policy "Authenticated users can view active scope sections"
on public.scope_sections
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

drop policy if exists "Admins can manage scope sections" on public.scope_sections;
create policy "Admins can manage scope sections"
on public.scope_sections
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.scope_normalize_item_text(value text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select btrim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', ' ', 'g'));
$function$;

with section_seed as (
  select
    scope_project_id,
    section,
    case section
      when 'All Rooms' then 10
      when 'Stairs / Entry' then 20
      when 'Bathroom' then 30
      when 'Kitchen' then 40
      when 'Hallways / Bedrooms / Living Room' then 50
      else 1000 + dense_rank() over (
        partition by scope_project_id
        order by min(sort_order), min(created_at), section
      ) * 10
    end as sort_order
  from public.scope_items
  where is_active
  group by scope_project_id, section
)
insert into public.scope_sections (
  scope_project_id,
  section,
  sort_order,
  is_active
)
select
  scope_project_id,
  section,
  sort_order,
  true
from section_seed
on conflict (scope_project_id, section)
do update set
  sort_order = excluded.sort_order,
  is_active = true;

with ranked as (
  select
    id,
    row_number() over (
      partition by scope_project_id, section, public.scope_normalize_item_text(item_text)
      order by sort_order, created_at, id
    ) as duplicate_rank
  from public.scope_items
  where is_active
)
update public.scope_items i
set
  is_active = false,
  notion_checked = false,
  completed_at = null,
  completed_by = null,
  sync_status = 'duplicate-deactivated'
from ranked
where ranked.id = i.id
  and ranked.duplicate_rank > 1;

with ordered as (
  select
    id,
    row_number() over (
      partition by scope_project_id, section
      order by sort_order, created_at, id
    ) * 10 as next_sort_order
  from public.scope_items
  where is_active
)
update public.scope_items i
set sort_order = ordered.next_sort_order
from ordered
where ordered.id = i.id;

drop index if exists public.scope_items_project_section_text_key;

create unique index if not exists scope_items_active_project_section_normalized_key
  on public.scope_items(scope_project_id, section, public.scope_normalize_item_text(item_text))
  where is_active;

update public.scope_section_sync_state
set
  pending_local_sync_at = null,
  pending_notion_sync_at = null,
  pending_notion_item_ids = null;

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
        and (
          public.is_admin()
          or exists (
            select 1
            from public.time_entries te
            where te.job_code_id = p.job_code_id
              and te.user_id = auth.uid()
              and te.event_type = 'work'
              and te.clock_out is null
          )
        )
    )
  returning * into updated_item;

  if updated_item.id is null then
    raise exception 'Clock into this job before updating scope items.';
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
  existing_item public.scope_items%rowtype;
  normalized_section text := coalesce(nullif(btrim(p_section), ''), 'Added on site');
  normalized_text text := public.scope_normalize_item_text(p_item_text);
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
    from public.scope_projects p
    where p.id = p_scope_project_id
      and p.is_active
      and (
        public.is_admin()
        or exists (
          select 1
          from public.time_entries te
          where te.job_code_id = p.job_code_id
            and te.user_id = auth.uid()
            and te.event_type = 'work'
            and te.clock_out is null
        )
      )
  ) then
    raise exception 'Clock into this job before adding scope items.';
  end if;

  select *
  into existing_item
  from public.scope_items
  where scope_project_id = p_scope_project_id
    and section = normalized_section
    and is_active
    and public.scope_normalize_item_text(item_text) = normalized_text
  order by sort_order, created_at, id
  limit 1;

  if existing_item.id is not null then
    return existing_item;
  end if;

  insert into public.scope_sections (
    scope_project_id,
    section,
    sort_order,
    is_active
  )
  values (
    p_scope_project_id,
    normalized_section,
    (
      select coalesce(max(sort_order), 0) + 10
      from public.scope_sections
      where scope_project_id = p_scope_project_id
    ),
    true
  )
  on conflict (scope_project_id, section)
  do update set is_active = true;

  select coalesce(max(sort_order), 0) + 10
  into next_sort
  from public.scope_items
  where scope_project_id = p_scope_project_id
    and section = normalized_section
    and is_active;

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
    normalized_section,
    btrim(p_item_text),
    next_sort,
    'employee',
    auth.uid()
  )
  returning * into inserted_item;

  return inserted_item;
end;
$function$;

grant execute on function public.scope_normalize_item_text(text) to authenticated, service_role;
grant execute on function public.scope_toggle_item(uuid, boolean) to authenticated;
grant execute on function public.scope_add_item(uuid, text, text) to authenticated;

commit;
