// Log-in on a new phone or computer: "Where should we send your code?", the code boxes, and
// "Remember this phone or computer" (ADR 0013). The test server logs in with the password alone
// (ACCOUNT_CODES=false), so here the browser is given the code-step answers the real server
// sends; the last step logs in for real. The server side is tested in
// backend/tests/accountCodes.test.ts.
import { expect, test } from '@playwright/test';
import { PASSWORD, expectNoHorizontalScroll, expectNoSeriousA11yIssues } from './helpers';

const API = 'http://localhost:4001/api';

test('new device: choose SMS, type the code, and be greeted by name next time', async ({
  page,
}) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      json: {
        codeRequired: true,
        challengeId: 'e2e-challenge',
        firstName: 'Wanjiru',
        options: [
          { channel: 'sms', to: '07•• ••• 004' },
          { channel: 'email', to: 'wo•••@example.com' },
        ],
      },
    }),
  );
  await page.route('**/api/auth/login/send', (route) =>
    route.fulfill({
      json: { channel: 'sms', to: '07•• ••• 004', expiresInSeconds: 300, resendInSeconds: 30 },
    }),
  );
  let sentCode: unknown;
  await page.route('**/api/auth/login/code', async (route) => {
    sentCode = route.request().postDataJSON();
    // The right code: log in for real, so the session cookie is set as usual.
    const response = await route.fetch({
      url: `${API}/auth/login`,
      postData: { identifier: 'worker1@example.com', password: PASSWORD },
    });
    await route.fulfill({ response });
  });

  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('worker1@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Where should we send your code?' }),
  ).toBeFocused();
  await expect(page.getByRole('radio', { name: /By SMS/ })).toBeChecked();
  await expectNoSeriousA11yIssues(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Send my code' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeFocused();
  await expect(page.getByRole('button', { name: /Send a new code in \d+ s/ })).toBeDisabled();
  await expectNoSeriousA11yIssues(page);
  await expectNoHorizontalScroll(page);

  // Pasting "482 913" fills the six boxes and logs in by itself.
  await page.getByLabel('6-digit code').fill('482 913');
  await page.waitForURL(/\/worker\//);
  expect(sentCode).toEqual({ challengeId: 'e2e-challenge', code: '482913', rememberDevice: true });

  // Next visit on this device: "Welcome back", only the password.
  await page.getByRole('button', { name: 'Log out' }).locator('visible=true').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, Wanjiru');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expectNoSeriousA11yIssues(page);
});

test('no account for that email: offered to create one, with the email filled in', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(`nobody.${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'We cannot find an account' }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByRole('radio', { name: /I'm hiring/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Email address')).toHaveValue(/^nobody\.\d+@example\.com$/);
});

test('a verified phone number logs in like an email', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('0700 000 004');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('0700 000 004', { exact: true })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/worker\//);
});
