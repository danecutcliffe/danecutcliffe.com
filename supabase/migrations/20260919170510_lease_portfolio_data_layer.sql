begin;

-- Lease portfolio data is intentionally separate from the timecard domain, but
-- it reuses the existing authenticated profile/admin role. Public functions are
-- SECURITY INVOKER wrappers; privileged work lives in the unexposed private
-- schema and performs its own auth.uid() check.
create schema if not exists private;

do $$
begin
  create type public.lease_configuration_state as enum (
    'unknown',
    'known_empty',
    'known_populated'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.lease_option_category as enum (
    'included_standard',
    'included_other',
    'tenant_responsibility'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.lease_dataset_state (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0),
  schema_version integer not null default 1 check (schema_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.lease_dataset_state (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.lease_entities (
  id text primary key check (id ~ '^entity-[a-z0-9][a-z0-9-]*$'),
  legal_name text not null check (btrim(legal_name) <> ''),
  address_for_service text not null default '',
  community text not null default '',
  province text not null default 'PE',
  postal_code text not null default '',
  phone text not null default '',
  rent_payment_recipient text not null default '',
  rent_payment_instructions text not null default '',
  rent_payment_address text not null default '',
  confidence text,
  source_files jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files) = 'array'),
  is_active boolean not null default true,
  imported_values jsonb not null default '{}'::jsonb,
  manual_fields text[] not null default '{}'::text[],
  record_revision bigint not null default 1 check (record_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.lease_buildings (
  id text primary key check (id ~ '^building-[a-z0-9][a-z0-9-]*$'),
  display_name text not null check (btrim(display_name) <> ''),
  street_address text not null check (btrim(street_address) <> ''),
  community text not null default '',
  province text not null default 'PE',
  postal_code text not null default '',
  source_directory text,
  confidence text,
  source_files jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files) = 'array'),
  is_active boolean not null default true,
  imported_values jsonb not null default '{}'::jsonb,
  manual_fields text[] not null default '{}'::text[],
  record_revision bigint not null default 1 check (record_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.lease_standard_options (
  id text primary key check (id ~ '^option-[a-z0-9][a-z0-9-]*$'),
  system_key text unique,
  category public.lease_option_category not null,
  label text not null check (btrim(label) <> ''),
  pdf_text text not null check (btrim(pdf_text) <> ''),
  is_active boolean not null default true,
  confidence text,
  source_files jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files) = 'array'),
  imported_values jsonb not null default '{}'::jsonb,
  manual_fields text[] not null default '{}'::text[],
  record_revision bigint not null default 1 check (record_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Structural choices mirror the legacy Form 1 fields. They are template/app
-- vocabulary, not portfolio defaults: no Unit is linked to them by this seed.
insert into public.lease_standard_options (id, system_key, category, label, pdf_text, manual_fields)
values
  ('option-included-heat', 'heat', 'included_standard', 'Heat', 'Heat', array['systemKey','category','label','pdfText','active']),
  ('option-included-water', 'water', 'included_standard', 'Water', 'Water', array['systemKey','category','label','pdfText','active']),
  ('option-included-hot-water', 'hot_water', 'included_standard', 'Hot Water', 'Hot Water', array['systemKey','category','label','pdfText','active']),
  ('option-included-electricity', 'electricity', 'included_standard', 'Electricity', 'Electricity', array['systemKey','category','label','pdfText','active']),
  ('option-included-cooking-stove', 'cooking_stove', 'included_standard', 'Cooking Stove', 'Cooking Stove', array['systemKey','category','label','pdfText','active']),
  ('option-included-refrigerator', 'refrigerator', 'included_standard', 'Refrigerator', 'Refrigerator', array['systemKey','category','label','pdfText','active']),
  ('option-included-washer-dryer-no-charge', 'washer_dryer_no_charge', 'included_standard', 'Washer & Dryer (without charge)', 'Washer & Dryer (without charge)', array['systemKey','category','label','pdfText','active']),
  ('option-included-washer-dryer-coin', 'washer_dryer_coin', 'included_standard', 'Washer & Dryer (coin operated)', 'Washer & Dryer (coin operated)', array['systemKey','category','label','pdfText','active']),
  ('option-included-cable-hookup', 'cable_hookup', 'included_standard', 'Cable TV Hook-up Apparatus', 'Cable TV Hook-up Apparatus', array['systemKey','category','label','pdfText','active']),
  ('option-included-cable-service', 'cable_service', 'included_standard', 'Cable TV Service', 'Cable TV Service', array['systemKey','category','label','pdfText','active']),
  ('option-included-janitorial-common', 'janitorial_common', 'included_standard', 'Janitorial Service for Common Areas', 'Janitorial Service for Common Areas', array['systemKey','category','label','pdfText','active']),
  ('option-included-parking', 'parking', 'included_standard', 'Parking', 'Parking', array['systemKey','category','label','pdfText','active']),
  ('option-included-snow-removal', 'snow_removal_parking_walkways', 'included_standard', 'Snow Removal for Parking Lot & Walkways', 'Snow Removal for Parking Lot & Walkways', array['systemKey','category','label','pdfText','active']),
  ('option-included-grass-cutting', 'grass_cutting', 'included_standard', 'Grass Cutting', 'Grass Cutting', array['systemKey','category','label','pdfText','active'])
on conflict (id) do nothing;

create table if not exists public.lease_units (
  id text primary key check (id ~ '^unit-[a-z0-9][a-z0-9-]*$'),
  building_id text not null references public.lease_buildings(id) on delete restrict,
  entity_id text not null references public.lease_entities(id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  unit_number text not null default '',
  premises_street_address text not null check (btrim(premises_street_address) <> ''),
  premises_community text not null default '',
  premises_postal_code text not null default '',
  premises_type text not null default '',
  default_rental_rate numeric(12, 2) not null check (default_rental_rate >= 0),
  rent_period text not null default 'Month' check (btrim(rent_period) <> ''),
  rent_due_day text not null default '1st' check (btrim(rent_due_day) <> ''),
  inclusions_state public.lease_configuration_state not null default 'unknown',
  responsibilities_state public.lease_configuration_state not null default 'unknown',
  confidence text,
  source_files jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files) = 'array'),
  is_active boolean not null default true,
  imported_values jsonb not null default '{}'::jsonb,
  manual_fields text[] not null default '{}'::text[],
  record_revision bigint not null default 1 check (record_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.lease_unit_included_options (
  unit_id text not null references public.lease_units(id) on delete cascade,
  option_id text not null references public.lease_standard_options(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (unit_id, option_id)
);

create table if not exists public.lease_unit_responsibility_options (
  unit_id text not null references public.lease_units(id) on delete cascade,
  option_id text not null references public.lease_standard_options(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (unit_id, option_id)
);

create table if not exists public.lease_global_defaults (
  singleton boolean primary key default true check (singleton),
  damage_deposit_mode text not null default 'one_month_rent',
  rent_period text not null default 'Month',
  rent_due_day text not null default '1st',
  imported_values jsonb not null default '{}'::jsonb,
  manual_fields text[] not null default '{}'::text[],
  record_revision bigint not null default 1 check (record_revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.lease_global_defaults (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.lease_backups (
  id uuid primary key default gen_random_uuid(),
  backup_format_version integer not null default 1 check (backup_format_version > 0),
  dataset_revision bigint not null check (dataset_revision >= 0),
  reason text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null
);

create table if not exists public.lease_import_history (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('import', 'restore')),
  schema_version integer,
  package_version text,
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_generated_at timestamptz,
  source_cutoff_date date,
  from_revision bigint not null,
  to_revision bigint not null,
  backup_id uuid not null references public.lease_backups(id) on delete restrict,
  raw_payload jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);

create index if not exists lease_units_building_idx on public.lease_units(building_id, display_name);
create index if not exists lease_units_entity_idx on public.lease_units(entity_id);
create index if not exists lease_options_category_active_idx on public.lease_standard_options(category, is_active);
create index if not exists lease_backups_created_idx on public.lease_backups(created_at desc);
create index if not exists lease_import_history_created_idx on public.lease_import_history(created_at desc);

create or replace function private.lease_assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not exists (
    select 1
    from public.profiles p
    where p.id = caller
      and p.role = 'admin'::public.app_role
      and p.is_active
  ) then
    raise exception using errcode = '42501', message = 'Lease administration requires an active admin account.';
  end if;
  return caller;
end;
$function$;

create or replace function private.lease_sha256(value jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
$function$;

create or replace function private.lease_normalize_entity(record jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', record->>'id',
    'legalName', record->>'legalName',
    'addressForService', coalesce(record->>'addressForService', ''),
    'community', coalesce(record->>'community', ''),
    'province', coalesce(record->>'province', ''),
    'postalCode', coalesce(record->>'postalCode', ''),
    'phone', coalesce(record->>'phone', ''),
    'rentPaymentRecipient', coalesce(record->>'rentPaymentRecipient', ''),
    'rentPaymentInstructions', coalesce(record->>'rentPaymentInstructions', ''),
    'rentPaymentAddress', coalesce(record->>'rentPaymentAddress', ''),
    'confidence', record->'confidence',
    'sourceFiles', coalesce(record->'sourceFiles', '[]'::jsonb),
    'active', coalesce((record->>'active')::boolean, true)
  )
$function$;

create or replace function private.lease_normalize_building(record jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', record->>'id',
    'displayName', record->>'displayName',
    'streetAddress', record->>'streetAddress',
    'community', coalesce(record->>'community', ''),
    'province', coalesce(record->>'province', ''),
    'postalCode', coalesce(record->>'postalCode', ''),
    'sourceDirectory', record->'sourceDirectory',
    'confidence', record->'confidence',
    'sourceFiles', coalesce(record->'sourceFiles', '[]'::jsonb),
    'active', coalesce((record->>'active')::boolean, true)
  )
$function$;

create or replace function private.lease_normalize_option(record jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', record->>'id',
    'systemKey', record->'systemKey',
    'category', record->>'category',
    'label', coalesce(record->>'label', record->>'ui_label'),
    'pdfText', coalesce(record->>'pdfText', record->>'canonical_pdf_text'),
    'active', coalesce((record->>'active')::boolean, true),
    'confidence', record->'confidence',
    'sourceFiles', coalesce(record->'sourceFiles', '[]'::jsonb)
  )
$function$;

create or replace function private.lease_normalize_unit(record jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', record->>'id',
    'buildingId', record->>'buildingId',
    'entityId', record->>'entityId',
    'displayName', record->>'displayName',
    'unitNumber', coalesce(record->>'unitNumber', ''),
    'premisesStreetAddress', record->>'premisesStreetAddress',
    'premisesCommunity', coalesce(record->>'premisesCommunity', ''),
    'premisesPostalCode', coalesce(record->>'premisesPostalCode', ''),
    'premisesType', coalesce(record->>'premisesType', ''),
    'defaultRentalRate', record->'defaultRentalRate',
    'rentPeriod', coalesce(record->>'rentPeriod', 'Month'),
    'rentDueDay', coalesce(record->>'rentDueDay', '1st'),
    -- Schema v1 has no explicit state. Populated arrays are known; empty arrays
    -- are deliberately unknown, never known-empty.
    'inclusionsState', case
      when record ? 'inclusionsState' then record->>'inclusionsState'
      when jsonb_array_length(coalesce(record->'includedOptionIds', '[]'::jsonb)) > 0 then 'known_populated'
      else 'unknown'
    end,
    'responsibilitiesState', case
      when record ? 'responsibilitiesState' then record->>'responsibilitiesState'
      when jsonb_array_length(coalesce(record->'tenantResponsibilityOptionIds', '[]'::jsonb)) > 0 then 'known_populated'
      else 'unknown'
    end,
    'includedOptionIds', coalesce(record->'includedOptionIds', '[]'::jsonb),
    'tenantResponsibilityOptionIds', coalesce(record->'tenantResponsibilityOptionIds', '[]'::jsonb),
    'confidence', record->'confidence',
    'sourceFiles', coalesce(record->'sourceFiles', '[]'::jsonb),
    'active', coalesce((record->>'active')::boolean, true)
  )
$function$;

create or replace function private.lease_validation_errors(payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  errors jsonb := '[]'::jsonb;
  duplicate_id text;
  record jsonb;
  option_id text;
  option_category text;
  selected_count integer;
  distinct_count integer;
begin
  perform private.lease_assert_admin();

  if jsonb_typeof(payload) <> 'object' then
    return jsonb_build_array('Portfolio payload must be a JSON object.');
  end if;

  if jsonb_typeof(payload->'schemaVersion') <> 'number' or payload->>'schemaVersion' not in ('1', '2') then
    errors := errors || jsonb_build_array('Unsupported schemaVersion. This importer accepts integer schemaVersion 1 or 2.');
  end if;

  foreach option_id in array array['entities', 'buildings', 'units', 'standardOptions'] loop
    if jsonb_typeof(payload->option_id) <> 'array' then
      errors := errors || jsonb_build_array(format('%s must be an array.', option_id));
    end if;
  end loop;

  if jsonb_typeof(payload->'globalDefaults') <> 'object' then
    errors := errors || jsonb_build_array('globalDefaults must be an object.');
  end if;

  if jsonb_array_length(errors) > 0 then
    return errors;
  end if;

  for duplicate_id in
    select value->>'id'
    from jsonb_array_elements(payload->'entities' || payload->'buildings' || payload->'units' || payload->'standardOptions') value
    group by value->>'id'
    having value->>'id' is null or count(*) > 1
  loop
    errors := errors || jsonb_build_array(format('Duplicate or missing stable ID: %s', coalesce(duplicate_id, '(missing)')));
  end loop;

  for duplicate_id in
    select value->>'systemKey'
    from jsonb_array_elements(payload->'standardOptions') value
    where nullif(value->>'systemKey', '') is not null
    group by value->>'systemKey'
    having count(*) > 1
  loop
    errors := errors || jsonb_build_array(format('Duplicate standard option systemKey: %s', duplicate_id));
  end loop;

  for record in select value from jsonb_array_elements(payload->'entities') loop
    if coalesce(record->>'id', '') !~ '^entity-[a-z0-9][a-z0-9-]*$'
       or btrim(coalesce(record->>'legalName', '')) = ''
       or jsonb_typeof(coalesce(record->'sourceFiles', '[]'::jsonb)) <> 'array'
       or (record ? 'active' and jsonb_typeof(record->'active') <> 'boolean') then
      errors := errors || jsonb_build_array(format('Invalid entity record: %s', coalesce(record->>'id', '(missing ID)')));
    end if;
  end loop;

  for record in select value from jsonb_array_elements(payload->'buildings') loop
    if coalesce(record->>'id', '') !~ '^building-[a-z0-9][a-z0-9-]*$'
       or btrim(coalesce(record->>'displayName', '')) = ''
       or btrim(coalesce(record->>'streetAddress', '')) = ''
       or jsonb_typeof(coalesce(record->'sourceFiles', '[]'::jsonb)) <> 'array'
       or (record ? 'active' and jsonb_typeof(record->'active') <> 'boolean') then
      errors := errors || jsonb_build_array(format('Invalid building record: %s', coalesce(record->>'id', '(missing ID)')));
    end if;
  end loop;

  for record in select value from jsonb_array_elements(payload->'standardOptions') loop
    if coalesce(record->>'id', '') !~ '^option-[a-z0-9][a-z0-9-]*$'
       or coalesce(record->>'category', '') not in ('included_standard', 'included_other', 'tenant_responsibility')
       or btrim(coalesce(record->>'label', record->>'ui_label', '')) = ''
       or btrim(coalesce(record->>'pdfText', record->>'canonical_pdf_text', '')) = ''
       or jsonb_typeof(coalesce(record->'sourceFiles', '[]'::jsonb)) <> 'array'
       or (record ? 'active' and jsonb_typeof(record->'active') <> 'boolean') then
      errors := errors || jsonb_build_array(format('Invalid standard option record: %s', coalesce(record->>'id', '(missing ID)')));
    end if;
    if nullif(record->>'systemKey', '') is not null and exists (
      select 1 from public.lease_standard_options o
      where o.system_key = record->>'systemKey' and o.id <> record->>'id'
    ) then
      errors := errors || jsonb_build_array(format('Standard option %s conflicts with existing systemKey %s.', record->>'id', record->>'systemKey'));
    end if;
  end loop;

  for record in select value from jsonb_array_elements(payload->'units') loop
    if coalesce(record->>'id', '') !~ '^unit-[a-z0-9][a-z0-9-]*$'
       or btrim(coalesce(record->>'displayName', '')) = ''
       or btrim(coalesce(record->>'premisesStreetAddress', '')) = ''
       or jsonb_typeof(record->'defaultRentalRate') <> 'number'
       or (record->>'defaultRentalRate')::numeric < 0
       or jsonb_typeof(coalesce(record->'includedOptionIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(record->'tenantResponsibilityOptionIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(record->'sourceFiles', '[]'::jsonb)) <> 'array'
       or (record ? 'active' and jsonb_typeof(record->'active') <> 'boolean') then
      errors := errors || jsonb_build_array(format('Invalid unit record: %s', coalesce(record->>'id', '(missing ID)')));
      continue;
    end if;

    if payload->>'schemaVersion' = '2' and (
      coalesce(record->>'inclusionsState', '') not in ('unknown', 'known_empty', 'known_populated')
      or coalesce(record->>'responsibilitiesState', '') not in ('unknown', 'known_empty', 'known_populated')
    ) then
      errors := errors || jsonb_build_array(format('Schema v2 unit %s must include valid explicit configuration states.', record->>'id'));
    end if;

    select count(*), count(distinct value) into selected_count, distinct_count
    from jsonb_array_elements_text(coalesce(record->'includedOptionIds', '[]'::jsonb));
    if selected_count <> distinct_count then
      errors := errors || jsonb_build_array(format('Unit %s contains duplicate included option IDs.', record->>'id'));
    end if;
    select count(*), count(distinct value) into selected_count, distinct_count
    from jsonb_array_elements_text(coalesce(record->'tenantResponsibilityOptionIds', '[]'::jsonb));
    if selected_count <> distinct_count then
      errors := errors || jsonb_build_array(format('Unit %s contains duplicate responsibility option IDs.', record->>'id'));
    end if;

    if payload->>'schemaVersion' = '2' then
      if (record->>'inclusionsState' = 'known_populated') <> (jsonb_array_length(record->'includedOptionIds') > 0) then
        errors := errors || jsonb_build_array(format('Unit %s inclusion state does not match its selected options.', record->>'id'));
      end if;
      if (record->>'responsibilitiesState' = 'known_populated') <> (jsonb_array_length(record->'tenantResponsibilityOptionIds') > 0) then
        errors := errors || jsonb_build_array(format('Unit %s responsibility state does not match its selected options.', record->>'id'));
      end if;
    end if;

    if not exists (select 1 from jsonb_array_elements(payload->'buildings') b where b->>'id' = record->>'buildingId')
       and not exists (select 1 from public.lease_buildings b where b.id = record->>'buildingId') then
      errors := errors || jsonb_build_array(format('Unit %s references missing building %s.', record->>'id', record->>'buildingId'));
    end if;
    if not exists (select 1 from jsonb_array_elements(payload->'entities') e where e->>'id' = record->>'entityId')
       and not exists (select 1 from public.lease_entities e where e.id = record->>'entityId') then
      errors := errors || jsonb_build_array(format('Unit %s references missing entity %s.', record->>'id', record->>'entityId'));
    end if;

    for option_id in select jsonb_array_elements_text(coalesce(record->'includedOptionIds', '[]'::jsonb)) loop
      if not exists (select 1 from jsonb_array_elements(payload->'standardOptions') o where o->>'id' = option_id)
         and not exists (select 1 from public.lease_standard_options o where o.id = option_id) then
        errors := errors || jsonb_build_array(format('Unit %s references missing standard option %s.', record->>'id', option_id));
      else
        select coalesce(
          (select o->>'category' from jsonb_array_elements(payload->'standardOptions') o where o->>'id' = option_id limit 1),
          (select o.category::text from public.lease_standard_options o where o.id = option_id)
        ) into option_category;
        if option_category not in ('included_standard', 'included_other') then
          errors := errors || jsonb_build_array(format('Unit %s uses incompatible included option %s.', record->>'id', option_id));
        end if;
      end if;
    end loop;
    for option_id in select jsonb_array_elements_text(coalesce(record->'tenantResponsibilityOptionIds', '[]'::jsonb)) loop
      if not exists (select 1 from jsonb_array_elements(payload->'standardOptions') o where o->>'id' = option_id)
         and not exists (select 1 from public.lease_standard_options o where o.id = option_id) then
        errors := errors || jsonb_build_array(format('Unit %s references missing standard option %s.', record->>'id', option_id));
      else
        select coalesce(
          (select o->>'category' from jsonb_array_elements(payload->'standardOptions') o where o->>'id' = option_id limit 1),
          (select o.category::text from public.lease_standard_options o where o.id = option_id)
        ) into option_category;
        if option_category <> 'tenant_responsibility' then
          errors := errors || jsonb_build_array(format('Unit %s uses incompatible responsibility option %s.', record->>'id', option_id));
        end if;
      end if;
    end loop;
  end loop;

  return errors;
end;
$function$;

create or replace function private.lease_record_conflicts(
  collection_name text,
  record_id text,
  current_values jsonb,
  incoming_values jsonb,
  manual_fields text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'collection', collection_name,
    'id', record_id,
    'field', field_name,
    'current', current_values->field_name,
    'incoming', incoming_values->field_name,
    'defaultResolution', 'keep_current'
  ) order by field_name), '[]'::jsonb)
  from unnest(manual_fields) field_name
  where (current_values->field_name) is distinct from (incoming_values->field_name)
$function$;

create or replace function private.lease_preview_import(payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  errors jsonb;
  conflicts jsonb := '[]'::jsonb;
  item jsonb;
  incoming jsonb;
  current_values jsonb;
  fields text[];
  entity_added integer := 0; entity_updated integer := 0; entity_unchanged integer := 0;
  building_added integer := 0; building_updated integer := 0; building_unchanged integer := 0;
  unit_added integer := 0; unit_updated integer := 0; unit_unchanged integer := 0;
  option_added integer := 0; option_updated integer := 0; option_unchanged integer := 0;
  dataset_revision bigint;
begin
  perform private.lease_assert_admin();
  errors := private.lease_validation_errors(payload);
  select revision into dataset_revision from public.lease_dataset_state where singleton;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object(
      'datasetRevision', dataset_revision,
      'payloadSha256', private.lease_sha256(payload),
      'validationErrors', errors,
      'conflicts', '[]'::jsonb,
      'counts', jsonb_build_object()
    );
  end if;

  for item in select value from jsonb_array_elements(payload->'entities') loop
    incoming := private.lease_normalize_entity(item);
    select manual_fields,
      jsonb_build_object(
        'id', id, 'legalName', legal_name, 'addressForService', address_for_service,
        'community', community, 'province', province, 'postalCode', postal_code,
        'phone', phone, 'rentPaymentRecipient', rent_payment_recipient,
        'rentPaymentInstructions', rent_payment_instructions,
        'rentPaymentAddress', rent_payment_address, 'confidence', to_jsonb(confidence),
        'sourceFiles', source_files, 'active', is_active
      )
    into fields, current_values
    from public.lease_entities where id = item->>'id';
    if not found then entity_added := entity_added + 1;
    elsif current_values = incoming then entity_unchanged := entity_unchanged + 1;
    else
      entity_updated := entity_updated + 1;
      conflicts := conflicts || private.lease_record_conflicts('entities', item->>'id', current_values, incoming, fields);
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'buildings') loop
    incoming := private.lease_normalize_building(item);
    select manual_fields,
      jsonb_build_object(
        'id', id, 'displayName', display_name, 'streetAddress', street_address,
        'community', community, 'province', province, 'postalCode', postal_code,
        'sourceDirectory', to_jsonb(source_directory), 'confidence', to_jsonb(confidence),
        'sourceFiles', source_files, 'active', is_active
      )
    into fields, current_values
    from public.lease_buildings where id = item->>'id';
    if not found then building_added := building_added + 1;
    elsif current_values = incoming then building_unchanged := building_unchanged + 1;
    else
      building_updated := building_updated + 1;
      conflicts := conflicts || private.lease_record_conflicts('buildings', item->>'id', current_values, incoming, fields);
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'standardOptions') loop
    incoming := private.lease_normalize_option(item);
    select manual_fields,
      jsonb_build_object(
        'id', id, 'systemKey', to_jsonb(system_key), 'category', category::text, 'label', label, 'pdfText', pdf_text,
        'active', is_active, 'confidence', to_jsonb(confidence), 'sourceFiles', source_files
      )
    into fields, current_values
    from public.lease_standard_options where id = item->>'id';
    if not found then option_added := option_added + 1;
    elsif current_values = incoming then option_unchanged := option_unchanged + 1;
    else
      option_updated := option_updated + 1;
      conflicts := conflicts || private.lease_record_conflicts('standardOptions', item->>'id', current_values, incoming, fields);
    end if;
  end loop;

  for item in select value from jsonb_array_elements(payload->'units') loop
    incoming := private.lease_normalize_unit(item);
    select manual_fields,
      jsonb_build_object(
        'id', id, 'buildingId', building_id, 'entityId', entity_id,
        'displayName', display_name, 'unitNumber', unit_number,
        'premisesStreetAddress', premises_street_address,
        'premisesCommunity', premises_community, 'premisesPostalCode', premises_postal_code,
        'premisesType', premises_type, 'defaultRentalRate', to_jsonb(default_rental_rate),
        'rentPeriod', rent_period, 'rentDueDay', rent_due_day,
        'inclusionsState', inclusions_state::text,
        'responsibilitiesState', responsibilities_state::text,
        'includedOptionIds', coalesce((select jsonb_agg(x.option_id order by x.sort_order, x.option_id) from public.lease_unit_included_options x where x.unit_id = lease_units.id), '[]'::jsonb),
        'tenantResponsibilityOptionIds', coalesce((select jsonb_agg(x.option_id order by x.sort_order, x.option_id) from public.lease_unit_responsibility_options x where x.unit_id = lease_units.id), '[]'::jsonb),
        'confidence', to_jsonb(confidence), 'sourceFiles', source_files, 'active', is_active
      )
    into fields, current_values
    from public.lease_units where id = item->>'id';
    if not found then unit_added := unit_added + 1;
    elsif current_values = incoming then unit_unchanged := unit_unchanged + 1;
    else
      unit_updated := unit_updated + 1;
      conflicts := conflicts || private.lease_record_conflicts('units', item->>'id', current_values, incoming, fields);
    end if;
  end loop;

  return jsonb_build_object(
    'datasetRevision', dataset_revision,
    'payloadSha256', private.lease_sha256(payload),
    'validationErrors', errors,
    'conflicts', conflicts,
    'counts', jsonb_build_object(
      'entities', jsonb_build_object('added', entity_added, 'updated', entity_updated, 'unchanged', entity_unchanged),
      'buildings', jsonb_build_object('added', building_added, 'updated', building_updated, 'unchanged', building_unchanged),
      'units', jsonb_build_object('added', unit_added, 'updated', unit_updated, 'unchanged', unit_unchanged),
      'standardOptions', jsonb_build_object('added', option_added, 'updated', option_updated, 'unchanged', option_unchanged)
    )
  );
end;
$function$;

create or replace function private.lease_portfolio_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'backupFormatVersion', 1,
    'datasetRevision', (select revision from public.lease_dataset_state where singleton),
    'entities', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lease_entities t), '[]'::jsonb),
    'buildings', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lease_buildings t), '[]'::jsonb),
    'standardOptions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lease_standard_options t), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lease_units t), '[]'::jsonb),
    'includedOptions', coalesce((select jsonb_agg(to_jsonb(t) order by t.unit_id, t.sort_order, t.option_id) from public.lease_unit_included_options t), '[]'::jsonb),
    'responsibilityOptions', coalesce((select jsonb_agg(to_jsonb(t) order by t.unit_id, t.sort_order, t.option_id) from public.lease_unit_responsibility_options t), '[]'::jsonb),
    'globalDefaults', (select to_jsonb(t) from public.lease_global_defaults t where singleton)
  )
$function$;

create or replace function private.lease_keep_current(
  fields text[], collection_name text, record_id text, field_name text, resolutions jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select field_name = any(fields)
    and coalesce(resolutions #>> array[collection_name, record_id, field_name], 'keep_current') <> 'accept_incoming'
$function$;

create or replace function private.lease_next_manual_fields(
  fields text[], collection_name text, record_id text, resolutions jsonb
)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(array_agg(field_name order by field_name), '{}'::text[])
  from unnest(fields) field_name
  where coalesce(resolutions #>> array[collection_name, record_id, field_name], 'keep_current') <> 'accept_incoming'
$function$;

create or replace function private.lease_create_backup(reason text, actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  snapshot_value jsonb := private.lease_portfolio_snapshot();
  backup_id uuid;
  revision_value bigint;
begin
  select revision into revision_value from public.lease_dataset_state where singleton;
  insert into public.lease_backups (dataset_revision, reason, snapshot, snapshot_sha256, created_by)
  values (revision_value, reason, snapshot_value, private.lease_sha256(snapshot_value), actor)
  returning id into backup_id;
  return backup_id;
end;
$function$;

create or replace function private.lease_commit_import(
  payload jsonb,
  expected_revision bigint,
  expected_payload_sha256 text,
  resolutions jsonb default '{}'::jsonb,
  package_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := private.lease_assert_admin();
  current_revision bigint;
  payload_sha text := private.lease_sha256(payload);
  preview jsonb;
  backup_id uuid;
  item jsonb;
  incoming jsonb;
  unit_record public.lease_units%rowtype;
  next_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease-portfolio-dataset', 0));
  select revision into current_revision from public.lease_dataset_state where singleton for update;

  if current_revision <> expected_revision then
    raise exception using errcode = '40001', message = 'STALE_PREVIEW: portfolio data changed; preview the import again.';
  end if;
  if payload_sha <> expected_payload_sha256 then
    raise exception using errcode = '22023', message = 'PAYLOAD_CHANGED: selected data differs from the previewed payload.';
  end if;

  preview := private.lease_preview_import(payload);
  if jsonb_array_length(preview->'validationErrors') > 0 then
    raise exception using errcode = '22023', message = 'INVALID_PORTFOLIO: ' || (preview->'validationErrors')::text;
  end if;

  backup_id := private.lease_create_backup('Before portfolio import ' || payload_sha, actor);

  for item in select value from jsonb_array_elements(payload->'entities') loop
    incoming := private.lease_normalize_entity(item);
    insert into public.lease_entities (
      id, legal_name, address_for_service, community, province, postal_code, phone,
      rent_payment_recipient, rent_payment_instructions, rent_payment_address,
      confidence, source_files, is_active, imported_values, updated_by
    ) values (
      incoming->>'id', incoming->>'legalName', incoming->>'addressForService', incoming->>'community',
      incoming->>'province', incoming->>'postalCode', incoming->>'phone', incoming->>'rentPaymentRecipient',
      incoming->>'rentPaymentInstructions', incoming->>'rentPaymentAddress', incoming->>'confidence',
      incoming->'sourceFiles', (incoming->>'active')::boolean, incoming, actor
    )
    on conflict (id) do update set
      legal_name = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'legalName',resolutions) then lease_entities.legal_name else excluded.legal_name end,
      address_for_service = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'addressForService',resolutions) then lease_entities.address_for_service else excluded.address_for_service end,
      community = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'community',resolutions) then lease_entities.community else excluded.community end,
      province = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'province',resolutions) then lease_entities.province else excluded.province end,
      postal_code = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'postalCode',resolutions) then lease_entities.postal_code else excluded.postal_code end,
      phone = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'phone',resolutions) then lease_entities.phone else excluded.phone end,
      rent_payment_recipient = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'rentPaymentRecipient',resolutions) then lease_entities.rent_payment_recipient else excluded.rent_payment_recipient end,
      rent_payment_instructions = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'rentPaymentInstructions',resolutions) then lease_entities.rent_payment_instructions else excluded.rent_payment_instructions end,
      rent_payment_address = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'rentPaymentAddress',resolutions) then lease_entities.rent_payment_address else excluded.rent_payment_address end,
      confidence = excluded.confidence, source_files = excluded.source_files,
      is_active = case when private.lease_keep_current(lease_entities.manual_fields,'entities',lease_entities.id,'active',resolutions) then lease_entities.is_active else excluded.is_active end,
      imported_values = excluded.imported_values,
      manual_fields = private.lease_next_manual_fields(lease_entities.manual_fields,'entities',lease_entities.id,resolutions),
      record_revision = lease_entities.record_revision + 1, updated_at = now(), updated_by = actor
    where lease_entities.imported_values is distinct from excluded.imported_values
       or resolutions #> array['entities', lease_entities.id] is not null;
  end loop;

  for item in select value from jsonb_array_elements(payload->'buildings') loop
    incoming := private.lease_normalize_building(item);
    insert into public.lease_buildings (
      id, display_name, street_address, community, province, postal_code, source_directory,
      confidence, source_files, is_active, imported_values, updated_by
    ) values (
      incoming->>'id', incoming->>'displayName', incoming->>'streetAddress', incoming->>'community',
      incoming->>'province', incoming->>'postalCode', incoming->>'sourceDirectory', incoming->>'confidence',
      incoming->'sourceFiles', (incoming->>'active')::boolean, incoming, actor
    )
    on conflict (id) do update set
      display_name = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'displayName',resolutions) then lease_buildings.display_name else excluded.display_name end,
      street_address = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'streetAddress',resolutions) then lease_buildings.street_address else excluded.street_address end,
      community = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'community',resolutions) then lease_buildings.community else excluded.community end,
      province = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'province',resolutions) then lease_buildings.province else excluded.province end,
      postal_code = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'postalCode',resolutions) then lease_buildings.postal_code else excluded.postal_code end,
      source_directory = excluded.source_directory, confidence = excluded.confidence, source_files = excluded.source_files,
      is_active = case when private.lease_keep_current(lease_buildings.manual_fields,'buildings',lease_buildings.id,'active',resolutions) then lease_buildings.is_active else excluded.is_active end,
      imported_values = excluded.imported_values,
      manual_fields = private.lease_next_manual_fields(lease_buildings.manual_fields,'buildings',lease_buildings.id,resolutions),
      record_revision = lease_buildings.record_revision + 1, updated_at = now(), updated_by = actor
    where lease_buildings.imported_values is distinct from excluded.imported_values
       or resolutions #> array['buildings', lease_buildings.id] is not null;
  end loop;

  for item in select value from jsonb_array_elements(payload->'standardOptions') loop
    incoming := private.lease_normalize_option(item);
    insert into public.lease_standard_options (
      id, system_key, category, label, pdf_text, is_active, confidence, source_files, imported_values, updated_by
    ) values (
      incoming->>'id', incoming->>'systemKey', (incoming->>'category')::public.lease_option_category, incoming->>'label', incoming->>'pdfText',
      (incoming->>'active')::boolean, incoming->>'confidence', incoming->'sourceFiles', incoming, actor
    )
    on conflict (id) do update set
      system_key = case when private.lease_keep_current(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,'systemKey',resolutions) then lease_standard_options.system_key else excluded.system_key end,
      category = case when private.lease_keep_current(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,'category',resolutions) then lease_standard_options.category else excluded.category end,
      label = case when private.lease_keep_current(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,'label',resolutions) then lease_standard_options.label else excluded.label end,
      pdf_text = case when private.lease_keep_current(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,'pdfText',resolutions) then lease_standard_options.pdf_text else excluded.pdf_text end,
      is_active = case when private.lease_keep_current(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,'active',resolutions) then lease_standard_options.is_active else excluded.is_active end,
      confidence = excluded.confidence, source_files = excluded.source_files, imported_values = excluded.imported_values,
      manual_fields = private.lease_next_manual_fields(lease_standard_options.manual_fields,'standardOptions',lease_standard_options.id,resolutions),
      record_revision = lease_standard_options.record_revision + 1, updated_at = now(), updated_by = actor
    where lease_standard_options.imported_values is distinct from excluded.imported_values
       or resolutions #> array['standardOptions', lease_standard_options.id] is not null;
  end loop;

  for item in select value from jsonb_array_elements(payload->'units') loop
    incoming := private.lease_normalize_unit(item);
    unit_record := null;
    insert into public.lease_units (
      id, building_id, entity_id, display_name, unit_number, premises_street_address,
      premises_community, premises_postal_code, premises_type, default_rental_rate,
      rent_period, rent_due_day, inclusions_state, responsibilities_state, confidence,
      source_files, is_active, imported_values, updated_by
    ) values (
      incoming->>'id', incoming->>'buildingId', incoming->>'entityId', incoming->>'displayName', incoming->>'unitNumber',
      incoming->>'premisesStreetAddress', incoming->>'premisesCommunity', incoming->>'premisesPostalCode',
      incoming->>'premisesType', (incoming->>'defaultRentalRate')::numeric, incoming->>'rentPeriod', incoming->>'rentDueDay',
      (incoming->>'inclusionsState')::public.lease_configuration_state,
      (incoming->>'responsibilitiesState')::public.lease_configuration_state,
      incoming->>'confidence', incoming->'sourceFiles', (incoming->>'active')::boolean, incoming, actor
    )
    on conflict (id) do update set
      building_id = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'buildingId',resolutions) then lease_units.building_id else excluded.building_id end,
      entity_id = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'entityId',resolutions) then lease_units.entity_id else excluded.entity_id end,
      display_name = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'displayName',resolutions) then lease_units.display_name else excluded.display_name end,
      unit_number = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'unitNumber',resolutions) then lease_units.unit_number else excluded.unit_number end,
      premises_street_address = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'premisesStreetAddress',resolutions) then lease_units.premises_street_address else excluded.premises_street_address end,
      premises_community = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'premisesCommunity',resolutions) then lease_units.premises_community else excluded.premises_community end,
      premises_postal_code = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'premisesPostalCode',resolutions) then lease_units.premises_postal_code else excluded.premises_postal_code end,
      premises_type = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'premisesType',resolutions) then lease_units.premises_type else excluded.premises_type end,
      default_rental_rate = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'defaultRentalRate',resolutions) then lease_units.default_rental_rate else excluded.default_rental_rate end,
      rent_period = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'rentPeriod',resolutions) then lease_units.rent_period else excluded.rent_period end,
      rent_due_day = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'rentDueDay',resolutions) then lease_units.rent_due_day else excluded.rent_due_day end,
      inclusions_state = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'inclusionsState',resolutions) then lease_units.inclusions_state else excluded.inclusions_state end,
      responsibilities_state = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'responsibilitiesState',resolutions) then lease_units.responsibilities_state else excluded.responsibilities_state end,
      confidence = excluded.confidence, source_files = excluded.source_files,
      is_active = case when private.lease_keep_current(lease_units.manual_fields,'units',lease_units.id,'active',resolutions) then lease_units.is_active else excluded.is_active end,
      imported_values = excluded.imported_values,
      manual_fields = private.lease_next_manual_fields(lease_units.manual_fields,'units',lease_units.id,resolutions),
      record_revision = lease_units.record_revision + 1, updated_at = now(), updated_by = actor
    where lease_units.imported_values is distinct from excluded.imported_values
       or resolutions #> array['units', lease_units.id] is not null
    returning * into unit_record;

    if unit_record.id is null then
      select * into unit_record from public.lease_units where id = incoming->>'id';
    end if;

    if not private.lease_keep_current(unit_record.manual_fields, 'units', unit_record.id, 'includedOptionIds', resolutions) then
      delete from public.lease_unit_included_options where unit_id = unit_record.id;
      insert into public.lease_unit_included_options (unit_id, option_id, sort_order)
      select unit_record.id, value, ordinality::integer - 1
      from jsonb_array_elements_text(incoming->'includedOptionIds') with ordinality;
    end if;
    if not private.lease_keep_current(unit_record.manual_fields, 'units', unit_record.id, 'tenantResponsibilityOptionIds', resolutions) then
      delete from public.lease_unit_responsibility_options where unit_id = unit_record.id;
      insert into public.lease_unit_responsibility_options (unit_id, option_id, sort_order)
      select unit_record.id, value, ordinality::integer - 1
      from jsonb_array_elements_text(incoming->'tenantResponsibilityOptionIds') with ordinality;
    end if;
  end loop;

  incoming := jsonb_build_object(
    'damageDepositMode', coalesce(payload->'globalDefaults'->>'damageDepositMode', 'one_month_rent'),
    'rentPeriod', coalesce(payload->'globalDefaults'->>'rentPeriod', 'Month'),
    'rentDueDay', coalesce(payload->'globalDefaults'->>'rentDueDay', '1st')
  );
  update public.lease_global_defaults set
    damage_deposit_mode = case when private.lease_keep_current(manual_fields,'globalDefaults','singleton','damageDepositMode',resolutions) then damage_deposit_mode else incoming->>'damageDepositMode' end,
    rent_period = case when private.lease_keep_current(manual_fields,'globalDefaults','singleton','rentPeriod',resolutions) then rent_period else incoming->>'rentPeriod' end,
    rent_due_day = case when private.lease_keep_current(manual_fields,'globalDefaults','singleton','rentDueDay',resolutions) then rent_due_day else incoming->>'rentDueDay' end,
    imported_values = incoming,
    manual_fields = private.lease_next_manual_fields(manual_fields,'globalDefaults','singleton',resolutions),
    record_revision = record_revision + 1, updated_at = now(), updated_by = actor
  where singleton;

  next_revision := current_revision + 1;
  update public.lease_dataset_state
  set revision = next_revision, schema_version = 1, updated_at = now(), updated_by = actor
  where singleton;

  insert into public.lease_import_history (
    operation, schema_version, package_version, payload_sha256, source_generated_at,
    source_cutoff_date, from_revision, to_revision, backup_id, raw_payload, result, created_by
  ) values (
    'import', (payload->>'schemaVersion')::integer, package_version, payload_sha,
    nullif(payload->'generatedFrom'->>'generatedAt', '')::timestamptz,
    nullif(payload->'generatedFrom'->>'cutoffDate', '')::date,
    current_revision, next_revision, backup_id, payload,
    preview || jsonb_build_object('backupId', backup_id, 'newDatasetRevision', next_revision), actor
  );

  return preview || jsonb_build_object('backupId', backup_id, 'newDatasetRevision', next_revision);
