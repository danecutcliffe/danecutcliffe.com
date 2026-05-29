alter table public.profiles
  add column if not exists can_access_scopes boolean not null default true;

drop function if exists public.admin_create_employee(text, text, text, text, numeric, boolean, integer);

create or replace function public.admin_create_employee(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text default 'employee',
  p_hourly_rate numeric default 0,
  p_paid_breaks boolean default false,
  p_paid_break_minutes integer default 30,
  p_can_access_scopes boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_user_id uuid;
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
    crypt(extensions.uuid_generate_v4()::text, gen_salt('bf')),
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
    id, email, first_name, last_name, role, hourly_rate,
    paid_breaks, paid_break_minutes, can_access_scopes, is_active, is_rejected
  )
  values (
    new_user_id,
    btrim(lower(p_email)),
    btrim(p_first_name),
    btrim(coalesce(p_last_name, '')),
    p_role,
    p_hourly_rate,
    p_paid_breaks,
    p_paid_break_minutes,
    coalesce(p_can_access_scopes, true),
    true,
    false
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    hourly_rate = excluded.hourly_rate,
    paid_breaks = excluded.paid_breaks,
    paid_break_minutes = excluded.paid_break_minutes,
    can_access_scopes = excluded.can_access_scopes,
    is_active = excluded.is_active,
    is_rejected = excluded.is_rejected;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    'employee_created_by_admin',
    'profiles',
    new_user_id,
    null,
    jsonb_build_object('email', btrim(lower(p_email)), 'first_name', btrim(p_first_name), 'last_name', btrim(coalesce(p_last_name, '')), 'role', p_role, 'can_access_scopes', coalesce(p_can_access_scopes, true))
  );

  return new_user_id;
end;
$$;

grant execute on function public.admin_create_employee(text, text, text, text, numeric, boolean, integer, boolean) to authenticated;
