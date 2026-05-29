alter table public.profiles
  add column if not exists paid_break_minutes integer not null default 30
  check (paid_break_minutes >= 0 and paid_break_minutes <= 240);
