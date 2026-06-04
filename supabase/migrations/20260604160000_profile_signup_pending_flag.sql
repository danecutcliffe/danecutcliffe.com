begin;

alter table public.profiles
  add column if not exists signup_pending boolean not null default false;

update public.profiles profile
set signup_pending = true
where not profile.is_active
  and not profile.is_rejected
  and coalesce(profile.hourly_rate, 0) = 0
  and not exists (
    select 1
    from public.time_entries entry
    where entry.user_id = profile.id
  );

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  first_name text;
  last_name text;
begin
  first_name = nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.email, ''), '@', 1))), '');
  last_name = nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', 'Pending')), '');

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    hourly_rate,
    paid_breaks,
    paid_break_minutes,
    is_active,
    is_rejected,
    signup_pending
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(first_name, 'Pending'),
    coalesce(last_name, 'Signup'),
    'employee',
    0,
    false,
    30,
    false,
    false,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

create or replace function public.clear_resolved_signup_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.is_active or new.is_rejected then
    new.signup_pending := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_clear_resolved_signup_pending on public.profiles;
create trigger profiles_clear_resolved_signup_pending
  before update of is_active, is_rejected on public.profiles
  for each row execute function public.clear_resolved_signup_pending();

create or replace function public.reject_pending_signup(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id;

  if target_profile.id is null then
    raise exception 'Signup request not found.';
  end if;

  if not target_profile.signup_pending then
    raise exception 'Only pending signup requests can be rejected.';
  end if;

  if target_profile.is_active then
    raise exception 'Only inactive signup requests can be rejected.';
  end if;

  if exists (select 1 from public.time_entries where user_id = target_profile_id) then
    raise exception 'Profiles with time history cannot be rejected.';
  end if;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (auth.uid(), 'signup_rejected', 'profiles', target_profile_id, to_jsonb(target_profile), null);

  update public.profiles
  set is_rejected = true,
      signup_pending = false
  where id = target_profile_id;

  delete from auth.users
  where id = target_profile_id;
end;
$function$;

create or replace function public.admin_create_employee(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text default 'employee',
  p_worker_type text default 'employee',
  p_contractor_hst_applicable boolean default false,
  p_hourly_rate numeric default 0,
  p_paid_breaks boolean default false,
  p_paid_break_minutes integer default 30,
  p_can_access_scopes boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_user_id uuid;
  normalized_role public.app_role;
  normalized_worker_type text;
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if btrim(p_email) = '' then
    raise exception 'Email is required.';
  end if;

  if btrim(p_first_name) = '' then
    raise exception 'First name is required.';
  end if;

  normalized_role := case
    when p_role = 'admin' then 'admin'::public.app_role
    else 'employee'::public.app_role
  end;

  normalized_worker_type := case
    when p_worker_type = 'contractor' then 'contractor'
    else 'employee'
  end;

  new_user_id := extensions.uuid_generate_v4();

  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token
  )
  values (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    btrim(lower(p_email)),
    extensions.crypt(extensions.uuid_generate_v4()::text, extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('first_name', btrim(p_first_name), 'last_name', btrim(p_last_name)),
    'authenticated',
    'authenticated',
    now(),
    now(),
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    new_user_id,
    new_user_id,
    btrim(lower(p_email)),
    'email',
    jsonb_build_object('sub', new_user_id::text, 'email', btrim(lower(p_email))),
    now(),
    now(),
    now()
  );

  insert into public.profiles (
    id, email, first_name, last_name, role, worker_type, contractor_hst_applicable, hourly_rate,
    paid_breaks, paid_break_minutes, can_access_scopes, is_active, is_rejected, signup_pending
  )
  values (
    new_user_id,
    btrim(lower(p_email)),
    btrim(p_first_name),
    btrim(coalesce(p_last_name, '')),
    normalized_role,
    normalized_worker_type,
    coalesce(p_contractor_hst_applicable, false),
    p_hourly_rate,
    p_paid_breaks,
    p_paid_break_minutes,
    coalesce(p_can_access_scopes, true),
    true,
    false,
    false
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    worker_type = excluded.worker_type,
    contractor_hst_applicable = excluded.contractor_hst_applicable,
    hourly_rate = excluded.hourly_rate,
    paid_breaks = excluded.paid_breaks,
    paid_break_minutes = excluded.paid_break_minutes,
    can_access_scopes = excluded.can_access_scopes,
    is_active = excluded.is_active,
    is_rejected = excluded.is_rejected,
    signup_pending = excluded.signup_pending;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    'employee_created_by_admin',
    'profiles',
    new_user_id,
    null,
    jsonb_build_object(
      'email', btrim(lower(p_email)),
      'first_name', btrim(p_first_name),
      'last_name', btrim(coalesce(p_last_name, '')),
      'role', normalized_role,
      'worker_type', normalized_worker_type,
      'contractor_hst_applicable', coalesce(p_contractor_hst_applicable, false),
      'can_access_scopes', coalesce(p_can_access_scopes, true)
    )
  );

  return new_user_id;
end;
$function$;

grant execute on function public.reject_pending_signup(uuid) to authenticated;
grant execute on function public.admin_create_employee(text, text, text, text, text, boolean, numeric, boolean, integer, boolean) to authenticated;

commit;
