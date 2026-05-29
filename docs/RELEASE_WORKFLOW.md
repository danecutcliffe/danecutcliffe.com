# Release Workflow

This workspace is the single source of truth for future Time Clock development and deploys.

## What Gets Versioned

- `app/` source code
- `app/public/` assets that must ship with the app
- `supabase/` schema, migrations, and Edge Functions
- `time/` generated deploy output
- root static site files when they change

## Standard Flow

1. Make code or content changes in `app/`, `supabase/`, or the site root.
2. Run `./scripts/build-time-clock.sh` from the workspace root.
3. Review `git status` to confirm both source edits and the generated `time/` output are present.
4. Commit the full release state in one commit.
5. Add a deploy tag after the commit is ready to publish.

## Commit Guidance

- Use normal commits for work in progress.
- Use a clearly named release commit before deployment, for example:
  - `release: publish time clock update`
  - `release: scope sync hardening`

## Tag Guidance

Tag every deployable release so the published state is easy to recover later.

Suggested formats:

- `deploy-2026-05-29`
- `deploy-2026-05-29-01`
- `v1.0.0`

Pick one format and stay consistent.

## Rollback Model

- If a release needs to be undone, deploy the previous tagged commit.
- If older historical context is needed, consult the inactive legacy repos preserved in the project `Archive/` directory.

## Rules To Keep

- Do not edit `time/` by hand during normal work.
- Do not deploy from inactive archive folders.
- Do not split source and deploy history across separate active repos again.
