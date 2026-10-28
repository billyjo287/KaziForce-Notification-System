// Other browsers (PRD NFR-7): a short smoke test in Firefox and in WebKit (the engine of Safari on
// iPhones and Macs). Edge and Samsung Internet use Chromium, which every other test file covers.
// Runs only in the "firefox" and "webkit" projects (playwright.config.ts).
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN, expectNoHorizontalScroll, logIn } from './helpers';

const API = 'http://localhost:4001/api';

async function announce(request: APIRequestContext, title: string) {
  const login = await request.post(`${API}/auth/login`, {
    headers: { 'X-Requested-With': 'KaziForce' },
    data: { email: ADMIN.email, password: ADMIN.password },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const res = await request.post(`${API}/admin/announcements`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { audience: 'worker', title, message: 'Sent during the browser smoke test.' },
  });
  expect(res.status()).toBe(201);
}

test('landing page and log-in page work, with no script errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a worker logs in, opens settings and receives a live alert', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await logIn(page, 'worker2@example.com');
  await page.goto('/worker/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.goto('/worker/alerts');
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();
  // Live delivery over Socket.IO in this browser: the alert appears without a refresh.
  const title = `Browser check ${test.info().project.name} ${Date.now()}`;
  await announce(request, title);
  await page.getByRole('tab', { name: /For later/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
