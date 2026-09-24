import { defineConfig, devices } from '@playwright/test';

// End-to-end tests in a real browser, against the production build of the website and a real
// backend with its own database (see backend/scripts/e2e-server.mjs; Docker must be running).
// Browser: Playwright's own Chromium (`npx playwright install chromium` once), or set
// PW_CHANNEL=chrome to use the Google Chrome already installed on your computer.
const channel = process.env.PW_CHANNEL || undefined;
const API = 'http://localhost:4001';

export default defineConfig({
  testDir: './e2e',
  // One shared test database: tests run one after another so they cannot disturb each other.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
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
  webServer: [
    {
      command: 'npm run e2e:server -w backend',
      cwd: '..',
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run build && npm run preview',
      url: 'http://localhost:4173',
      env: { VITE_API_URL: API },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
