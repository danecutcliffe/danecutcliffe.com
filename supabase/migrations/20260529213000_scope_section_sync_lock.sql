begin;

alter table public.scope_section_sync_state
  add column if not exists sync_lock_token text,
  add column if not exists sync_lock_started_at timestamptz,
  add column if not exists sync_lock_expires_at timestamptz;

create or replace function public.scope_try_acquire_section_sync_lock(
  p_scope_project_id uuid,
  p_section text,
  p_lock_token text,
  p_lock_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  normalized_section text := coalesce(nullif(btrim(p_section), ''), 'Added on site');
  affected_count integer;
begin
  if coalesce(nullif(btrim(p_lock_token), ''), '') = '' then
    raise exception 'A lock token is required.';
  end if;

  insert into public.scope_section_sync_state (
    scope_project_id,
    section,
    sync_lock_token,
    sync_lock_started_at,
    sync_lock_expires_at
  )
  values (
    p_scope_project_id,
    normalized_section,
    p_lock_token,
    now(),
    now() + make_interval(secs => greatest(coalesce(p_lock_ttl_seconds, 180), 30))
  )
  on conflict (scope_project_id, section)
  do update set
    sync_lock_token = excluded.sync_lock_token,
    sync_lock_started_at = excluded.sync_lock_started_at,
    sync_lock_expires_at = excluded.sync_lock_expires_at
  where public.scope_section_sync_state.sync_lock_token is null
    or public.scope_section_sync_state.sync_lock_expires_at <= now()
    or public.scope_section_sync_state.sync_lock_token = p_lock_token;

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$function$;

create or replace function public.scope_release_section_sync_lock(
  p_scope_project_id uuid,
  p_section text,
  p_lock_token text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  normalized_section text := coalesce(nullif(btrim(p_section), ''), 'Added on site');
  affected_count integer;
begin
  update public.scope_section_sync_state
  set
    sync_lock_token = null,
    sync_lock_started_at = null,
    sync_lock_expires_at = null
  where scope_project_id = p_scope_project_id
    and section = normalized_section
    and sync_lock_token = p_lock_token;

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$function$;

grant execute on function public.scope_try_acquire_section_sync_lock(uuid, text, text, integer) to service_role;
grant execute on function public.scope_release_section_sync_lock(uuid, text, text) to service_role;

commit;
