import { expect, test, type Page } from '@playwright/test';
import { PASSWORD } from './helpers';

// The landing, log-in and sign-up pages arrive as ready-made HTML (ADR 0010): they show before
// the app's code has downloaded, and nothing done in that time is lost.

/** Holds back every JavaScript file until `release()`, like a very slow connection. */
async function slowScripts(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/*.js', async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

test.describe('Pages ready before the app arrives', () => {
  test('log in: shows at once; typing and pressing "Log in" early still logs in', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const release = await slowScripts(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // No app code has run yet, and the page is already there.
    await expect(page.locator('[data-prerendered]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await expect(page).toHaveTitle('Log in · KaziForce');

    await page.getByLabel('Email address').fill('worker1@example.com');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    // The early press never sends the form by itself (that would put the password in the address).
    expect(page.url()).not.toContain('password');

    release();
    await page.waitForURL(/\/worker\//);
    expect(page.url()).not.toContain('password');
    expect(errors.filter((e) => /Content Security Policy/.test(e))).toEqual([]);
  });

  test('sign up: the role chosen early is kept', async ({ page }) => {
    const release = await slowScripts(page);
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: /I'm hiring/ }).check();
    release();

    await expect(page.locator('[data-prerendered]')).toHaveCount(0); // the app has taken over
    await expect(page.getByRole('radio', { name: /I'm hiring/ })).toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel('Your full name')).toBeVisible();
  });

  test('Kiswahili visitors never see the English copy', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kf.language', 'sw'));
    const release = await slowScripts(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-prerendered]')).toBeHidden();
    release();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingia');
  });

  test('other addresses never show a ready-made page', async ({ page }) => {
    const release = await slowScripts(page);
    await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-prerendered]')).toBeHidden();
    release();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
