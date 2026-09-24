import { expect, test } from '@playwright/test';
import {
  ADMIN,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  logIn,
  trackScripts,
} from './helpers';

test.describe('Worker Alerts dashboard (real data)', () => {
  test('passes axe in light mode, list and details', async ({ page }) => {
    await logIn(page, 'worker1@example.com');
    await page.goto('/worker/alerts?theme=light');
    // Earlier tests may already have read it, so open the Urgent tab explicitly.
    await page.getByRole('tab', { name: /Urgent/ }).click();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: /Warehouse packers needed today/ }).click();
    await expect(page.getByRole('link', { name: 'View job' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('passes axe in dark mode, for a user whose language is Kiswahili', async ({ page }) => {
    await logIn(page, 'worker3@example.com'); // Amina Hassan chose Kiswahili
    await page.goto('/worker/alerts?theme=dark');
    await expect(page.getByRole('heading', { level: 1, name: 'Arifa' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test('never downloads Three.js or the landing page code', async ({ page }) => {
    const scripts = trackScripts(page);
    await logIn(page, 'worker1@example.com');
    await expect(page.getByRole('tab', { name: /Urgent/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(scripts.filter((url) => /heroScene|LandingPage|three/i.test(url))).toEqual([]);
  });

  test('"Not important to me" can be undone', async ({ page }) => {
    await logIn(page, 'worker1@example.com');
    await page.getByRole('tab', { name: /Important/ }).click();
    const card = page.getByRole('button', { name: /New message from Mwangi Logistics/ });
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
    await logIn(page, 'worker1@example.com');
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
    await logIn(page, 'worker1@example.com');
    await expect(page.getByRole('tab', { name: /Urgent/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');
    await expectNoHorizontalScroll(page);
  });

  test('a loading error is explained in plain words', async ({ page }) => {
    await logIn(page, 'worker1@example.com');
    await page.route('**/api/notifications', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('We could not load your alerts', {
      timeout: 15_000,
    });
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe('Other pages pass axe and fit the screen', () => {
  const pages: { who: string; path: string; password?: string }[] = [
    { who: 'employer1@example.com', path: '/employer/alerts' },
    { who: 'employer1@example.com', path: '/employer/jobs' },
    { who: 'worker1@example.com', path: '/worker/jobs' },
    { who: 'worker1@example.com', path: '/worker/jobs?tab=applications' },
    { who: 'worker1@example.com', path: '/worker/messages' },
    { who: 'worker1@example.com', path: '/worker/settings' },
    { who: 'worker1@example.com', path: '/worker/settings/profile' },
    { who: ADMIN.email, path: '/admin/users', password: ADMIN.password },
    { who: ADMIN.email, path: '/admin/jobs', password: ADMIN.password },
    { who: ADMIN.email, path: '/admin/audit-log', password: ADMIN.password },
  ];
  for (const { who, path, password } of pages) {
    test(`${path} (${who.split('@')[0]})`, async ({ page }) => {
      await logIn(page, who, password);
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}theme=light`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousA11yIssues(page);
      await expectNoHorizontalScroll(page);
    });
  }

  for (const path of ['/login', '/register', '/forgot-password', '/ui-kit']) {
    test(`${path} (logged out)`, async ({ page }) => {
      await page.goto(`${path}?theme=light`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousA11yIssues(page);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('Smallest phones (320px, PRD NFR-4)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'phone project only');

  test('public pages fit a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('app pages fit a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await logIn(page, 'employer1@example.com');
    for (const path of ['/employer/alerts', '/employer/jobs', '/employer/jobs/new']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});
