// Phase 3: alerts arrive live, without refreshing the page (PRD FR-6), at 360 px and 1440 px.
// An admin sends announcements through the API while a worker has the app open.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN, expectNoSeriousA11yIssues, logIn } from './helpers';

const API = 'http://localhost:4001/api';

async function announce(request: APIRequestContext, title: string) {
  const login = await request.post(`${API}/auth/login`, {
    headers: { 'X-Requested-With': 'KaziForce' },
    data: ADMIN,
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const res = await request.post(`${API}/admin/announcements`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { audience: 'worker', title, message: 'Sent during the automated live test.' },
  });
  expect(res.status()).toBe(201);
}

test('a new alert slides in live, and "Open" on another page goes straight to it', async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  await logIn(page, 'worker1@example.com');
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();

  // On the Alerts page: it appears in its category without a refresh (everything is
  // "Important" until the classifier arrives in Phase 4).
  await announce(request, `Live on the alerts page ${stamp}`);
  await page.getByRole('tab', { name: /Important/ }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`Live on the alerts page ${stamp}`) }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // On another page: a short message with "Open".
  await page.getByRole('link', { name: 'Jobs' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jobs' })).toBeVisible();
  await announce(request, `Live elsewhere ${stamp}`);
  // exact: the toast library also copies the text into a hidden announcement for screen readers.
  await expect(
    page.getByText(`New Important alert: Live elsewhere ${stamp}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: `Live elsewhere ${stamp}` }),
  ).toBeVisible();
});

test('offline: shows the banner, then catches up on alerts sent meanwhile', async ({
  page,
  request,
  context,
}, testInfo) => {
  const title = `Sent while offline ${testInfo.project.name} ${Date.now()}`;
  await logIn(page, 'worker1@example.com');
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await announce(request, title);

  await context.setOffline(false);
  await expect(page.getByText(/You are offline/)).toBeHidden();
  await page.getByRole('tab', { name: /Important/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({
    timeout: 15_000,
  });
});
