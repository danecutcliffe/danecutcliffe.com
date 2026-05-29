-- Phase 1B seed template.
-- Create the users in Supabase Auth first, then replace the UUIDs below with real auth.users IDs.
-- In Supabase SQL editor, this query helps find the values:
-- select id, email from auth.users order by created_at desc;

insert into public.profiles (id, email, first_name, last_name, role, hourly_rate, paid_breaks, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'dane@example.com', 'Dane', 'Cutcliffe', 'admin', 0, false, true),
  ('00000000-0000-0000-0000-000000000002', 'employee@example.com', 'Jamie', 'Carpenter', 'employee', 24.00, false, true),
  ('00000000-0000-0000-0000-000000000003', 'morgan@example.com', 'Morgan', 'Painter', 'employee', 22.50, true, true)
on conflict (id) do update set
  email = excluded.email,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  role = excluded.role,
  hourly_rate = excluded.hourly_rate,
  paid_breaks = excluded.paid_breaks,
  is_active = excluded.is_active;

insert into public.job_codes (code, name, description, is_active, is_archived)
values
  ('OR0001', '8-14 Orlebar Reno', 'Interior renovation and unit turnover work', true, false),
  ('CU0001', '1-154 Cumberland', 'Condo renovation tasks', true, false),
  ('NE0001', '74 Newland', 'Duplex maintenance', true, false)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  is_archived = excluded.is_archived;
