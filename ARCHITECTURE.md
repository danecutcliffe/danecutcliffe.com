# danecutcliffe.com Site and Time App Architecture

This repository is treated as a GitHub-hosted static site.

## Hosting Model

- GitHub is the source of truth for site files and the Time Clock frontend.
- Static pages, assets, and the Time Clock app are served from this repository.
- The custom domain is defined by `CNAME`.
- The Time Clock app lives under `/time/`.

## Environment Model

- Production frontend is `https://danecutcliffe.com/time/` and is built into `time/`.
- Staging frontend is `https://staging.danecutcliffe.com/time/` and is built into `staging-site/time/`.
- Staging is published from the separate `danecutcliffe.com-staging` GitHub Pages repo so staging deploys cannot overwrite the production Pages repo.
- Production Supabase project ref is `akofsmmsxtfqduebetga`.
- Staging Supabase project ref is `qumnzxzoypgpejtwbigw`.
- Production builds use `app/.env.local` through `./scripts/build-time-clock.sh`.
- Staging builds use `app/.env.staging.local` through `./scripts/build-time-clock-staging.sh`.
- Both build scripts fail closed when the wrong environment variables are detected.

## Backend Model

- Supabase owns authentication, database storage, row-level security, and private backend actions.
- Browser code may use the Supabase publishable key only.
- Private secrets, including the Notion integration token and Supabase service role key, must live in Supabase function secrets.
- The Supabase CLI project link is not trusted as durable configuration. Remote Supabase work must verify the intended project ref before running and unlink after staging work unless intentionally retained.

## Scope Sync Model

- Admin connects a property to one Notion scope database from the Time Clock admin Scopes panel.
- Notion scope databases must include a property named exactly `Job Code`.
- The Supabase Edge Function `sync-scope-database` reads Notion server-side, matches Notion rows to Time app job codes, and updates `scope_notion_databases`, `scope_projects`, and missing `scope_items`.
- Employee scope UI stays separate until the workflow is production-ready.
- Staging keeps the Scope schema and copied Scope data for realistic testing, but Notion secrets, Notion webhooks, and Scope Edge Functions are not enabled in staging unless Dane explicitly approves them.
- Production Scope browser integration scripts point at production Supabase. The staging build script replaces them with no-op files before publishing.

## Deprecated Assumption

Static-host redirects, provider-specific headers, and provider-specific functions are not part of the intended runtime architecture for this project. Private backend work belongs in Supabase Edge Functions.
