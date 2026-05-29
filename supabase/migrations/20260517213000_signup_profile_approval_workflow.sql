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
    is_active
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
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

insert into public.profiles (
  id,
  email,
  first_name,
  last_name,
  role,
  hourly_rate,
  paid_breaks,
  paid_break_minutes,
  is_active
)
select
  auth_user.id,
  coalesce(auth_user.email, ''),
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'first_name'), ''), split_part(coalesce(auth_user.email, ''), '@', 1), 'Pending'),
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'last_name'), ''), 'Signup'),
  'employee',
  0,
  false,
  30,
  false
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where profile.id is null;
