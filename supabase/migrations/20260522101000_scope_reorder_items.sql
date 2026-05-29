begin;

create or replace function public.scope_reorder_items(
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
  active_role text;
  project_job_code_id uuid;
  section_item_count integer;
  passed_item_count integer;
  distinct_item_count integer;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  passed_item_count := coalesce(array_length(p_item_ids, 1), 0);
  if passed_item_count < 1 then
    raise exception 'Reordered scope items are required.';
  end if;

  select p.job_code_id
  into project_job_code_id
  from public.scope_projects p
  where p.id = p_scope_project_id
    and p.is_active;

  if project_job_code_id is null then
    raise exception 'Scope project was not found.';
  end if;

  select role
  into active_role
  from public.profiles
  where id = auth.uid()
    and is_active
  limit 1;

  if active_role is distinct from 'admin' and not exists (
    select 1
    from public.time_entries te
    where te.user_id = auth.uid()
      and te.job_code_id = project_job_code_id
      and te.event_type = 'work'
      and te.clock_out is null
  ) then
    raise exception 'Clock into this job before reordering scope items.';
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

grant execute on function public.scope_reorder_items(uuid, text, uuid[]) to authenticated;

commit;
