alter table public.profiles
  add column if not exists is_rejected boolean not null default false;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    is_rejected
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
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.reject_pending_signup(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  if target_profile.is_active then
    raise exception 'Only inactive signup requests can be rejected.';
  end if;

  if exists (select 1 from public.time_entries where user_id = target_profile_id) then
    raise exception 'Profiles with time history cannot be rejected.';
  end if;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (auth.uid(), 'signup_rejected', 'profiles', target_profile_id, to_jsonb(target_profile), null);

  update public.profiles
  set is_rejected = true
  where id = target_profile_id;

  delete from auth.users
  where id = target_profile_id;
end;
$$;

grant execute on function public.reject_pending_signup(uuid) to authenticated;
