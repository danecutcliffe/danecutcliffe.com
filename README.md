# danecutcliffe.com Application Workspace

This is the single active workspace for the private applications and static site hosted at danecutcliffe.com.

## Structure

- `app/` contains the editable React and Vite source for the Time Clock app.
- `time/` contains the generated deploy artifact that is served at `/time/`.
- `lease-app/` contains the editable React, TypeScript, PDF, and data-client source for the Lease Generator.
- `lease/` contains the generated deploy artifact served at `/lease/`.
- `supabase/` contains the canonical backend schema, migrations, and Edge Functions.
- `scripts/` contains repeatable build and release helpers.
- The workspace root contains the static site files that live alongside the app.

## Working Rules

- Edit app behavior in `app/src/`.
- Edit deploy-only public assets in `app/public/`.
- Edit backend changes in `supabase/`.
- Do not hand-edit files inside `time/` unless you are recovering from an emergency. Normal changes should come from `app/` and be rebuilt.
- Do not hand-edit files inside `lease/`; rebuild it from `lease-app/`.
- Commit application source and matching generated output together so each deploy can be traced to one commit.

## Build

From the workspace root:

```bash
./scripts/build-time-clock.sh
```

That command builds `app/` and writes the deployable output into `time/`.

For the Lease Generator:

```bash
./scripts/build-lease.sh
```

That command refuses non-production Supabase configuration, runs the unit and type checks, builds `lease-app/`, and verifies the deployable `lease/` artifact.

## Release Trail

Use the workflow in `docs/RELEASE_WORKFLOW.md` so each deploy has:

- a source commit
- the matching generated `time/` artifact
- a release tag

Lease-specific data, PDF-template, staging, and recovery instructions are in `docs/LEASE_APP_RELEASE_WORKFLOW_v1.0.0.md`.

## Legacy Material

Older split repos are preserved outside this workspace under the project `Archive/` directory as inactive references. They are not part of the active edit or deploy flow.
