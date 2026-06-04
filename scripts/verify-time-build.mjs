import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildDir = resolve(process.argv[2] || 'time');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
const modeIndex = process.argv.indexOf('--mode');
const mode = modeArg?.split('=')[1] ?? (modeIndex === -1 ? undefined : process.argv[modeIndex + 1]) ?? 'production';
const expectedProductionBuildDir = resolve(root, 'time');
const expectedStagingBuildDir = resolve(root, 'staging-site/time');
const productionSupabaseHost = 'akofsmmsxtfqduebetga.supabase.co';
const stagingSupabaseHost = 'qumnzxzoypgpejtwbigw.supabase.co';
const productionUrl = 'https://danecutcliffe.com/time/';
const stagingUrl = 'https://staging.danecutcliffe.com/time/';
const stagingScopeNoop = 'is disabled in the staging Time Clock environment';

const fail = (message) => {
  throw new Error(`[verify-time-build] ${message}`);
};

const read = (path) => readFileSync(resolve(buildDir, path), 'utf8');
const exists = (path) => existsSync(resolve(buildDir, path));

if (mode === 'production' && buildDir !== expectedProductionBuildDir) {
  fail(`production builds must verify the canonical generated time/ directory, not ${buildDir}.`);
}
if (mode === 'staging' && buildDir !== expectedStagingBuildDir) {
  fail(`staging builds must verify the staging-site/time generated directory, not ${buildDir}.`);
}

if (!exists('index.html')) fail(`${buildDir}/index.html is missing.`);
if (!exists('sw.js')) fail(`${buildDir}/sw.js is missing.`);
if (exists('time-ui-overrides.css')) fail('time-ui-overrides.css must not ship as a runtime layout override.');

const index = read('index.html');
const sw = read('sw.js');
const assetRefs = Array.from(index.matchAll(/\/time\/assets\/([^"']+)/g)).map((match) => match[1]);
const nonHashedRuntimeCssRefs = Array.from(index.matchAll(/href=["']\/time\/(?!assets\/)([^"']+\.css)["']/g)).map((match) => match[1]);

if (assetRefs.length === 0) fail('index.html does not reference any /time/assets files.');
if (index.includes('time-ui-overrides.css')) fail('index.html must not reference runtime CSS override files.');
if (nonHashedRuntimeCssRefs.length > 0) {
  fail(`index.html references non-generated runtime CSS: ${nonHashedRuntimeCssRefs.join(', ')}. Put app CSS in app/src/styles so Vite emits hashed assets.`);
}

for (const asset of assetRefs) {
  if (!exists(`assets/${asset}`)) {
    fail(`index.html references missing asset: assets/${asset}`);
  }
}

const jsBundle = assetRefs
  .filter((asset) => asset.endsWith('.js'))
  .map((asset) => read(`assets/${asset}`))
  .join('\n');

if (!/time-clock-runtime-\d{14}/.test(sw)) {
  fail('sw.js does not contain a stamped time-clock-runtime-YYYYMMDDHHMMSS cache id.');
}

if (mode === 'production') {
  if (!jsBundle.includes(productionSupabaseHost)) fail('production bundle does not contain the production Supabase host.');
  if (jsBundle.includes(stagingSupabaseHost)) fail('production bundle contains the staging Supabase host.');
  if (!jsBundle.includes(productionUrl)) fail('production bundle does not contain the production redirect URL.');
  if (jsBundle.includes(stagingUrl)) fail('production bundle contains the staging redirect URL.');
}

if (mode === 'staging') {
  if (!jsBundle.includes(stagingSupabaseHost)) fail('staging bundle does not contain the staging Supabase host.');
  if (!jsBundle.includes(stagingUrl)) fail('staging bundle does not contain the staging redirect URL.');
  for (const integration of ['scope-admin-integration.js', 'scope-employee-integration.js']) {
    if (!exists(integration)) fail(`staging ${integration} is missing.`);
    if (!read(integration).includes(stagingScopeNoop)) {
      fail(`staging ${integration} is not the expected no-op integration file.`);
    }
  }
}

console.log(`[verify-time-build] ${buildDir} (${mode}) references ${assetRefs.length} existing assets and has a stamped service worker.`);