end;
$function$;

create or replace function private.lease_save_record(
  collection_name text,
  record_id text,
  patch jsonb,
  expected_record_revision bigint,
  expected_dataset_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := private.lease_assert_admin();
  current_revision bigint;
  next_revision bigint;
  saved jsonb;
  patch_fields text[] := coalesce(array(select key from jsonb_object_keys(patch) key), '{}'::text[]);
  included_ids text[];
  responsibility_ids text[];
  inclusion_state public.lease_configuration_state;
  responsibility_state public.lease_configuration_state;
begin
  if jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'PATCH_INVALID: patch must be a JSON object.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease-portfolio-dataset', 0));
  select revision into current_revision from public.lease_dataset_state where singleton for update;
  if current_revision <> expected_dataset_revision then
    raise exception using errcode = '40001', message = 'STALE_DATASET: portfolio data changed; reload Manage and try again.';
  end if;

  case collection_name
    when 'entities' then
      if patch - array['legalName','addressForService','community','province','postalCode','phone','rentPaymentRecipient','rentPaymentInstructions','rentPaymentAddress','active'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: entity patch contains unsupported fields.';
      end if;
      update public.lease_entities set
        legal_name = case when patch ? 'legalName' then patch->>'legalName' else legal_name end,
        address_for_service = case when patch ? 'addressForService' then coalesce(patch->>'addressForService','') else address_for_service end,
        community = case when patch ? 'community' then coalesce(patch->>'community','') else community end,
        province = case when patch ? 'province' then coalesce(patch->>'province','') else province end,
        postal_code = case when patch ? 'postalCode' then coalesce(patch->>'postalCode','') else postal_code end,
        phone = case when patch ? 'phone' then coalesce(patch->>'phone','') else phone end,
        rent_payment_recipient = case when patch ? 'rentPaymentRecipient' then coalesce(patch->>'rentPaymentRecipient','') else rent_payment_recipient end,
        rent_payment_instructions = case when patch ? 'rentPaymentInstructions' then coalesce(patch->>'rentPaymentInstructions','') else rent_payment_instructions end,
        rent_payment_address = case when patch ? 'rentPaymentAddress' then coalesce(patch->>'rentPaymentAddress','') else rent_payment_address end,
        is_active = case when patch ? 'active' then (patch->>'active')::boolean else is_active end,
        manual_fields = array(select distinct f from unnest(manual_fields || patch_fields) f order by f),
        record_revision = record_revision + 1, updated_at = now(), updated_by = actor
      where id = record_id and record_revision = expected_record_revision
      returning to_jsonb(lease_entities) into saved;

    when 'buildings' then
      if patch - array['displayName','streetAddress','community','province','postalCode','active'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: building patch contains unsupported fields.';
      end if;
      update public.lease_buildings set
        display_name = case when patch ? 'displayName' then patch->>'displayName' else display_name end,
        street_address = case when patch ? 'streetAddress' then patch->>'streetAddress' else street_address end,
        community = case when patch ? 'community' then coalesce(patch->>'community','') else community end,
        province = case when patch ? 'province' then coalesce(patch->>'province','') else province end,
        postal_code = case when patch ? 'postalCode' then coalesce(patch->>'postalCode','') else postal_code end,
        is_active = case when patch ? 'active' then (patch->>'active')::boolean else is_active end,
        manual_fields = array(select distinct f from unnest(manual_fields || patch_fields) f order by f),
        record_revision = record_revision + 1, updated_at = now(), updated_by = actor
      where id = record_id and record_revision = expected_record_revision
      returning to_jsonb(lease_buildings) into saved;

    when 'standardOptions' then
      if patch - array['category','label','pdfText','active'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: option patch contains unsupported fields.';
      end if;
      if expected_record_revision = 0 then
        if record_id !~ '^option-[a-z0-9][a-z0-9-]*$'
           or coalesce(patch->>'category','') not in ('included_standard','included_other','tenant_responsibility')
           or btrim(coalesce(patch->>'label','')) = ''
           or btrim(coalesce(patch->>'pdfText','')) = '' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: a new option requires a valid stable ID, category, label and PDF text.';
        end if;
        insert into public.lease_standard_options (
          id, category, label, pdf_text, is_active, manual_fields, updated_by
        ) values (
          record_id, (patch->>'category')::public.lease_option_category,
          patch->>'label', patch->>'pdfText', coalesce((patch->>'active')::boolean, true),
          array['category','label','pdfText','active'], actor
        )
        on conflict (id) do nothing
        returning to_jsonb(lease_standard_options) into saved;
        if saved is null then
          raise exception using errcode = '40001', message = 'STALE_RECORD: option ID already exists.';
        end if;
      else
        update public.lease_standard_options set
          category = case when patch ? 'category' then (patch->>'category')::public.lease_option_category else category end,
          label = case when patch ? 'label' then patch->>'label' else label end,
          pdf_text = case when patch ? 'pdfText' then patch->>'pdfText' else pdf_text end,
          is_active = case when patch ? 'active' then (patch->>'active')::boolean else is_active end,
          manual_fields = array(select distinct f from unnest(manual_fields || patch_fields) f order by f),
          record_revision = record_revision + 1, updated_at = now(), updated_by = actor
        where id = record_id and record_revision = expected_record_revision
        returning to_jsonb(lease_standard_options) into saved;
      end if;

    when 'units' then
      if patch - array['buildingId','entityId','displayName','unitNumber','premisesStreetAddress','premisesCommunity','premisesPostalCode','premisesType','defaultRentalRate','rentPeriod','rentDueDay','inclusionsState','responsibilitiesState','includedOptionIds','tenantResponsibilityOptionIds','active'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: unit patch contains unsupported fields.';
      end if;

      select coalesce(array_agg(option_id order by sort_order, option_id), '{}'::text[])
      into included_ids from public.lease_unit_included_options where unit_id = record_id;
      select coalesce(array_agg(option_id order by sort_order, option_id), '{}'::text[])
      into responsibility_ids from public.lease_unit_responsibility_options where unit_id = record_id;
      select inclusions_state, responsibilities_state into inclusion_state, responsibility_state
      from public.lease_units where id = record_id and record_revision = expected_record_revision;

      if not found then
        raise exception using errcode = '40001', message = 'STALE_RECORD: unit changed or no longer exists.';
      end if;

      if patch ? 'includedOptionIds' then
        if jsonb_typeof(patch->'includedOptionIds') <> 'array' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: includedOptionIds must be an array.';
        end if;
        select coalesce(array_agg(value order by ordinality), '{}'::text[]) into included_ids
        from jsonb_array_elements_text(patch->'includedOptionIds') with ordinality;
        inclusion_state := case when cardinality(included_ids) > 0 then 'known_populated' else 'known_empty' end;
      end if;
      if patch ? 'tenantResponsibilityOptionIds' then
        if jsonb_typeof(patch->'tenantResponsibilityOptionIds') <> 'array' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: tenantResponsibilityOptionIds must be an array.';
        end if;
        select coalesce(array_agg(value order by ordinality), '{}'::text[]) into responsibility_ids
        from jsonb_array_elements_text(patch->'tenantResponsibilityOptionIds') with ordinality;
        responsibility_state := case when cardinality(responsibility_ids) > 0 then 'known_populated' else 'known_empty' end;
      end if;
      if patch ? 'inclusionsState' then inclusion_state := (patch->>'inclusionsState')::public.lease_configuration_state; end if;
      if patch ? 'responsibilitiesState' then responsibility_state := (patch->>'responsibilitiesState')::public.lease_configuration_state; end if;

      if (inclusion_state = 'known_populated' and cardinality(included_ids) = 0)
         or (inclusion_state in ('unknown','known_empty') and cardinality(included_ids) > 0) then
        raise exception using errcode = '23514', message = 'STATE_INVALID: inclusion state does not match selected options.';
      end if;
      if (responsibility_state = 'known_populated' and cardinality(responsibility_ids) = 0)
         or (responsibility_state in ('unknown','known_empty') and cardinality(responsibility_ids) > 0) then
        raise exception using errcode = '23514', message = 'STATE_INVALID: responsibility state does not match selected options.';
      end if;
      if exists (
        select 1 from unnest(included_ids) id
        left join public.lease_standard_options o on o.id = id
        where o.id is null or o.category not in ('included_standard','included_other')
      ) then raise exception using errcode = '23503', message = 'OPTION_INVALID: included options contain a missing or incompatible option.'; end if;
      if exists (
        select 1 from unnest(responsibility_ids) id
        left join public.lease_standard_options o on o.id = id
        where o.id is null or o.category <> 'tenant_responsibility'
      ) then raise exception using errcode = '23503', message = 'OPTION_INVALID: responsibilities contain a missing or incompatible option.'; end if;

      update public.lease_units set
        building_id = case when patch ? 'buildingId' then patch->>'buildingId' else building_id end,
        entity_id = case when patch ? 'entityId' then patch->>'entityId' else entity_id end,
        display_name = case when patch ? 'displayName' then patch->>'displayName' else display_name end,
        unit_number = case when patch ? 'unitNumber' then coalesce(patch->>'unitNumber','') else unit_number end,
        premises_street_address = case when patch ? 'premisesStreetAddress' then patch->>'premisesStreetAddress' else premises_street_address end,
        premises_community = case when patch ? 'premisesCommunity' then coalesce(patch->>'premisesCommunity','') else premises_community end,
        premises_postal_code = case when patch ? 'premisesPostalCode' then coalesce(patch->>'premisesPostalCode','') else premises_postal_code end,
        premises_type = case when patch ? 'premisesType' then coalesce(patch->>'premisesType','') else premises_type end,
        default_rental_rate = case when patch ? 'defaultRentalRate' then (patch->>'defaultRentalRate')::numeric else default_rental_rate end,
        rent_period = case when patch ? 'rentPeriod' then patch->>'rentPeriod' else rent_period end,
        rent_due_day = case when patch ? 'rentDueDay' then patch->>'rentDueDay' else rent_due_day end,
        inclusions_state = inclusion_state, responsibilities_state = responsibility_state,
        is_active = case when patch ? 'active' then (patch->>'active')::boolean else is_active end,
        manual_fields = array(select distinct f from unnest(manual_fields || patch_fields || case when patch ? 'includedOptionIds' then array['inclusionsState'] else '{}'::text[] end || case when patch ? 'tenantResponsibilityOptionIds' then array['responsibilitiesState'] else '{}'::text[] end) f order by f),
        record_revision = record_revision + 1, updated_at = now(), updated_by = actor
      where id = record_id and record_revision = expected_record_revision
      returning to_jsonb(lease_units) into saved;

      delete from public.lease_unit_included_options where unit_id = record_id;
      insert into public.lease_unit_included_options (unit_id, option_id, sort_order)
      select record_id, id, ordinality::integer - 1 from unnest(included_ids) with ordinality as x(id, ordinality);
      delete from public.lease_unit_responsibility_options where unit_id = record_id;
      insert into public.lease_unit_responsibility_options (unit_id, option_id, sort_order)
      select record_id, id, ordinality::integer - 1 from unnest(responsibility_ids) with ordinality as x(id, ordinality);

    when 'globalDefaults' then
      if record_id <> 'singleton' or patch - array['damageDepositMode','rentPeriod','rentDueDay'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: invalid global defaults patch.';
      end if;
      update public.lease_global_defaults set
        damage_deposit_mode = case when patch ? 'damageDepositMode' then patch->>'damageDepositMode' else damage_deposit_mode end,
        rent_period = case when patch ? 'rentPeriod' then patch->>'rentPeriod' else rent_period end,
        rent_due_day = case when patch ? 'rentDueDay' then patch->>'rentDueDay' else rent_due_day end,
        manual_fields = array(select distinct f from unnest(manual_fields || patch_fields) f order by f),
        record_revision = record_revision + 1, updated_at = now(), updated_by = actor
      where singleton and record_revision = expected_record_revision
      returning to_jsonb(lease_global_defaults) into saved;
    else
      raise exception using errcode = '22023', message = 'PATCH_INVALID: unsupported collection.';
  end case;

  if saved is null then
    raise exception using errcode = '40001', message = 'STALE_RECORD: record changed or no longer exists.';
  end if;

  next_revision := current_revision + 1;
  update public.lease_dataset_state set revision = next_revision, updated_at = now(), updated_by = actor where singleton;
  return jsonb_build_object('record', saved, 'newDatasetRevision', next_revision);
end;
$function$;

create or replace function private.lease_manual_backup(reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := private.lease_assert_admin();
  backup_id uuid;
  revision_value bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('lease-portfolio-dataset', 0));
  select revision into revision_value from public.lease_dataset_state where singleton;
  backup_id := private.lease_create_backup(coalesce(nullif(btrim(reason), ''), 'Manual backup'), actor);
  return jsonb_build_object('backupId', backup_id, 'datasetRevision', revision_value);
end;
$function$;

create or replace function private.lease_restore_backup(backup_id uuid, expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := private.lease_assert_admin();
  current_revision bigint;
  snapshot_value jsonb;
  pre_restore_backup uuid;
  next_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease-portfolio-dataset', 0));
  select revision into current_revision from public.lease_dataset_state where singleton for update;
  if current_revision <> expected_revision then
    raise exception using errcode = '40001', message = 'STALE_PREVIEW: portfolio data changed; preview the restore again.';
  end if;

  select snapshot into snapshot_value from public.lease_backups where id = backup_id;
  if snapshot_value is null or snapshot_value->>'backupFormatVersion' <> '1'
     or private.lease_sha256(snapshot_value) <> (select snapshot_sha256 from public.lease_backups where id = backup_id) then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP: backup is missing, incompatible, or corrupt.';
  end if;

  pre_restore_backup := private.lease_create_backup('Before restoring backup ' || backup_id::text, actor);

  delete from public.lease_unit_included_options;
  delete from public.lease_unit_responsibility_options;
  delete from public.lease_units;
  delete from public.lease_standard_options;
  delete from public.lease_buildings;
  delete from public.lease_entities;

  insert into public.lease_entities select * from jsonb_populate_recordset(null::public.lease_entities, snapshot_value->'entities');
  insert into public.lease_buildings select * from jsonb_populate_recordset(null::public.lease_buildings, snapshot_value->'buildings');
  insert into public.lease_standard_options select * from jsonb_populate_recordset(null::public.lease_standard_options, snapshot_value->'standardOptions');
  insert into public.lease_units select * from jsonb_populate_recordset(null::public.lease_units, snapshot_value->'units');
  insert into public.lease_unit_included_options select * from jsonb_populate_recordset(null::public.lease_unit_included_options, snapshot_value->'includedOptions');
  insert into public.lease_unit_responsibility_options select * from jsonb_populate_recordset(null::public.lease_unit_responsibility_options, snapshot_value->'responsibilityOptions');

  delete from public.lease_global_defaults;
  insert into public.lease_global_defaults select * from jsonb_populate_record(null::public.lease_global_defaults, snapshot_value->'globalDefaults');

  next_revision := current_revision + 1;
  update public.lease_dataset_state set revision = next_revision, updated_at = now(), updated_by = actor where singleton;

  insert into public.lease_import_history (
    operation, from_revision, to_revision, backup_id, result, created_by
  ) values (
    'restore', current_revision, next_revision, pre_restore_backup,
    jsonb_build_object('restoredBackupId', backup_id, 'preRestoreBackupId', pre_restore_backup, 'newDatasetRevision', next_revision), actor
  );

  return jsonb_build_object('restoredBackupId', backup_id, 'preRestoreBackupId', pre_restore_backup, 'newDatasetRevision', next_revision);
end;
$function$;

create or replace function private.lease_export_portfolio()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'schemaVersion', 2,
    'exportedAt', now(),
    'datasetRevision', (select revision from public.lease_dataset_state where singleton),
    'entities', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'legalName', legal_name, 'addressForService', address_for_service,
      'community', community, 'province', province, 'postalCode', postal_code,
      'phone', phone, 'rentPaymentRecipient', rent_payment_recipient,
      'rentPaymentInstructions', rent_payment_instructions, 'rentPaymentAddress', rent_payment_address,
      'active', is_active
    ) order by id) from public.lease_entities), '[]'::jsonb),
    'buildings', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'displayName', display_name, 'streetAddress', street_address,
      'community', community, 'province', province, 'postalCode', postal_code, 'active', is_active
    ) order by id) from public.lease_buildings), '[]'::jsonb),
    'standardOptions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'systemKey', system_key, 'category', category, 'label', label, 'pdfText', pdf_text, 'active', is_active
    ) order by id) from public.lease_standard_options), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'buildingId', u.building_id, 'entityId', u.entity_id,
      'displayName', u.display_name, 'unitNumber', u.unit_number,
      'premisesStreetAddress', u.premises_street_address, 'premisesCommunity', u.premises_community,
      'premisesPostalCode', u.premises_postal_code, 'premisesType', u.premises_type,
      'defaultRentalRate', u.default_rental_rate, 'rentPeriod', u.rent_period, 'rentDueDay', u.rent_due_day,
      'inclusionsState', u.inclusions_state, 'responsibilitiesState', u.responsibilities_state,
      'includedOptionIds', coalesce((select jsonb_agg(x.option_id order by x.sort_order, x.option_id) from public.lease_unit_included_options x where x.unit_id = u.id), '[]'::jsonb),
      'tenantResponsibilityOptionIds', coalesce((select jsonb_agg(x.option_id order by x.sort_order, x.option_id) from public.lease_unit_responsibility_options x where x.unit_id = u.id), '[]'::jsonb),
      'active', u.is_active
    ) order by u.id) from public.lease_units u), '[]'::jsonb),
    'globalDefaults', (select jsonb_build_object(
      'damageDepositMode', damage_deposit_mode, 'rentPeriod', rent_period, 'rentDueDay', rent_due_day
    ) from public.lease_global_defaults where singleton)
  )
