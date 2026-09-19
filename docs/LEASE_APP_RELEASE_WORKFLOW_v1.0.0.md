# Lease Generator Release Workflow

The Lease Generator is a private, static React application at `/lease/`. Supabase stores canonical portfolio defaults and authentication; completed tenant names stay in the browser and are written directly into a fresh local copy of the editable PDF.

## Versioned components

- `lease-app/`: React/TypeScript source, PDF engine, tests, sanitized fixtures, and canonical normalized blank template.
- `lease/`: generated production artifact committed for GitHub Pages.
- `supabase/migrations/20260919170510_lease_portfolio_data_layer.sql`: tables, RLS, built-in Form 1 options, import/backup/restore functions, and admin-only data boundary.
- `supabase/tests/lease_portfolio_contract.sql`: database contract and authorization checks.
- `scripts/prepare-lease-template.py`: deterministic legacy-template normalizer.
- `scripts/validate-lease-pdf.py`: independent blank/generated PDF verifier.

Never commit portfolio imports, completed leases, tenant PDFs, database passwords, service-role keys, or `.env.local` files.

## Template replacement

1. Preserve the existing source PDF. Put the proposed replacement outside the public repository.
2. Inspect its pages, fields/widgets, names, rectangles, appearances, actions, and stale values.
3. If the source hash or field signature differs, intentionally update the expected hash and centralized semantic map in `scripts/prepare-lease-template.py`. Never bypass those checks.
4. Run:

   ```bash
   python3 scripts/prepare-lease-template.py \
     --source '/absolute/path/to/Standard_Lease_Form.pdf' \
     --output lease-app/public/templates/generated/lease-template.pdf \
     --manifest lease-app/public/templates/generated/template-manifest.json
   python3 scripts/validate-lease-pdf.py \
     lease-app/public/templates/generated/lease-template.pdf \
     lease-app/public/templates/generated/template-manifest.json
   npm --prefix lease-app run pdf:spike
   python3 scripts/validate-lease-pdf.py \
     tmp/pdfs/spike/generated-lease.pdf \
     lease-app/public/templates/generated/template-manifest.json \
     --expect tmp/pdfs/spike/expected-values.json
   ```

5. Render and visually inspect all affected pages. Verify the field tree and widget appearances remain editable. Do not ship a rasterized, flattened, overlaid, auto-fit, or font-substituted replacement.

## Portfolio import

Portfolio records are data, not source code. In Manage → Import & Backup:

1. Choose a compatible JSON package.
2. Review additions, updates, unchanged records, invalid references, and field conflicts.
3. Resolve genuine conflicts explicitly. The default is to keep current/manual values.
4. Commit only a clean preview. The RPC verifies the preview checksum and revision, creates an immutable pre-import backup, acquires the dataset advisory lock, and commits atomically.
5. Confirm the resulting dataset revision and record counts. Missing records are never silently deleted.

Schema v1 empty inclusion/responsibility arrays adapt to `unknown`. They do not become known-empty. The current real v1.0.2 package should produce 4 entities, 8 buildings, and 10 units while preserving all 14 structural Form 1 options already seeded by the migration.

## Backup and restore

- Manual backup: Manage → Import & Backup → Create backup.
- Every import creates a pre-import backup automatically.
- Every restore first creates a pre-restore backup, then replaces the complete dataset atomically.
- Restore rejects a stale dataset revision. Reload before retrying; never automatically retry a stale mutation.

## Verification

From `lease-app/`:

```bash
npm run verify
npm run test:smoke
npm run pdf:spike
```

The smoke suite exercises Building → Unit behavior, single-unit auto-selection, editable term dates, live one-month deposit behavior, unknown-term blocking, mobile Manage layout, and a real editable PDF download.

Before a remote migration, deliberately verify the Supabase project ref:

- Staging: `qumnzxzoypgpejtwbigw`
- Production: `akofsmmsxtfqduebetga`

Test the migration and real v1.0.2 import against staging first. Confirm RLS/admin denial and the full 10-unit dataset before production.

## Build and release

Production:

```bash
./scripts/build-lease.sh
```

Staging:

```bash
./scripts/build-lease-staging.sh
```

The scripts refuse the wrong Supabase host. Review `git status`, the source diff, and the generated artifact. Complete the required product/data, PDF, and release-safety reviews with no unresolved P0/P1 findings.

Commit source, migration, tests, documentation, and `lease/` together. Use the shared deployment tag format `deploy-YYYY-MM-DD-NN`, push the release commit and tag, wait for GitHub Pages, then verify:

- `/lease/` returns the authenticated app and is absent from public navigation.
- noindex/nofollow metadata is present.
- the production Supabase project is used.
- all ten imported units are selectable.
- a representative generated PDF remains seven pages and 69-field editable.
- `/time/` and the existing static site still work.

Rollback the static application by redeploying the previous tag. Restore lease portfolio data from the immutable backup created before the relevant import/restore; do not manually reverse table rows.
