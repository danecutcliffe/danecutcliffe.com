begin;

-- Employee live punch RPCs own the server-authoritative state transitions.
-- Keep signatures stable for existing clients while rejecting stale/racy states
-- with explicit payroll-safe errors in the normal app flow. Unique indexes still
-- backstop concurrent duplicate-open races.

create or replace function public.employee_clock_in(
  p_job_code_id uuid,
  p_clock_in_lat numeric default null,
  p_clock_in_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inserted_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'work'
      and clock_out is null
  ) then
    raise exception 'You are already clocked in.';
  end if;

  if exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'break'
      and clock_out is null
  ) then
    raise exception 'End your break before clocking in.';
  end if;

  if not exists (
    select 1 from public.job_codes
    where id = p_job_code_id and is_active and not is_archived
  ) then
    raise exception 'Choose an active job code.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), p_job_code_id, 'work', now(),
    p_clock_in_lat, p_clock_in_lng, '', auth.uid()
  )
  returning * into inserted_entry;

  return inserted_entry;
end;
$function$;

create or replace function public.employee_clock_out(
  p_entry_id uuid,
  p_notes text,
  p_clock_out_lat numeric default null,
  p_clock_out_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if btrim(coalesce(p_notes, '')) = '' then
    raise exception 'A shift note is required before clocking out.';
  end if;

  if exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'break'
      and clock_out is null
  ) then
    raise exception 'End your break before clocking out.';
  end if;

  update public.time_entries
  set
    notes = btrim(p_notes),
    clock_out = now(),
    clock_out_lat = p_clock_out_lat,
    clock_out_lng = p_clock_out_lng
  where id = p_entry_id
    and user_id = auth.uid()
    and event_type = 'work'
    and clock_out is null
  returning * into updated_entry;

  if updated_entry.id is null then
    raise exception 'No open work entry found to clock out.';
  end if;

  return updated_entry;
end;
$function$;

create or replace function public.employee_start_break(
  p_job_code_id uuid,
  p_clock_in_lat numeric default null,
  p_clock_in_lng numeric default null
)
returns public.time_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inserted_entry public.time_entries%rowtype;
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if not exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'work'
      and clock_out is null
  ) then
    raise exception 'You must be clocked in before starting a break.';
  end if;

  if exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'break'
      and clock_out is null
  ) then
    raise exception 'A break is already in progress.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), null, 'break', now(),
    p_clock_in_lat, p_clock_in_lng, 'Break', auth.uid()
  )
  returning * into inserted_entry;

  return inserted_entry;
end;
$function$;

create or replace function public.employee_switch_job(
  p_from_entry_id uuid,
  p_to_job_code_id uuid,
  p_clock_lat numeric default null,
  p_clock_lng numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  closed_entry public.time_entries%rowtype;
  opened_entry public.time_entries%rowtype;
  punch_time timestamptz := now();
begin
  if auth.uid() is null or not public.is_active_profile(auth.uid()) then
    raise exception 'Please sign in with an active employee account.';
  end if;

  if exists (
    select 1
    from public.time_entries
    where user_id = auth.uid()
      and event_type = 'break'
      and clock_out is null
  ) then
    raise exception 'End your break before switching jobs.';
  end if;

  if not exists (
    select 1 from public.job_codes
    where id = p_to_job_code_id and is_active and not is_archived
  ) then
    raise exception 'Choose an active job code.';
  end if;

  update public.time_entries
  set
    clock_out = punch_time,
    clock_out_lat = p_clock_lat,
    clock_out_lng = p_clock_lng,
    edited_by = auth.uid(),
    edited_at = punch_time
  where id = p_from_entry_id
    and user_id = auth.uid()
    and event_type = 'work'
    and clock_out is null
  returning * into closed_entry;

  if closed_entry.id is null then
    raise exception 'No open work entry found to switch from.';
  end if;

  insert into public.time_entries (
    user_id, job_code_id, event_type, clock_in,
    clock_in_lat, clock_in_lng, notes, created_by
  )
  values (
    auth.uid(), p_to_job_code_id, 'work', punch_time,
    p_clock_lat, p_clock_lng, '', auth.uid()
  )
  returning * into opened_entry;

  return jsonb_build_object(
    'closedEntry', to_jsonb(closed_entry),
    'openedEntry', to_jsonb(opened_entry)
  );
end;
$function$;

grant execute on function public.employee_clock_in(uuid, numeric, numeric) to authenticated;
grant execute on function public.employee_clock_out(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.employee_start_break(uuid, numeric, numeric) to authenticated;
grant execute on function public.employee_switch_job(uuid, uuid, numeric, numeric) to authenticated;

commit;
