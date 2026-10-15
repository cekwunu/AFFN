import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${port}`;
const brregPort = Number(process.env.BRREG_STUB_PORT ?? 3199);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(kitchen|commission|settlements|reconciliation)\.spec\.ts/,
    },
    // The kitchen and commission tests order from the same seeded vendor the storefront tests
    // briefly pause (and change its rate), so they run after the other tests.
    {
      name: 'kitchen',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(kitchen|commission|settlements)\.spec\.ts/,
      dependencies: ['chromium'],
    },
    // Reconciliation compares every transaction in the database with the provider's report, so it
    // runs once the other tests have stopped creating payments.
    {
      name: 'reconciliation',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /reconciliation\.spec\.ts/,
      dependencies: ['kitchen'],
    },
  ],
  webServer: [
    {
      // Stand-in for Brønnøysundregistrene, so tests never depend on the real registry.
      command: `node e2e/support/brreg-stub.mjs ${brregPort}`,
      url: `http://127.0.0.1:${brregPort}/enheter/923456783`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm dev --port ${port}`,
      env: {
        // Every test request comes from one IP: scale per-IP limits (per-account limits stay).
        RATE_LIMIT_IP_SCALE: '50',
        BRREG_API_URL: `http://127.0.0.1:${brregPort}`,
        // Secret for the scheduled reconciliation route (e2e/reconciliation.spec.ts).
        CRON_SECRET: 'e2e-cron-secret-0123456789abcdef',
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
