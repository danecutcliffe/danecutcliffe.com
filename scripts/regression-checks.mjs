import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const listFiles = (dir) => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`;
  if (entry.isDirectory()) return listFiles(path);
  return path;
});

const extractMethod = (source, name) => {
  const start = source.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`Regression guard could not find ${name}().`);
  const next = source.indexOf('\n  async ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

const fail = (message) => {
  throw new Error(`[regression-check] ${message}`);
};

const requireIncludes = (source, needle, message) => {
  if (!source.includes(needle)) fail(message);
};

const service = read('app/src/services/supabaseTimeClockService.ts');
const timeUtils = read('app/src/utils/time.ts');
const verifyTimeBuild = read('scripts/verify-time-build.mjs');
const releaseWorkflow = read('docs/RELEASE_WORKFLOW.md');
const changeSafety = read('docs/TIME_APP_CHANGE_SAFETY.md');
const playwrightConfig = read('app/playwright.config.ts');
const mockService = read('app/src/services/mockTimeClockService.ts');

if (timeUtils.includes('getEntryPayableHours')) {
  fail('Retired getEntryPayableHours must not be reintroduced for payroll-facing semantics. Use computeEntryHours/report models instead.');
}

for (const method of ['clockOut', 'endBreak', 'updateEntryNotes']) {
  const block = extractMethod(service, method);
  if (block.includes('edited_by') || block.includes('edited_at')) {
    fail(`${method}() must not write edit metadata. Normal employee punch flow is not a timesheet edit.`);
  }
}

const updateTimeEntryBlock = extractMethod(service, 'updateTimeEntry');
requireIncludes(updateTimeEntryBlock, 'await this.assertAdmin();', 'Only admin correction flow may write time-entry edit metadata.');
requireIncludes(updateTimeEntryBlock, 'edited_by: editedBy', 'Admin correction flow must preserve who edited a time entry.');
requireIncludes(updateTimeEntryBlock, 'edited_at: new Date().toISOString()', 'Admin correction flow must preserve when a time entry was edited.');

const appShell = read('app/src/components/AppShell.tsx');
if (appShell.includes('createPortal') || appShell.includes('react-dom')) {
  fail('Mobile bottom nav must stay inside the app flex shell, not a fixed document.body portal.');
}
if (!appShell.includes('app-shell-content') || !appShell.includes('{mobileNav}')) {
  fail('AppShell must keep the mobile nav as the bottom row after the scrollable app-shell-content region.');
}

const styles = read('app/src/styles/index.css');
const appIndex = read('app/index.html');
if (!styles.includes('#root .app-shell') || !styles.includes('height: 100dvh')) {
  fail('Mobile shell must keep a dynamic-viewport flex container.');
}
if (!styles.includes('#root .app-shell-content') || !styles.includes('-webkit-overflow-scrolling: touch')) {
  fail('Mobile content must remain the only scroll region inside the app shell.');
}
if (!styles.includes('scroll-padding-bottom: calc(var(--mobile-nav-height) + 1rem)')) {
  fail('Mobile content must reserve bottom scroll space for the bottom nav.');
}
if (!styles.includes('.app-mobile-bottom-nav') || styles.includes('position: fixed !important')) {
  fail('Mobile bottom nav must be a normal bottom flex row, not a fixed-position overlay.');
}
if (appIndex.includes('time-ui-overrides.css') || existsSync(resolve(root, 'app/public/time-ui-overrides.css'))) {
  fail('Runtime CSS overrides must not bypass source CSS for mobile shell or nav behavior.');
}
requireIncludes(
  verifyTimeBuild,
  'expectedProductionBuildDir',
  'Deploy verification must keep production builds tied to the canonical generated time/ directory.',
);
requireIncludes(
  verifyTimeBuild,
  'expectedStagingBuildDir',
  'Deploy verification must keep staging builds tied to staging-site/time.',
);
requireIncludes(
  verifyTimeBuild,
  'nonHashedRuntimeCssRefs',
  'Deploy verification must reject non-generated runtime CSS references.',
);
requireIncludes(
  releaseWorkflow,
  'Do not run formatters, whitespace normalizers, or hand edits over `time/assets/` after Vite builds.',
  'Release workflow must preserve the generated-asset whitespace policy.',
);
requireIncludes(
  releaseWorkflow,
  'Commit the full release state in one commit.',
  'Release workflow must keep source and generated time/ deploy artifacts committed together.',
);
requireIncludes(
  releaseWorkflow,
  'Required format: `deploy-YYYY-MM-DD-NN`',
  'Release workflow must require production deploy tags in deploy-YYYY-MM-DD-NN format.',
);
requireIncludes(
  releaseWorkflow,
  'npm run test:smoke',
  'Release workflow must keep the Playwright smoke/layout gate documented for affected UI deploys.',
);
requireIncludes(
  changeSafety,
  'Every future change should name its change type before implementation',
  'Change safety contract must require future updates to identify the change type before implementation.',
);
requireIncludes(
  changeSafety,
  'Keep one mobile scroll region: `.app-shell-content` owns vertical scrolling.',
  'Change safety contract must preserve the protected mobile shell scroll rule.',
);
requireIncludes(
  changeSafety,
  'Skeptical Release Challenger',
  'Change safety contract must preserve the skeptical recurring review-agent role.',
);
requireIncludes(
  changeSafety,
  'For code revisions, use actual available subagents or multi-agent tooling throughout the work',
  'Change safety contract must require actual subagent review throughout code revisions when available.',
);
requireIncludes(
  changeSafety,
  'After each implemented change, give the user a plain-language explanation',
  'Change safety contract must preserve the user ELI5 explanation rule.',
);
requireIncludes(
  playwrightConfig,
  "VITE_TIME_CLOCK_STRESS_DATA: 'true'",
  'Playwright smoke tests must keep stress data enabled.',
);
requireIncludes(
  playwrightConfig,
  "serviceWorkers: 'block'",
  'Playwright smoke tests must block service workers to avoid stale PWA cache flake.',
);
requireIncludes(
  mockService,
  'profile-stress-long',
  'Mock service must keep opt-in long-name stress profile coverage.',
);
requireIncludes(
  mockService,
  'profile-stress-empty',
  'Mock service must keep opt-in empty-state stress profile coverage.',
);

const integrityMigration = read('supabase/migrations/20260604154000_time_entry_integrity_guards.sql');
const manualBreakWorkMigration = read('supabase/migrations/20260604190000_manual_break_start_requires_work_entry.sql');
requireIncludes(
  integrityMigration,
  'create or replace function public.time_entry_touches_approved_period',
  'Time-entry integrity migration must keep approved-period detection.',
);
requireIncludes(
  integrityMigration,
  "daterange(approval.week_start, approval.week_end + 1, '[)') &&",
  'Approved-period detection must use a range overlap, not a single clock-in date.',
);
requireIncludes(
  integrityMigration,
  "entry_clock_in at time zone 'America/Halifax'",
  'Approved-period detection must use Atlantic calendar dates.',
);
requireIncludes(
  integrityMigration,
  'create trigger time_entries_guard_insert',
  'Approved-period insert blocking must stay attached to time_entries.',
);
requireIncludes(
  integrityMigration,
  'before insert on public.time_entries',
  'Approved-period insert blocking must run before insert.',
);
requireIncludes(
  integrityMigration,
  'create trigger time_entries_guard_delete',
  'Approved-period delete blocking must stay attached to time_entries.',
);
requireIncludes(
  integrityMigration,
  'before delete on public.time_entries',
  'Approved-period delete blocking must run before delete.',
);
requireIncludes(
  integrityMigration,
  'public.time_entry_touches_approved_period(old.user_id, old.clock_in, old.clock_out)',
  'Approved-period update guard must protect the original entry period.',
);
requireIncludes(
  integrityMigration,
  'public.time_entry_touches_approved_period(new.user_id, new.clock_in, new.clock_out)',
  'Approved-period update guard must block moving entries into an approved period.',
);
requireIncludes(
  integrityMigration,
  'create or replace function public.has_closed_work_overlap',
  'Time-entry integrity migration must keep closed-work overlap detection.',
);
requireIncludes(
  integrityMigration,
  "candidate_event_type = 'work'",
  'Overlap detection must apply only to work entries.',
);
requireIncludes(
  integrityMigration,
  'candidate_clock_out is not null',
  'Overlap detection must target closed candidate work intervals.',
);
requireIncludes(
  integrityMigration,
  "candidate_clock_in < coalesce(existing.clock_out, 'infinity'::timestamptz)",
  'Overlap detection must reject closed work overlapping an existing open work interval.',
);

requireIncludes(
  manualBreakWorkMigration,
  'create or replace function public.break_start_has_work_entry',
  'Manual break guard migration must keep break-start work containment detection.',
);
requireIncludes(
  manualBreakWorkMigration,
  "candidate_clock_in < coalesce(work_entry.clock_out, 'infinity'::timestamptz)",
  'Manual break guard must treat closed work intervals as half-open at clock_out.',
);
requireIncludes(
  manualBreakWorkMigration,
  'before insert or update on public.time_entries',
  'Manual break guard must validate existing break rows on all updates, not only clock-in edits.',
);
requireIncludes(
  manualBreakWorkMigration,
  'create trigger time_entries_work_break_guard_update',
  'Manual break guard must prevent work-entry updates from orphaning existing breaks.',
);
requireIncludes(
  manualBreakWorkMigration,
  'create trigger time_entries_work_break_guard_delete',
  'Manual break guard must prevent work-entry deletes from orphaning existing breaks.',
);
requireIncludes(
  integrityMigration,
  'existing.clock_in < candidate_clock_out',
  'Overlap detection must reject intersecting closed work intervals.',
);
const overlapGuardCalls = integrityMigration.match(/public\.has_closed_work_overlap\(new\.id, new\.user_id, new\.event_type, new\.clock_in, new\.clock_out\)/g)?.length ?? 0;
if (overlapGuardCalls < 2) {
  fail('Overlap rejection must run for both insert and update paths.');
}
const adminBypassIndex = integrityMigration.indexOf('if public.is_admin() then');
const metadataStripIndex = integrityMigration.indexOf('if new.edited_by is distinct from old.edited_by');
if (adminBypassIndex === -1 || metadataStripIndex === -1 || adminBypassIndex > metadataStripIndex) {
  fail('Time-entry update guard must preserve legitimate admin edit metadata before stripping employee self-edit noise.');
}
requireIncludes(
  integrityMigration,
  'new.edited_by := old.edited_by;',
  'Time-entry update guard must strip employee self-edit edited_by noise.',
);
requireIncludes(
  integrityMigration,
  'new.edited_at := old.edited_at;',
  'Time-entry update guard must strip employee self-edit edited_at noise.',
);

const switchJobMetadataMigration = read('supabase/migrations/20260604163500_employee_switch_job_no_edit_metadata.sql');
if (switchJobMetadataMigration.includes('edited_by =') || switchJobMetadataMigration.includes('edited_at =')) {
  fail('employee_switch_job must not mark normal job switches as edited timecard corrections.');
}
requireIncludes(
  switchJobMetadataMigration,
  'create or replace function public.employee_switch_job',
  'Metadata cleanup migration must keep the employee_switch_job RPC replacement.',
);

const scopeBuilder = read('app/src/components/AdminScopeBuilder.tsx');
if (scopeBuilder.includes('sticky bottom-') || scopeBuilder.includes('fixed bottom-')) {
  fail('Scope Builder must not render a floating mobile save control above the bottom nav.');
}

const componentFiles = listFiles('app/src/components').filter((path) => path.endsWith('.tsx'));
const classLiteralPattern = /(?:className=|className:\\s*)["'`]([^"'`]*?)["'`]/g;
const breakpointGridPattern = /\b(?:sm|md|lg|xl|2xl):grid-cols-/;
const baseGridPattern = /(?:^|\s)grid-cols-/;

for (const file of componentFiles) {
  const source = read(file);
  if (source.includes('calculateTimesheetSummary')) {
    fail(`${file} must not use legacy calculateTimesheetSummary for payroll-facing UI totals. Use computeTimeSummary()/computeEntryHours() instead.`);
  }

  for (const match of source.matchAll(classLiteralPattern)) {
    const classes = match[1].replace(/\s+/g, ' ').trim();
    const isModalBackdrop = /\bfixed\b/.test(classes) && /\binset-0\b/.test(classes) && /\bbg-black\//.test(classes);
    if (!isModalBackdrop) continue;

    const modalSnippet = source.slice(match.index ?? 0, (match.index ?? 0) + 1_200);
    const hasBoundedPanelHeight = modalSnippet.includes('max-h-[calc(100dvh') || modalSnippet.includes('max-h-[92vh]');
    const hasInternalPanelScroll = modalSnippet.includes('overflow-y-auto') || modalSnippet.includes('overflow-auto');
    const hasSafeAreaAllowance = modalSnippet.includes('safe-area-inset-top') && modalSnippet.includes('safe-area-inset-bottom');

    if (/\bp-0\b/.test(classes) && !hasSafeAreaAllowance) {
      fail(`${file} has a viewport modal overlay with p-0 and no nearby safe-area allowance: "${classes}". Mobile modals must avoid clipped top/bottom content.`);
    }
    if (!hasBoundedPanelHeight || !hasInternalPanelScroll) {
      fail(`${file} has a viewport modal without a nearby bounded, scrollable panel: "${classes}". Mobile modal content must fit inside the viewport and scroll internally.`);
    }
  }

  for (const match of source.matchAll(classLiteralPattern)) {
    const classes = match[1].replace(/\s+/g, ' ').trim();
    if (!classes.includes('grid') || !/\bgap-/.test(classes)) continue;
    if (classes.includes('place-items-center') || /\b(h|w)-\d/.test(classes)) continue;

    const hasBaseGrid = baseGridPattern.test(classes);
    const hasBreakpointGrid = breakpointGridPattern.test(classes);
    if (!hasBaseGrid && hasBreakpointGrid) {
      fail(`${file} has a mobile content grid with breakpoint-only columns: "${classes}". Add a base grid-cols-1 or another explicit base grid column.`);
    }
    if (!hasBaseGrid && !hasBreakpointGrid) {
      fail(`${file} has a mobile content grid with implicit max-content columns: "${classes}". Add grid-cols-1 if this is a stacked content/form grid.`);
    }
  }
}
