import { defineConfig } from 'vitest/config';

// Vitest nur für Unit-Tests in src/; e2e/ gehört Playwright.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
