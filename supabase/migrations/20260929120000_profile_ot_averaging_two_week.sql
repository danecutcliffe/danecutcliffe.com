-- PEI two-week (9x9) overtime averaging agreement flag. When true, from
-- 2026-06-30 the app pools OT-eligible work hours across each 14-day pay period
-- against an 88-hour threshold instead of 44 hours per week. Admin-only updates
-- are enforced by the existing profiles_admin_update policy.
alter table public.profiles
  add column if not exists ot_averaging_two_week boolean not null default false;
