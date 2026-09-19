#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.argv[2] || 'lease');
const expectedMode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'production';

const fail = (message) => {
  console.error(`Lease build verification failed: ${message}`);
  process.exitCode = 1;
};

let indexHtml;
try {
  indexHtml = await readFile(path.join(outputDir, 'index.html'), 'utf8');
} catch {
  fail(`missing ${path.join(outputDir, 'index.html')}`);
  process.exit();
}

if (!/<meta\s+name="robots"\s+content="[^"]*noindex[^"]*nofollow[^"]*"/iu.test(indexHtml)) {
  fail('index.html is missing noindex, nofollow metadata');
}

const references = [...indexHtml.matchAll(/(?:src|href)="([^"?#]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value.startsWith('/lease/'));

if (references.length === 0) fail('index.html does not reference /lease/ assets');

for (const reference of references) {
  const relative = reference.slice('/lease/'.length);
  try {
    await stat(path.join(outputDir, relative));
  } catch {
    fail(`missing referenced asset ${reference}`);
  }
}

const jsReferences = references.filter((value) => value.endsWith('.js'));
const bundles = await Promise.all(
  jsReferences.map((reference) => readFile(path.join(outputDir, reference.slice('/lease/'.length)), 'utf8')),
);
const bundleText = bundles.join('\n');

const forbidden = [
  '/Users/Dane/Real Estate',
  'lease_seed_data_v1.0.2',
];
for (const value of forbidden) {
  if (bundleText.includes(value)) fail(`bundle contains private/source marker ${JSON.stringify(value)}`);
}

const productionHost = 'akofsmmsxtfqduebetga.supabase.co';
const stagingHost = 'qumnzxzoypgpejtwbigw.supabase.co';
if (expectedMode === 'production') {
  if (!bundleText.includes(productionHost)) fail('production Supabase host is absent');
  if (bundleText.includes(stagingHost)) fail('staging Supabase host is present in production output');
} else if (expectedMode === 'staging') {
  if (!bundleText.includes(stagingHost)) fail('staging Supabase host is absent');
  if (bundleText.includes(productionHost)) fail('production Supabase host is present in staging output');
}

if (!process.exitCode) {
  console.log(`Verified ${expectedMode} lease build at ${outputDir}.`);
}
