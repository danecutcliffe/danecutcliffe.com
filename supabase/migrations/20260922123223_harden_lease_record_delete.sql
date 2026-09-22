create or replace function private.lease_delete_record(
  collection_name text,
  record_id text,
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
  ref_count integer;
  option_system_key text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lease-portfolio-dataset', 0));
  select revision into current_revision from public.lease_dataset_state where singleton for update;
  if current_revision <> expected_dataset_revision then
    raise exception using errcode = '40001', message = 'STALE_DATASET: portfolio data changed; reload Manage and try again.';
  end if;

  case collection_name
    when 'units' then
      select count(*) into ref_count from public.lease_units
      where id = record_id and record_revision = expected_record_revision;
      if ref_count = 0 then
        raise exception using errcode = '40001', message = 'STALE_RECORD: unit changed or no longer exists.';
      end if;
      delete from public.lease_unit_included_options where unit_id = record_id;
      delete from public.lease_unit_responsibility_options where unit_id = record_id;
      delete from public.lease_units where id = record_id and record_revision = expected_record_revision;

    when 'buildings' then
      select count(*) into ref_count from public.lease_units where building_id = record_id;
      if ref_count > 0 then
        raise exception using errcode = '23503', message = 'DELETE_BLOCKED: this building still has units. Reassign or delete them first.';
      end if;
      select count(*) into ref_count from public.lease_buildings
      where id = record_id and record_revision = expected_record_revision;
      if ref_count = 0 then
        raise exception using errcode = '40001', message = 'STALE_RECORD: building changed or no longer exists.';
      end if;
      delete from public.lease_buildings where id = record_id and record_revision = expected_record_revision;

    when 'entities' then
      select count(*) into ref_count from public.lease_buildings where entity_id = record_id;
      if ref_count > 0 then
        raise exception using errcode = '23503', message = 'DELETE_BLOCKED: this entity still owns buildings. Reassign or delete them first.';
      end if;
      select count(*) into ref_count from public.lease_entities
      where id = record_id and record_revision = expected_record_revision;
      if ref_count = 0 then
        raise exception using errcode = '40001', message = 'STALE_RECORD: entity changed or no longer exists.';
      end if;
      delete from public.lease_entities where id = record_id and record_revision = expected_record_revision;

    when 'standardOptions' then
      select system_key into option_system_key from public.lease_standard_options
      where id = record_id and record_revision = expected_record_revision;
      if not found then
        raise exception using errcode = '40001', message = 'STALE_RECORD: option changed or no longer exists.';
      end if;
      if option_system_key is not null then
        raise exception using errcode = '23503', message = 'DELETE_BLOCKED: built-in Form 1 options cannot be deleted. Deactivate the option instead.';
      end if;
      select (
        (select count(*) from public.lease_unit_included_options where option_id = record_id)
        + (select count(*) from public.lease_unit_responsibility_options where option_id = record_id)
      ) into ref_count;
      if ref_count > 0 then
        raise exception using errcode = '23503', message = 'DELETE_BLOCKED: this option is used by Unit defaults. Remove it from those Units first.';
      end if;
      delete from public.lease_standard_options where id = record_id and record_revision = expected_record_revision;

    else
      raise exception using errcode = '22023', message = 'DELETE_INVALID: unsupported collection.';
  end case;

  next_revision := current_revision + 1;
  update public.lease_dataset_state
  set revision = next_revision, updated_at = now(), updated_by = actor
  where singleton;
  return jsonb_build_object('deleted', true, 'newDatasetRevision', next_revision);
end;
$function$;

-- These foreign-key columns are used by the dependency checks above and by
-- portfolio joins. PostgreSQL does not automatically index referencing keys.
create index if not exists lease_buildings_entity_idx
  on public.lease_buildings (entity_id);
create index if not exists lease_import_history_backup_idx
  on public.lease_import_history (backup_id);
create index if not exists lease_unit_included_options_option_idx
  on public.lease_unit_included_options (option_id);
create index if not exists lease_unit_responsibility_options_option_idx
  on public.lease_unit_responsibility_options (option_id);

-- CREATE OR REPLACE preserves existing ACLs, while earlier replacement
-- migrations created these two functions after the schema-wide revocation.
-- Keep the private implementation callable by signed-in wrappers only.
revoke execute on function private.lease_delete_record(text,text,bigint,bigint)
  from public, anon;
grant execute on function private.lease_delete_record(text,text,bigint,bigint)
  to authenticated;
revoke execute on function private.lease_load_dataset()
  from public, anon;
grant execute on function private.lease_load_dataset()
  to authenticated;
