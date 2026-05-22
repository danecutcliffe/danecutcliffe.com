begin;

create table if not exists public.scope_section_sync_state (
  scope_project_id uuid not null references public.scope_projects(id) on delete cascade,
  section text not null,
  last_local_order_hash text,
  last_local_ordered_at timestamptz,
  pending_local_sync_at timestamptz,
  last_notion_order_hash text,
  last_notion_ordered_at timestamptz,
  pending_notion_sync_at timestamptz,
  pending_notion_item_ids uuid[],
  last_outbound_synced_at timestamptz,
  last_inbound_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope_project_id, section)
);

drop trigger if exists scope_section_sync_state_touch_updated_at on public.scope_section_sync_state;
create trigger scope_section_sync_state_touch_updated_at
before update on public.scope_section_sync_state
for each row execute function public.scope_touch_updated_at();

alter table public.scope_section_sync_state enable row level security;

drop policy if exists "Admins can view scope section sync state" on public.scope_section_sync_state;
create policy "Admins can view scope section sync state"
on public.scope_section_sync_state
for select
to authenticated
using (public.is_admin());

create or replace function public.scope_apply_section_order(
  p_scope_project_id uuid,
  p_section text,
  p_item_ids uuid[]
)
returns setof public.scope_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  normalized_section text := coalesce(nullif(btrim(p_section), ''), 'Added on site');
  section_item_count integer;
  passed_item_count integer;
  distinct_item_count integer;
begin
  passed_item_count := coalesce(array_length(p_item_ids, 1), 0);
  if passed_item_count < 1 then
    raise exception 'Reordered scope items are required.';
  end if;

  select count(*)
  into section_item_count
  from public.scope_items
  where scope_project_id = p_scope_project_id
    and section = normalized_section
    and is_active;

  if section_item_count <> passed_item_count then
    raise exception 'Scope items changed before this reorder could be saved. Refresh and try again.';
  end if;

  select count(distinct item_id)
  into distinct_item_count
  from unnest(p_item_ids) as item_id;

  if distinct_item_count <> passed_item_count then
    raise exception 'Each scope item must appear exactly once in the new order.';
  end if;

  if exists (
    select 1
    from unnest(p_item_ids) as ordered(item_id)
    where not exists (
      select 1
      from public.scope_items i
      where i.id = ordered.item_id
        and i.scope_project_id = p_scope_project_id
        and i.section = normalized_section
        and i.is_active
    )
  ) then
    raise exception 'Scope items changed before this reorder could be saved. Refresh and try again.';
  end if;

  with ordered as (
    select item_id, ordinality
    from unnest(p_item_ids) with ordinality as u(item_id, ordinality)
  )
  update public.scope_items i
  set sort_order = ordered.ordinality * 10
  from ordered
  where i.id = ordered.item_id;

  return query
  select *
  from public.scope_items
  where scope_project_id = p_scope_project_id
    and section = normalized_section
    and is_active
  order by sort_order asc, created_at asc;
end;
$function$;

grant execute on function public.scope_apply_section_order(uuid, text, uuid[]) to service_role;

commit;
