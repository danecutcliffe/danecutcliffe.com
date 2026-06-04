begin;

-- Job switching is a normal employee punch transition, not an admin/manual edit.
-- Leave edited_by/edited_at untouched so true correction metadata remains reserved
-- for admin updateTimeEntry() edits.

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
    clock_out_lng = p_clock_lng
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

grant execute on function public.employee_switch_job(uuid, uuid, numeric, numeric) to authenticated;

commit;
