// Header controls on every page (360 px phone and 1440 px desktop): the light/dark toggle,
// Log out, the welcome message after logging in, and "You are logged out" that goes away.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousA11yIssues, logIn } from './helpers';

test('dark mode, welcome message and Log out from any page', async ({ page }, testInfo) => {
  await logIn(page, 'worker1@example.com');

  // Welcome message: shown after logging in, gone by itself after 5 seconds.
  const welcome = page.getByRole('status').filter({ hasText: 'Welcome back, Wanjiru!' });
  await expect(welcome).toBeVisible();
  await page.getByRole('link', { name: 'Jobs' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jobs' })).toBeVisible();
  await expect(welcome).toBeHidden({ timeout: 7000 });

  // Dark mode on with the sun/moon toggle, checked for contrast and layout, then light again.
  const toggle = page.getByRole('button', { name: 'Dark mode' }).locator('visible=true');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expectNoSeriousA11yIssues(page);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath('jobs-dark.png') });

  await page.reload(); // the choice is remembered
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('jobs-light.png') });

  // Log out from this page (not Settings); the confirmation goes away after 5 seconds.
  await page.getByRole('button', { name: 'Log out' }).locator('visible=true').click();
  await expect(page).toHaveURL(/\/login$/);
  const loggedOut = page.getByText('You are logged out.', { exact: false });
  await expect(loggedOut).toBeVisible();
  await expect(loggedOut).toBeHidden({ timeout: 7000 });
});

test('sign-up: one question per screen, a typo hint and password rules ticked off', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByRole('radio', { name: /I'm looking for work/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Email address').fill(`rules.${Date.now()}@gmial.com`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/Did you mean rules\.\d+@gmail\.com\?/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Yes, use this' }).click();
  await page.getByLabel('Your full name').fill('Test Mtu');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Choose a password').fill('12345678');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByText('This password is too easy to guess.', { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
  await expectNoSeriousA11yIssues(page);
});
