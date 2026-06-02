import { readFileSync } from 'node:fs';
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
if (!appShell.includes('createPortal(mobileNav, document.body)')) {
  fail('Mobile bottom nav must render through a document.body portal so page scroll containers cannot unpin it.');
}

const styles = read('app/src/styles/index.css');
if (!styles.includes('.app-mobile-bottom-nav') || !styles.includes('position: fixed !important')) {
  fail('Mobile bottom nav must keep its hardened fixed-position CSS.');
}

const componentFiles = listFiles('app/src/components').filter((path) => path.endsWith('.tsx'));
const classLiteralPattern = /(?:className=|className:\\s*)["'`]([^"'`]*?)["'`]/g;
const breakpointGridPattern = /\b(?:sm|md|lg|xl|2xl):grid-cols-/;
const baseGridPattern = /(?:^|\s)grid-cols-/;

for (const file of componentFiles) {
  const source = read(file);
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
