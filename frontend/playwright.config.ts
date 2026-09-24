import { defineConfig, devices } from '@playwright/test';

// End-to-end tests in a real browser, against the production build (`vite preview`).
// Browser: Playwright's own Chromium (`npx playwright install chromium` once), or set
// PW_CHANNEL=chrome to use the Google Chrome already installed on your computer.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone-360',
      use: {
        ...devices['Desktop Chrome'],
        channel,
        viewport: { width: 360, height: 800 },
        hasTouch: true,
      },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