$function$;

-- Public Data API entrypoints are invoker wrappers. The private implementations
-- both pin search_path and independently enforce active-admin authorization.
create or replace function public.lease_preview_portfolio_import(payload jsonb)
returns jsonb language sql stable security invoker set search_path = ''
as $function$ select private.lease_preview_import(payload) $function$;

create or replace function public.lease_commit_portfolio_import(
  payload jsonb, expected_revision bigint, expected_payload_sha256 text,
  resolutions jsonb default '{}'::jsonb, package_version text default null
)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$
  select private.lease_commit_import(payload, expected_revision, expected_payload_sha256, resolutions, package_version)
$function$;

create or replace function public.lease_restore_portfolio_backup(backup_id uuid, expected_revision bigint)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select private.lease_restore_backup(backup_id, expected_revision) $function$;

create or replace function public.lease_export_portfolio_data()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $function$
begin
  perform private.lease_assert_admin();
  return private.lease_export_portfolio();
end;
$function$;

create or replace function public.lease_get_dataset_revision()
returns bigint language plpgsql stable security invoker set search_path = ''
as $function$
begin
  perform private.lease_assert_admin();
  return (select revision from public.lease_dataset_state where singleton);
end;
$function$;

create or replace function public.lease_admin_save_record(
  collection_name text, record_id text, patch jsonb,
  expected_record_revision bigint, expected_dataset_revision bigint
)
returns jsonb language sql volatile security invoker set search_path = ''
as $function$
  select private.lease_save_record(collection_name, record_id, patch, expected_record_revision, expected_dataset_revision)
