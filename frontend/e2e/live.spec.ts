// Alerts arrive live, without refreshing the page (PRD FR-6), at 360 px and 1440 px, sorted by
// the classifier (Phase 4): announcements are "For later" (quiet), messages are "Important".
// An admin and an employer act through the API while a worker has the app open.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN, PASSWORD, expectNoSeriousA11yIssues, logIn } from './helpers';

const API = 'http://localhost:4001/api';

async function token(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, {
    headers: { 'X-Requested-With': 'KaziForce' },
    data: { email, password },
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function announce(request: APIRequestContext, title: string) {
  const res = await request.post(`${API}/admin/announcements`, {
    headers: { Authorization: `Bearer ${await token(request, ADMIN.email, ADMIN.password)}` },
    data: { audience: 'worker', title, message: 'Sent during the automated live test.' },
  });
  expect(res.status()).toBe(201);
}

/** Mwangi Logistics (employer1) messages Wanjiru (worker1) in their existing conversation. */
async function employerMessagesWorker(request: APIRequestContext, body: string) {
  const headers = {
    Authorization: `Bearer ${await token(request, 'employer1@example.com', PASSWORD)}`,
  };
  const list = await request.get(`${API}/conversations`, { headers });
  const { items } = (await list.json()) as {
    items: { applicationId: string; with: { name: string } }[];
  };
  const withWanjiru = items.find((c) => c.with.name === 'Wanjiru Kamau');
  expect(withWanjiru, 'seeded conversation with Wanjiru').toBeTruthy();
  const res = await request.post(`${API}/conversations/${withWanjiru!.applicationId}`, {
    headers,
    data: { body },
  });
  expect(res.status()).toBe(201);
}

test('new alerts slide in live, in the right category, and "Open" goes straight to one', async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  await logIn(page, 'worker1@example.com');
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();

  // An announcement appears under "For later" without a refresh.
  await announce(request, `Live on the alerts page ${stamp}`);
  await page.getByRole('tab', { name: /For later/ }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`Live on the alerts page ${stamp}`) }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // On another page: an announcement stays quiet ("For later" never pops up)...
  await page.getByRole('link', { name: 'Jobs' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jobs' })).toBeVisible();
  await announce(request, `Quiet ${stamp}`);
  // ...but a message from the employer ("Important") shows a short message with "Open".
  await employerMessagesWorker(request, `Please come to Gate B at 2pm. ${stamp}`);
  const toast = page.getByText('New Important alert: New message from Mwangi Logistics', {
    exact: true,
  });
  await expect(toast).toBeVisible();
  await expect(page.getByText(`New For later alert: Quiet ${stamp}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Open' }).click();
  // The alert opens (its details heading), showing the message.
  await expect(
    page.getByRole('heading', { level: 2, name: 'New message from Mwangi Logistics' }),
  ).toBeFocused();
  await expect(page.getByText(`Please come to Gate B at 2pm. ${stamp}`).last()).toBeVisible();
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
  await page.getByRole('tab', { name: /For later/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({
    timeout: 15_000,
  });
});
