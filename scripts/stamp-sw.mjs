// Stamp the generated service worker cache name with a unique per-build id.
// Runs as a postbuild step of `npm run build`, so EVERY build (no matter which
// command invokes it) changes time/sw.js. Without this, sw.js stays byte-identical
// across deploys and stuck browsers never pull the new app shell.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(scriptDir, '../time/sw.js');

if (!existsSync(swPath)) {
  console.warn(`[stamp-sw] ${swPath} not found; service worker cache not stamped.`);
  process.exit(0);
}

const buildId = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const src = readFileSync(swPath, 'utf8');
const stamped = src.replace(/time-clock-runtime-[A-Za-z0-9._-]+/, `time-clock-runtime-${buildId}`);
writeFileSync(swPath, stamped);
console.log(`[stamp-sw] Stamped service worker cache: time-clock-runtime-${buildId}`);
