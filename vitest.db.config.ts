import { defineConfig } from 'vitest/config';

// Database tests: need a local Supabase reset with `pnpm db:reset` (see CLAUDE.md).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
