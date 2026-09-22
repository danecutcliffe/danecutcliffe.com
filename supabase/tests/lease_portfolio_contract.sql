-- Run after local migrations. Uses a transaction and leaves no test data.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'lease-admin@example.invalid', now(), now());
insert into public.profiles (id, role, is_active)
values ('11111111-1111-4111-8111-111111111111', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $test$
declare
  payload jsonb := $json$
  {
    "schemaVersion": 1,
    "generatedFrom": {"cutoffDate":"2026-01-01","generatedAt":"2026-01-01T12:00:00Z"},
    "entities": [{
      "id":"entity-example-holdings","legalName":"Example Holdings Inc.",
      "addressForService":"","community":"","province":"PE","postalCode":"","phone":"",
      "rentPaymentRecipient":"","rentPaymentInstructions":"","rentPaymentAddress":""
    }],
    "buildings": [{
      "id":"building-100-example-street","displayName":"100 Example Street",
      "streetAddress":"100 Example Street","community":"Exampletown","province":"PE","postalCode":""
    }],
    "standardOptions": [],
    "units": [{
      "id":"unit-1-100-example-street","buildingId":"building-100-example-street",
      "entityId":"entity-example-holdings","displayName":"1-100 Example Street","unitNumber":"1",
      "premisesStreetAddress":"100 Example Street","premisesCommunity":"Exampletown",
      "premisesPostalCode":"","premisesType":"","defaultRentalRate":1000,
      "rentPeriod":"Month","rentDueDay":"1st","includedOptionIds":[],
      "tenantResponsibilityOptionIds":[]
    }],
    "globalDefaults":{"damageDepositMode":"one_month_rent","rentPeriod":"Month","rentDueDay":"1st"}
  }
  $json$::jsonb;
  preview jsonb;
  result jsonb;
  first_backup uuid;
begin
  preview := public.lease_preview_portfolio_import(payload);
  assert jsonb_array_length(preview->'validationErrors') = 0, 'valid payload should preview';
  assert preview#>>'{counts,units,added}' = '1', 'unit add count';

  result := public.lease_commit_portfolio_import(
    payload, 0, preview->>'payloadSha256', '{}'::jsonb, 'sanitized-test'
  );
  first_backup := (result->>'backupId')::uuid;
  assert result->>'newDatasetRevision' = '1', 'first import revision';
  assert (select inclusions_state from public.lease_units where id='unit-1-100-example-street') = 'unknown', 'v1 empty inclusions remain unknown';
  assert (select responsibilities_state from public.lease_units where id='unit-1-100-example-street') = 'unknown', 'v1 empty responsibilities remain unknown';
  assert (select count(*) from public.lease_standard_options where system_key is not null) = 14, 'structural options seeded';
  assert (
    select count(*) from public.lease_standard_options
    where (id, system_key) in (
      ('option-included-washer-dryer-no-charge', 'washer_dryer_no_charge'),
      ('option-included-janitorial-common', 'janitorial_common'),
      ('option-included-snow-removal', 'snow_removal_parking_walkways')
    )
  ) = 3, 'alias-sensitive structural option keys remain stable';

  begin
    perform public.lease_commit_portfolio_import(payload, 0, preview->>'payloadSha256');
    assert false, 'stale import should fail';
  exception when serialization_failure then
    assert (select count(*) from public.lease_backups) = 1, 'stale import creates no backup';
    assert (select revision from public.lease_dataset_state where singleton) = 1, 'stale import makes no data change';
  end;

  result := public.lease_admin_save_record(
    'standardOptions', 'option-example-custom',
    '{"category":"included_other","label":"Example inclusion","pdfText":"Example inclusion"}'::jsonb,
    0, 1
  );
  assert result->>'newDatasetRevision' = '2', 'option creation revision';

  insert into public.lease_unit_included_options (unit_id, option_id)
  values ('unit-1-100-example-street', 'option-example-custom');
  begin
    perform public.lease_admin_delete_record('standardOptions', 'option-example-custom', 1, 2);
    assert false, 'referenced option deletion should fail';
  exception when foreign_key_violation then
    assert exists (select 1 from public.lease_standard_options where id = 'option-example-custom'), 'blocked delete retains option';
  end;
  delete from public.lease_unit_included_options where option_id = 'option-example-custom';

  begin
    perform public.lease_admin_delete_record('standardOptions', 'option-included-heat', 1, 2);
    assert false, 'built-in option deletion should fail';
  exception when foreign_key_violation then
    assert exists (select 1 from public.lease_standard_options where id = 'option-included-heat'), 'blocked delete retains built-in option';
  end;

  result := public.lease_admin_save_record(
    'entities', 'entity-example-holdings', '{"addressForService":"100 Verified Street"}'::jsonb,
    1, 2
  );
  assert result->>'newDatasetRevision' = '3', 'manual entity edit revision';

  preview := public.lease_preview_portfolio_import(payload);
  assert jsonb_array_length(preview->'conflicts') = 1, 'manual address conflict should preview';
  result := public.lease_commit_portfolio_import(payload, 3, preview->>'payloadSha256');
  assert (select address_for_service from public.lease_entities where id='entity-example-holdings') = '100 Verified Street', 'default import resolution keeps manual value';
  assert result->>'newDatasetRevision' = '4', 're-import revision';

  result := public.lease_restore_portfolio_backup(first_backup, 4);
  assert result->>'newDatasetRevision' = '5', 'restore revision';
  assert not exists (select 1 from public.lease_units), 'restore returns exact pre-import dataset';
  assert (select count(*) from public.lease_standard_options where system_key is not null) = 14, 'restore retains structural options from backup';
end
$test$;

reset role;
insert into auth.users (id, email, created_at, updated_at)
values ('22222222-2222-4222-8222-222222222222', 'lease-employee@example.invalid', now(), now());
insert into public.profiles (id, role, is_active)
values ('22222222-2222-4222-8222-222222222222', 'employee', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

do $auth_test$
begin
  perform public.lease_get_dataset_revision();
  assert false, 'non-admin RPC call should fail';
exception when insufficient_privilege then
  null;
end
$auth_test$;

rollback;
