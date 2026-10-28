// Screenshots of the main screens for the thesis (Chapter 5) and sprint reviews. Skipped in normal
// test runs; to take them (phone and desktop), from frontend/:
//   PowerShell: $env:SCREENSHOTS="1"; npx playwright test screenshots
// They are saved to docs/screenshots/<phone-360|desktop-1440>-<screen>.png (sample data only).
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, logIn } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to take the thesis screenshots');

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: `../docs/screenshots/${test.info().project.name}-${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

test.describe('Thesis screenshots', () => {
  test.use({ colorScheme: 'light' });

  test('public pages', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, '01-landing');
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await shot(page, '02-login');
  });

  test('worker', async ({ page }) => {
    await logIn(page, 'worker1@example.com');
    await page.goto('/worker/alerts');
    await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();
    await shot(page, '03-worker-alerts');
    await page.goto('/worker/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await shot(page, '04-worker-settings');
    await page.goto('/worker/jobs');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, '05-worker-jobs');
  });

  test('employer', async ({ page }) => {
    await logIn(page, 'employer1@example.com');
    await page.goto('/employer/jobs');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, '06-employer-jobs');
    const firstJob = page.locator('a[href^="/employer/jobs/"]:not([href$="/new"])').first();
    if (await firstJob.isVisible()) {
      await firstJob.click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await shot(page, '07-employer-job-delivery');
    }
  });

  test('admin', async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    for (const [path, name] of [
      ['/admin/overview', '08-admin-overview'],
      ['/admin/spam', '09-admin-spam-review'],
      ['/admin/delivery-logs', '10-admin-delivery-logs'],
      ['/admin/models', '11-admin-models'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await shot(page, name);
    }
  });
});