$function$;

create or replace function public.lease_create_portfolio_backup(reason text default 'Manual backup')
returns jsonb language sql volatile security invoker set search_path = ''
as $function$ select private.lease_manual_backup(reason) $function$;

-- Tables are readable only by active admins. Mutation happens through reviewed
-- RPCs so optimistic concurrency and provenance cannot be bypassed accidentally.
alter table public.lease_dataset_state enable row level security;
alter table public.lease_entities enable row level security;
alter table public.lease_buildings enable row level security;
alter table public.lease_standard_options enable row level security;
alter table public.lease_units enable row level security;
alter table public.lease_unit_included_options enable row level security;
alter table public.lease_unit_responsibility_options enable row level security;
alter table public.lease_global_defaults enable row level security;
alter table public.lease_backups enable row level security;
alter table public.lease_import_history enable row level security;

create policy lease_dataset_state_admin_select on public.lease_dataset_state for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_entities_admin_select on public.lease_entities for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_buildings_admin_select on public.lease_buildings for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_options_admin_select on public.lease_standard_options for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_units_admin_select on public.lease_units for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_unit_included_admin_select on public.lease_unit_included_options for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_unit_responsibility_admin_select on public.lease_unit_responsibility_options for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_global_defaults_admin_select on public.lease_global_defaults for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_backups_admin_select on public.lease_backups for select to authenticated using (private.lease_assert_admin() is not null);
create policy lease_import_history_admin_select on public.lease_import_history for select to authenticated using (private.lease_assert_admin() is not null);

