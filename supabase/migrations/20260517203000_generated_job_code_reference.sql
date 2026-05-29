alter table public.job_codes
  add column if not exists code text;

alter table public.job_codes
  drop constraint if exists job_codes_name_key;

create or replace function public.job_code_prefix(job_title text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(rpad(left(regexp_replace(upper(coalesce(job_title, '')), '[^A-Z]', '', 'g'), 2), 2, 'J'), ''), 'JC')
$$;

with numbered as (
  select
    id,
    public.job_code_prefix(name) as prefix,
    row_number() over (partition by public.job_code_prefix(name) order by created_at, id) as sequence_number
  from public.job_codes
  where code is null or code = ''
)
update public.job_codes target
set code = numbered.prefix || lpad(numbered.sequence_number::text, 4, '0')
from numbered
where target.id = numbered.id;

alter table public.job_codes
  alter column code set not null;

create unique index if not exists job_codes_code_key on public.job_codes(code);

create unique index if not exists job_codes_site_name_active_key
  on public.job_codes (coalesce(job_site_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where not is_archived;

create or replace function public.assign_job_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  sequence_number integer := 1;
  candidate text;
begin
  if new.code is not null and btrim(new.code) <> '' then
    new.code = upper(regexp_replace(new.code, '[^A-Z0-9]', '', 'g'));
    return new;
  end if;

  prefix = public.job_code_prefix(new.name);

  loop
    candidate = prefix || lpad(sequence_number::text, 4, '0');
    exit when not exists (select 1 from public.job_codes where code = candidate);
    sequence_number = sequence_number + 1;
  end loop;

  new.code = candidate;
  return new;
end;
$$;

drop trigger if exists job_codes_assign_code on public.job_codes;
create trigger job_codes_assign_code
  before insert on public.job_codes
  for each row execute function public.assign_job_code();
