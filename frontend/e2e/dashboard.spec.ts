import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousA11yIssues, trackScripts } from './helpers';

test.describe('Worker Alerts dashboard', () => {
  test('passes axe in light mode, list and details', async ({ page }) => {
    await page.goto('/worker/alerts?theme=light');
    await expect(page.getByRole('tab', { name: /Urgent/ })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: /Warehouse packers needed today/ }).click();
    await expect(page.getByRole('button', { name: 'View job' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('passes axe in dark mode and in Kiswahili', async ({ page }) => {
    await page.goto('/worker/alerts?theme=dark&lang=sw');
    await expect(page.getByRole('heading', { level: 1, name: 'Arifa' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test('never downloads Three.js or the landing page code', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.goto('/worker/alerts');
    await expect(page.getByRole('tab', { name: /Urgent/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(scripts.filter((url) => /heroScene|LandingPage|three/i.test(url))).toEqual([]);
  });

  test('"Not important to me" can be undone', async ({ page }) => {
    await page.goto('/worker/alerts');
    await page.getByRole('tab', { name: /Important/ }).click();
    const card = page.getByRole('button', { name: /New message from Pwani Events/ });
    await card.click();
    await page.getByRole('button', { name: 'Not important to me' }).click();

    await expect(
      page.getByText('Marked as not important. We will show you fewer alerts like it.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(card).toBeHidden();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card).toBeVisible();
  });

  test('keyboard: the first Tab reaches "Skip to main content"', async ({ page }) => {
    await page.goto('/worker/alerts');
    await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  });

  test('Large text still fits without sideways scrolling', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'kf.settings',
        JSON.stringify({ state: { textSize: 'large', reduceMotion: false }, version: 0 }),
      ),
    );
    await page.goto('/worker/alerts');
    await expect(page.getByRole('tab', { name: /Urgent/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');
    await expectNoHorizontalScroll(page);
  });

  test('loading error is explained in plain words', async ({ page }) => {
    await page.goto('/worker/alerts?mock=error');
    await expect(page.getByRole('alert')).toContainText('We could not load your alerts');
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe('Other app pages', () => {
  for (const path of [
    '/employer/alerts',
    '/admin/overview',
    '/worker/settings',
    '/ui-kit',
    '/login',
  ]) {
    test(`${path} passes axe and fits the screen`, async ({ page }) => {
      await page.goto(`${path}?theme=light`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousA11yIssues(page);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('Smallest phones (320px, PRD NFR-4)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'phone project only');

  for (const path of ['/', '/login', '/worker/alerts', '/employer/alerts', '/admin/overview']) {
    test(`${path} fits a 320px screen`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});