revoke all on public.lease_dataset_state, public.lease_entities, public.lease_buildings,
  public.lease_standard_options, public.lease_units, public.lease_unit_included_options,
  public.lease_unit_responsibility_options, public.lease_global_defaults,
  public.lease_backups, public.lease_import_history from anon, authenticated;
grant select on public.lease_dataset_state, public.lease_entities, public.lease_buildings,
  public.lease_standard_options, public.lease_units, public.lease_unit_included_options,
  public.lease_unit_responsibility_options, public.lease_global_defaults,
  public.lease_backups, public.lease_import_history to authenticated;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function private.lease_assert_admin() from public, anon;
revoke execute on function private.lease_preview_import(jsonb) from public, anon;
revoke execute on function private.lease_commit_import(jsonb,bigint,text,jsonb,text) from public, anon;
revoke execute on function private.lease_restore_backup(uuid,bigint) from public, anon;
revoke execute on function private.lease_export_portfolio() from public, anon;
grant execute on function private.lease_assert_admin() to authenticated;
grant execute on function private.lease_preview_import(jsonb) to authenticated;
grant execute on function private.lease_commit_import(jsonb,bigint,text,jsonb,text) to authenticated;
grant execute on function private.lease_restore_backup(uuid,bigint) to authenticated;
grant execute on function private.lease_export_portfolio() to authenticated;
grant execute on function private.lease_save_record(text,text,jsonb,bigint,bigint) to authenticated;
grant execute on function private.lease_manual_backup(text) to authenticated;

revoke execute on function public.lease_preview_portfolio_import(jsonb) from public, anon;
revoke execute on function public.lease_commit_portfolio_import(jsonb,bigint,text,jsonb,text) from public, anon;
revoke execute on function public.lease_restore_portfolio_backup(uuid,bigint) from public, anon;
revoke execute on function public.lease_export_portfolio_data() from public, anon;
revoke execute on function public.lease_get_dataset_revision() from public, anon;
revoke execute on function public.lease_admin_save_record(text,text,jsonb,bigint,bigint) from public, anon;
revoke execute on function public.lease_create_portfolio_backup(text) from public, anon;
grant execute on function public.lease_preview_portfolio_import(jsonb) to authenticated;
grant execute on function public.lease_commit_portfolio_import(jsonb,bigint,text,jsonb,text) to authenticated;
grant execute on function public.lease_restore_portfolio_backup(uuid,bigint) to authenticated;
grant execute on function public.lease_export_portfolio_data() to authenticated;
grant execute on function public.lease_get_dataset_revision() to authenticated;
grant execute on function public.lease_admin_save_record(text,text,jsonb,bigint,bigint) to authenticated;
grant execute on function public.lease_create_portfolio_backup(text) to authenticated;

commit;
