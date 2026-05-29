# Time Clock App Workspace

This is the single active workspace for the Time Clock app and the static site that hosts it.

## Structure

- `app/` contains the editable React and Vite source for the Time Clock app.
- `time/` contains the generated deploy artifact that is served at `/time/`.
- `supabase/` contains the canonical backend schema, migrations, and Edge Functions.
- `scripts/` contains repeatable build and release helpers.
- The workspace root contains the static site files that live alongside the app.

## Working Rules

- Edit app behavior in `app/src/`.
- Edit deploy-only public assets in `app/public/`.
- Edit backend changes in `supabase/`.
- Do not hand-edit files inside `time/` unless you are recovering from an emergency. Normal changes should come from `app/` and be rebuilt.
- Commit source changes and the generated `time/` output together so each deploy can be traced to one commit.

## Build

From the workspace root:

```bash
./scripts/build-time-clock.sh
```

That command builds `app/` and writes the deployable output into `time/`.

## Release Trail

Use the workflow in `docs/RELEASE_WORKFLOW.md` so each deploy has:

- a source commit
- the matching generated `time/` artifact
- a release tag

## Legacy Material

Older split repos are preserved outside this workspace under the project `Archive/` directory as inactive references. They are not part of the active edit or deploy flow.
