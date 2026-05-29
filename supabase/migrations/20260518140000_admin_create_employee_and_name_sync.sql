-- Admin-creates-employee: creates auth user + profile in one RPC call.
-- Admin no longer needs to manually create a Supabase auth user and paste the UUID.
create or replace function public.admin_create_employee(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text default 'employee',
  p_hourly_rate numeric default 0,
  p_paid_breaks boolean default false,
  p_paid_break_minutes integer default 30
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

  -- Create auth user with a random password (employee will use password reset to set their own)
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

  -- The handle_new_auth_user_profile trigger will create a basic profile row,
  -- but we want the admin-specified values. Upsert over whatever the trigger created.
  insert into public.profiles (
    id, email, first_name, last_name, role, hourly_rate,
    paid_breaks, paid_break_minutes, is_active, is_rejected
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
    is_active = excluded.is_active,
    is_rejected = excluded.is_rejected;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (
    auth.uid(),
    'employee_created_by_admin',
    'profiles',
    new_user_id,
    null,
    jsonb_build_object('email', btrim(lower(p_email)), 'first_name', btrim(p_first_name), 'last_name', btrim(coalesce(p_last_name, '')), 'role', p_role)
  );

  return new_user_id;
end;
$$;

grant execute on function public.admin_create_employee(text, text, text, text, numeric, boolean, integer) to authenticated;


-- Sync display name back to auth.users when admin edits an employee name.
create or replace function public.admin_update_employee_name(
  p_profile_id uuid,
  p_first_name text,
  p_last_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Employee profile not found.';
  end if;

  update auth.users
  set
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('first_name', btrim(p_first_name), 'last_name', btrim(p_last_name)),
    updated_at = now()
  where id = p_profile_id;
end;
$$;

grant execute on function public.admin_update_employee_name(uuid, text, text) to authenticated;
