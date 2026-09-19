# Lease portfolio data contract

The browser uses `LeaseRepository`; it does not write lease tables directly.
All mutations are authenticated, active-admin-only RPC calls. PostgreSQL remains
the authority even when client validation succeeds.

## Import sequence

1. Parse JSON with `parsePortfolioPackage`.
2. Call `previewImport(payload)` and display validation errors, counts and every
   field-level conflict.
3. Keep the preview's `datasetRevision` and `payloadSha256` unchanged.
4. Call `commitImport(payload, preview, resolutions, packageVersion)`.
5. If `LeaseDataError.code === "STALE_DATA"`, discard the preview and run it
   again. Never retry the old commit automatically.

Conflict resolution defaults to `keep_current`. To accept an incoming field:

```ts
const resolutions = {
  entities: {
    "entity-example-holdings": {
      addressForService: "accept_incoming",
    },
  },
} as const;
```

## State rule

`inclusionsState` and `responsibilitiesState` are independent. Schema v1 did
not contain these fields, so a populated option array adapts to
`known_populated`, while an empty array adapts to `unknown`. It must never be
silently interpreted as `known_empty`. Schema v2 exports the state explicitly.

## RPCs

- `lease_preview_portfolio_import(payload)`
- `lease_commit_portfolio_import(payload, expected_revision, expected_payload_sha256, resolutions, package_version)`
- `lease_admin_save_record(collection_name, record_id, patch, expected_record_revision, expected_dataset_revision)`
- `lease_create_portfolio_backup(reason)`
- `lease_restore_portfolio_backup(backup_id, expected_revision)`
- `lease_export_portfolio_data()`
- `lease_get_dataset_revision()`

Imports and restores take the same transaction-scoped advisory lock. A commit
creates an immutable pre-operation backup and either completes entirely or
rolls back entirely. Records absent from an import are never deleted.

