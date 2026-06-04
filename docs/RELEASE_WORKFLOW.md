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
2. Run `npm run verify` from `app/` to catch source, TypeScript, and regression issues before generating deploy output. This must pass before any tag or production deploy.
3. Run `./scripts/build-time-clock.sh` from the workspace root. The build verifies that `time/index.html` references existing hashed assets and that `time/sw.js` has a stamped cache id.
4. Review `git status` to confirm both source edits and the generated `time/` output are present.
5. Commit the full release state in one commit.
6. Add a deploy tag after the commit is ready to publish.

## Generated Asset Hygiene

- `app/` is the source of truth; `time/` and `staging-site/time/` are generated deploy outputs.
- Do not run formatters, whitespace normalizers, or hand edits over `time/assets/` after Vite builds. The hashed filenames should describe the Vite-authored bundle output, not a post-processed copy.
- If checking whitespace before a release, check source files and docs, or exclude generated deploy assets such as `time/assets/*` and `staging-site/time/assets/*`.
- Use `scripts/verify-time-build.mjs` as the deploy-artifact guard: it verifies the expected generated directory, hashed asset references, service worker stamp, environment target, and absence of runtime CSS override files.

## Staging Flow

Use staging when validating new features against a production-shaped data snapshot without publishing to the production site.

1. Confirm `app/.env.staging.local` points at the staging Supabase project.
2. Optionally run `npm run verify` from `app/` for an early check before generating staging artifacts.
3. Run `./scripts/build-time-clock-staging.sh`; the staging build runs `npm run verify` and generated-asset verification automatically.
4. Confirm `staging-site/time/` was regenerated and the Scope integration scripts are no-op files.
5. Commit and push from `staging-site/`, the separate GitHub Pages repo for `staging.danecutcliffe.com`.
6. Do not push the canonical production repo unless this is also an approved production release.
7. Verify `http://staging.danecutcliffe.com/time/` or `https://staging.danecutcliffe.com/time/` after GitHub Pages and certificate provisioning are ready.

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
- Do not use the Supabase CLI without first verifying the intended project ref.
- After staging Supabase work, run `supabase unlink --yes` before ending the session unless the link is intentionally being retained.
- Do not enable Notion secrets, Notion webhooks, or Scope Edge Functions in staging without explicit approval.
