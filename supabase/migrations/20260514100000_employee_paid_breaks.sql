alter table public.profiles
  add column if not exists paid_breaks boolean not null default false;
