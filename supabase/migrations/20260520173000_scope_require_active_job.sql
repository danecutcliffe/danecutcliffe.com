begin;

-- Move the scope pilot into field-test production mode. Employees may view
-- active scope projects, but scope changes require an open work punch for the
-- job code linked to that scope project.

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
      join public.time_entries te on te.job_code_id = p.job_code_id
      where p.id = i.scope_project_id
        and p.is_active
        and te.user_id = auth.uid()
        and te.event_type = 'work'
        and te.clock_out is null
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

commit;
