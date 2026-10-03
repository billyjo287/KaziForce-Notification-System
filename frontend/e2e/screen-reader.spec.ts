// Phase 8 screen-reader spot check: what a screen reader announces on the key pages (the
// accessibility tree: landmarks, headings, names of controls, live regions). The full trees are
// attached to the test report for review; the checks below keep the essentials from breaking.
// A person with NVDA or TalkBack should still try the checklist in docs/accessibility.md.
import { expect, test } from '@playwright/test';
import { logIn } from './helpers';

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'one run is enough (desktop)');

test('log-in page: a heading, labelled fields, one main button', async ({ page }, testInfo) => {
  await page.goto('/login?theme=light');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - heading "Log in" [level=1]
    - textbox "Email address"
    - textbox "Password"
    - button "Log in"
  `);
  await testInfo.attach('login.aria.yml', { body: await page.locator('body').ariaSnapshot() });
});

test('alerts page: landmarks, one h1, named tabs, and a live region for new alerts', async ({
  page,
}, testInfo) => {
  await logIn(page, 'worker1@example.com');
  await page.goto('/worker/alerts?theme=light');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Main menu' }).first()).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Alert categories' })).toBeVisible();
  for (const tab of [/Urgent/, /Important/, /For later/]) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }
  // New alerts are announced without moving the focus.
  expect(await page.locator('[aria-live="polite"], [role="status"]').count()).toBeGreaterThan(0);
  await testInfo.attach('alerts.aria.yml', { body: await page.locator('body').ariaSnapshot() });
});

test('settings: every switch and choice has a name and its help is read with it', async ({
  page,
}, testInfo) => {
  await logIn(page, 'worker1@example.com');
  await page.goto('/worker/settings?theme=light');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  for (const control of await page.getByRole('switch').all()) {
    await expect(control).toHaveAccessibleName(/.+/);
    await expect(control).toHaveAccessibleDescription(/.+/);
  }
  for (const button of await page.getByRole('button').all()) {
    await expect(button).toHaveAccessibleName(/.+/);
  }
  await testInfo.attach('settings.aria.yml', { body: await page.locator('body').ariaSnapshot() });
});
