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

const service = read('app/src/services/supabaseTimeClockService.ts');

for (const method of ['clockOut', 'endBreak', 'updateEntryNotes']) {
  const block = extractMethod(service, method);
  if (block.includes('edited_by') || block.includes('edited_at')) {
    fail(`${method}() must not write edit metadata. Normal employee punch flow is not a timesheet edit.`);
  }
}

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
