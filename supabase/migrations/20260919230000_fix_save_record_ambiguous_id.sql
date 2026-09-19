-- Fix: "column reference 'id' is ambiguous" in lease_save_record unit validation
-- The unnest alias 'id' collides with lease_standard_options.id in the join clause.

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
  building_entity text;
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
      if expected_record_revision = 0 then
        if record_id !~ '^entity-[a-z0-9][a-z0-9-]*$'
           or btrim(coalesce(patch->>'legalName','')) = '' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: a new entity requires a valid stable ID and legal name.';
        end if;
        insert into public.lease_entities (
          id, legal_name, address_for_service, community, province, postal_code,
          phone, rent_payment_recipient, rent_payment_instructions, rent_payment_address,
          is_active, manual_fields, updated_by
        ) values (
          record_id,
          patch->>'legalName',
          coalesce(patch->>'addressForService', ''),
          coalesce(patch->>'community', ''),
          coalesce(patch->>'province', 'PE'),
          coalesce(patch->>'postalCode', ''),
          coalesce(patch->>'phone', ''),
          coalesce(patch->>'rentPaymentRecipient', ''),
          coalesce(patch->>'rentPaymentInstructions', ''),
          coalesce(patch->>'rentPaymentAddress', ''),
          coalesce((patch->>'active')::boolean, true),
          patch_fields,
          actor
        )
        on conflict (id) do nothing
        returning to_jsonb(lease_entities) into saved;
        if saved is null then
          raise exception using errcode = '40001', message = 'STALE_RECORD: entity ID already exists.';
        end if;
      else
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
      end if;

    when 'buildings' then
      if patch - array['entityId','displayName','streetAddress','community','province','postalCode','active'] <> '{}'::jsonb then
        raise exception using errcode = '22023', message = 'PATCH_INVALID: building patch contains unsupported fields.';
      end if;
      if expected_record_revision = 0 then
        if record_id !~ '^building-[a-z0-9][a-z0-9-]*$'
           or btrim(coalesce(patch->>'displayName','')) = ''
           or btrim(coalesce(patch->>'streetAddress','')) = '' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: a new building requires a valid stable ID, display name and street address.';
        end if;
        insert into public.lease_buildings (
          id, entity_id, display_name, street_address, community, province, postal_code,
          is_active, manual_fields, updated_by
        ) values (
          record_id,
          nullif(btrim(coalesce(patch->>'entityId','')), ''),
          patch->>'displayName',
          patch->>'streetAddress',
          coalesce(patch->>'community', ''),
          coalesce(patch->>'province', 'PE'),
          coalesce(patch->>'postalCode', ''),
          coalesce((patch->>'active')::boolean, true),
          patch_fields,
          actor
        )
        on conflict (id) do nothing
        returning to_jsonb(lease_buildings) into saved;
        if saved is null then
          raise exception using errcode = '40001', message = 'STALE_RECORD: building ID already exists.';
        end if;
      else
        update public.lease_buildings set
          entity_id = case when patch ? 'entityId' then nullif(btrim(coalesce(patch->>'entityId','')), '') else entity_id end,
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
      end if;

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

      -- Auto-derive entityId from building
      if patch ? 'buildingId' then
        select b.entity_id into building_entity from public.lease_buildings b where b.id = patch->>'buildingId';
      else
        select b.entity_id into building_entity from public.lease_buildings b
        join public.lease_units u on u.building_id = b.id where u.id = record_id;
      end if;

      if expected_record_revision = 0 then
        if record_id !~ '^unit-[a-z0-9][a-z0-9-]*$'
           or btrim(coalesce(patch->>'buildingId','')) = ''
           or btrim(coalesce(patch->>'displayName','')) = ''
           or btrim(coalesce(patch->>'premisesStreetAddress','')) = '' then
          raise exception using errcode = '22023', message = 'PATCH_INVALID: a new unit requires a valid stable ID, building, display name and premises street address.';
        end if;

        included_ids := '{}'::text[];
        responsibility_ids := '{}'::text[];
        inclusion_state := coalesce((patch->>'inclusionsState')::public.lease_configuration_state, 'unknown');
        responsibility_state := coalesce((patch->>'responsibilitiesState')::public.lease_configuration_state, 'unknown');

        if patch ? 'includedOptionIds' and jsonb_typeof(patch->'includedOptionIds') = 'array' then
          select coalesce(array_agg(value order by ordinality), '{}'::text[]) into included_ids
          from jsonb_array_elements_text(patch->'includedOptionIds') with ordinality;
          if cardinality(included_ids) > 0 then inclusion_state := 'known_populated'; end if;
        end if;
        if patch ? 'tenantResponsibilityOptionIds' and jsonb_typeof(patch->'tenantResponsibilityOptionIds') = 'array' then
          select coalesce(array_agg(value order by ordinality), '{}'::text[]) into responsibility_ids
          from jsonb_array_elements_text(patch->'tenantResponsibilityOptionIds') with ordinality;
          if cardinality(responsibility_ids) > 0 then responsibility_state := 'known_populated'; end if;
        end if;

        insert into public.lease_units (
          id, building_id, entity_id, display_name, unit_number,
          premises_street_address, premises_community, premises_postal_code, premises_type,
          default_rental_rate, rent_period, rent_due_day,
          inclusions_state, responsibilities_state,
          is_active, manual_fields, updated_by
        ) values (
          record_id,
          patch->>'buildingId',
          coalesce(building_entity, coalesce(patch->>'entityId', '')),
          patch->>'displayName',
          coalesce(patch->>'unitNumber', ''),
          patch->>'premisesStreetAddress',
          coalesce(patch->>'premisesCommunity', ''),
          coalesce(patch->>'premisesPostalCode', ''),
          coalesce(patch->>'premisesType', ''),
          coalesce((patch->>'defaultRentalRate')::numeric, 0),
          coalesce(patch->>'rentPeriod', 'Month'),
          coalesce(patch->>'rentDueDay', '1st'),
          inclusion_state, responsibility_state,
          coalesce((patch->>'active')::boolean, true),
          patch_fields,
          actor
        )
        on conflict (id) do nothing
        returning to_jsonb(lease_units) into saved;
        if saved is null then
          raise exception using errcode = '40001', message = 'STALE_RECORD: unit ID already exists.';
        end if;

        insert into public.lease_unit_included_options (unit_id, option_id, sort_order)
        select record_id, opt_id, ordinality::integer - 1 from unnest(included_ids) with ordinality as x(opt_id, ordinality);
        insert into public.lease_unit_responsibility_options (unit_id, option_id, sort_order)
        select record_id, opt_id, ordinality::integer - 1 from unnest(responsibility_ids) with ordinality as x(opt_id, ordinality);

      else
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
          select 1 from unnest(included_ids) as opt_id
          left join public.lease_standard_options o on o.id = opt_id
          where o.id is null or o.category not in ('included_standard','included_other')
        ) then raise exception using errcode = '23503', message = 'OPTION_INVALID: included options contain a missing or incompatible option.'; end if;
        if exists (
          select 1 from unnest(responsibility_ids) as opt_id
          left join public.lease_standard_options o on o.id = opt_id
          where o.id is null or o.category <> 'tenant_responsibility'
        ) then raise exception using errcode = '23503', message = 'OPTION_INVALID: responsibilities contain a missing or incompatible option.'; end if;

        update public.lease_units set
          building_id = case when patch ? 'buildingId' then patch->>'buildingId' else building_id end,
          entity_id = coalesce(building_entity, entity_id),
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
        select record_id, opt_id, ordinality::integer - 1 from unnest(included_ids) with ordinality as x(opt_id, ordinality);
        delete from public.lease_unit_responsibility_options where unit_id = record_id;
        insert into public.lease_unit_responsibility_options (unit_id, option_id, sort_order)
        select record_id, opt_id, ordinality::integer - 1 from unnest(responsibility_ids) with ordinality as x(opt_id, ordinality);
      end if;

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
