# danecutcliffe.com Site and Time App Architecture

This repository is treated as a GitHub-hosted static site.

## Hosting Model

- GitHub is the source of truth for site files and the Time Clock frontend.
- Static pages, assets, and the Time Clock app are served from this repository.
- The custom domain is defined by `CNAME`.
- The Time Clock app lives under `/time/`.

## Backend Model

- Supabase owns authentication, database storage, row-level security, and private backend actions.
- Browser code may use the Supabase publishable key only.
- Private secrets, including the Notion integration token and Supabase service role key, must live in Supabase function secrets.

## Scope Sync Model

- Admin connects a property to one Notion scope database from the Time Clock admin Scopes panel.
- Notion scope databases must include a property named exactly `Job Code`.
- The Supabase Edge Function `sync-scope-database` reads Notion server-side, matches Notion rows to Time app job codes, and updates `scope_notion_databases`, `scope_projects`, and missing `scope_items`.
- Employee scope UI stays separate until the workflow is production-ready.

## Deprecated Assumption

Static-host redirects, provider-specific headers, and provider-specific functions are not part of the intended runtime architecture for this project. Private backend work belongs in Supabase Edge Functions.
