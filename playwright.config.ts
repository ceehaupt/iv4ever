import { defineConfig, devices } from '@playwright/test';

const RELAY_PORT = Number(process.env.RELAY_PORT ?? 8790);
process.env.RELAY_PORT = String(RELAY_PORT);

// Oberflächentests (e2e/). Der Determinismus-Test läuft in allen drei Engines, die übrigen nur in Chromium.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // In der CI zusätzlich „list“, damit die vollständige Fehlermeldung im Log steht.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // Langsame CI-Rechner: einmal wiederholen, um echte Fehler von Zeitproblemen zu unterscheiden (Wiederholung steht im Log).
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: !process.env.CI },
    { command: `node server/relay.mjs`, env: { PORT: String(RELAY_PORT), GRACE_MS: '3000' }, port: RELAY_PORT, reuseExistingServer: !process.env.CI },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /determinism/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /determinism/ },
  ],
});
