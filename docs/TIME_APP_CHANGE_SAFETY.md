# Time App Change Safety Contract

Use this checklist before implementing or deploying future Time App changes. The app is small, but payroll, reports, mobile layout, Supabase, Scope, and generated deploy files are coupled enough that every feature should be treated as a platform change.

## Right-Sized Boundaries

- Do not build a full accounting ledger platform inside the Time App.
- Do not add payroll snapshots, source-entry hashing, or calculation manifests unless the approval workflow proves they are needed.
- Do not generalize beyond this app's actual payroll, reporting, Scope, and time-entry needs.
- Do not preserve legacy helper functions for payroll-facing code just because they exist. Keep payroll math on `computeEntryHours()`, `computeTimeSummary()`, and the report models.

## Change Safety Contract

Every future change should name its change type before implementation:

- Frontend UI
- Payroll/time math
- Reports/export
- Supabase/service logic
- Scope integration
- PWA/service worker
- Deploy-only rebuild

Every future change should list impacted areas before implementation:

- Employee clock flow
- Admin timesheets
- Reports and exports
- Payroll settings
- Mobile shell and navigation
- Authentication and passkeys
- Settings/admin profile management
- Scope Builder or Scope viewer
- Generated `time/` output
- Supabase migrations, RPCs, RLS, or Edge Functions

Every future change should state whether it touches source files, generated deploy files, database migrations, public assets, release scripts, or live environment settings. If it crosses one of those boundaries, document the regression risk before deploy.

## Mobile Layout Rules

- Keep one mobile scroll region: `.app-shell-content` owns vertical scrolling.
- Keep the bottom mobile navigation inside the app shell, not as a portal, floating overlay, or fixed body-level element.
- Require mobile grids to define a base `grid-cols-1` or another explicit safe mobile column layout.
- Require flexible card and panel content to use `min-w-0` plus safe text wrapping or truncation for long names, notes, emails, job codes, and report labels.
- Keep tables and wide reports inside contained horizontal scroll wrappers so they do not widen the page shell.
- Clamp progress bars, charts, SVGs, and graphics so they cannot spill outside their cards.
- Ban runtime CSS overrides for shell, nav, and mobile layout behavior.

## Verification Gates

- Run `npm run verify` before every staging or production deploy.
- Run `npm run test:smoke` for frontend UI, mobile layout, navigation, reports/export UI, shell/nav, modal, dashboard, settings, and deploy-readiness changes.
- On a fresh machine, run `npx playwright install chromium` once before the first smoke test.
- Use `./scripts/build-time-clock-staging.sh` for staging deploy artifacts.
- Use `./scripts/build-time-clock.sh` for production deploy artifacts.
- Verify generated assets with `scripts/verify-time-build.mjs`; production must target `time/`, and staging must target `staging-site/time`.
- Include stress data in either committed tests or manual smoke data when the feature can be affected by long names, long job codes, long notes, many report columns, open entries, empty states, dropdowns, or modals.

## Acceptance Criteria

A future update is safe to deploy only when:

- The change can be explained as part of the whole app, not only one isolated component.
- Required regression, typecheck, domain test, smoke/layout, build, and deploy-artifact checks pass for the affected areas.
- Mobile views have no document-level horizontal scroll, no nav overlap, and no overflowing graphics or cards.
- Payroll-facing numbers come from the canonical calculation path.
- Reports and supported exports reconcile against the same calculation output.
- Generated deploy artifacts match the current source build.
- Environment targeting is explicit and correct.
- The rollback path is known before production deploy.

## Standard Review Agents

Run a recurring review panel before staging or production promotion for substantive features, bug fixes, Supabase changes, report/payroll changes, mobile layout changes, and deployment workflow changes. Use actual available subagents or multi-agent tooling when callable in the session. If agent tooling is unavailable, perform separate named review passes and state clearly that they were manual review passes rather than independent agent runs.

- Implementation Reviewer: checks code structure, typing, data flow, and maintainability.
- Payroll/Data Integrity Reviewer: checks time math, rounding, report reconciliation, Supabase constraints, and auditability.
- Mobile/Shell Reviewer: checks app-shell scrolling, bottom navigation, modals, cards, tables, and responsive stress cases.
- Deployment Reviewer: checks generated assets, service worker stamp, environment targeting, staging/prod separation, and rollback.
- Skeptical Claude Challenger: reviews the proposal as if it came from a competing AI system and looks specifically for overconfidence, hidden coupling, missing tests, and "sounds right but breaks in production" failure modes.

Report material findings before deploy. Do not promote if a P0/P1 reviewer concern remains unresolved unless Dane explicitly accepts the risk.

## User Explanation Rule

After each implemented change, give the user a plain-language explanation of what changed and why. Use an ELI5 layer first: explain the problem, the fix, and how we verified it without assuming coding background. Add technical details only after that when useful.
