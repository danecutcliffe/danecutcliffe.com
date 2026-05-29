create or replace function public.delete_employee_account(target_profile_id uuid)
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

  if target_profile_id = auth.uid() then
    raise exception 'You cannot delete the currently signed-in profile.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_profile_id;

  if target_profile.id is null then
    raise exception 'Employee profile not found.';
  end if;

  if exists (select 1 from public.time_entries where user_id = target_profile_id) then
    raise exception 'Employees with time history cannot be deleted.';
  end if;

  insert into public.audit_log (user_id, action, target_table, target_id, old_values, new_values)
  values (auth.uid(), 'profile_deleted', 'profiles', target_profile_id, to_jsonb(target_profile), null);

  delete from auth.users
  where id = target_profile_id;
end;
$$;

grant execute on function public.delete_employee_account(uuid) to authenticated;
