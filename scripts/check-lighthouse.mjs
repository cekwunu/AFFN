// Lighthouse on the public vendor page (QR-02, NFR-01): mobile preset with Lighthouse's own
// throttling (slow 4G, mid-range phone). Run against a production build:
//   pnpm build && pnpm start -p 3300 &
//   LIGHTHOUSE_URL=http://127.0.0.1:3300/e/affn-2027/mama-afrika-kjokken pnpm check:lighthouse
// Warms the page up, runs three times and uses the median run (scores vary between runs).
// Fails when performance or accessibility scores below 90.
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = process.env.LIGHTHOUSE_URL ?? 'http://127.0.0.1:3000/e/affn-2027/mama-afrika-kjokken';
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const MIN = { performance: 0.9, accessibility: 0.9 };

const warmUp = await fetch(url);
if (!warmUp.ok) throw new Error(`${url} answered ${warmUp.status}`);

const chromePath = process.env.CHROME_PATH ?? chromium.executablePath();
const chrome = await chromeLauncher.launch({
  chromePath,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    runs.push(result.lhr);
    console.log(
      `run ${i + 1}: performance ${Math.round(result.lhr.categories.performance.score * 100)}`,
    );
  }
} finally {
  await chrome.kill();
}

runs.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
const { categories, audits } = runs[Math.floor(runs.length / 2)];
console.log('median run:');
for (const [id, category] of Object.entries(categories)) {
  console.log(`  ${id.padEnd(15)} ${Math.round(category.score * 100)}`);
}
for (const id of ['largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift']) {
  console.log(`  ${id.padEnd(25)} ${audits[id].displayValue}`);
}
const failed = Object.entries(MIN).filter(([id, min]) => categories[id].score < min);
if (failed.length) {
  console.error(`Below 90: ${failed.map(([id]) => id).join(', ')}`);
  process.exitCode = 1;
}
