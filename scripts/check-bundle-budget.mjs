// Fails when public pages ship more JavaScript than NFR-01 allows (150 kB gzipped).
// Run after `pnpm build`. Counts the module scripts each prerendered page loads; `noModule`
// polyfills are skipped because modern browsers never download them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;
// Prerendered HTML of every public page (relative to .next/server/app). Add storefront pages here.
const PUBLIC_PAGES = ['nb.html', 'en.html'];

const appDir = join(process.cwd(), '.next/server/app');
const scriptTag = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"[^>]*>/g;

let failed = false;
for (const page of PUBLIC_PAGES) {
  const html = readFileSync(join(appDir, page), 'utf8');
  const sources = new Set(
    [...html.matchAll(scriptTag)]
      .filter(([tag]) => !/\bnomodule\b/i.test(tag))
      .map(([, src]) => src),
  );
  let bytes = 0;
  for (const src of sources) {
    const file = join(process.cwd(), '.next', src.replace(/^\/_next/, ''));
    bytes += gzipSync(readFileSync(file), { level: 6 }).length;
  }
  const kb = bytes / 1024;
  const ok = kb <= BUDGET_KB;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${page.padEnd(12)} ${kb.toFixed(1)} kB gz JS (${sources.size} files, budget ${BUDGET_KB} kB)`,
  );
}

if (failed) {
  console.error(`\nPublic pages exceed the ${BUDGET_KB} kB JS budget (PRD NFR-01).`);
  process.exit(1);
}
