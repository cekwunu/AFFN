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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
      },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
