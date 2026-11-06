// Design refresh, Step 9 (polish): with reduced motion nothing moves, every page fits a 320 px
// phone, and the new design pieces work with the keyboard alone. axe runs on the way.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, expectNoHorizontalScroll, expectNoSeriousA11yIssues, logIn } from './helpers';

const WORKER = 'worker2@example.com';
const EMPLOYER = 'employer1@example.com';

const PAGES: { who: string; password?: string; paths: string[] }[] = [
  {
    who: WORKER,
    paths: [
      '/worker/home',
      '/worker/alerts',
      '/worker/jobs',
      '/worker/messages',
      '/worker/settings',
      '/worker/summary',
      '/privacy',
      '/no-such-page',
    ],
  },
  {
    who: EMPLOYER,
    paths: ['/employer/home', '/employer/alerts', '/employer/jobs', '/employer/jobs/new'],
  },
  {
    who: ADMIN.email,
    password: ADMIN.password,
    paths: [
      '/admin/overview',
      '/admin/users',
      '/admin/jobs',
      '/admin/delivery-logs',
      '/admin/spam',
      '/admin/announcements',
      '/admin/models',
      '/admin/notification-rules',
      '/admin/audit-log',
    ],
  },
];

/** Waits for the page's heading, then for the swap from the ready-made copy (ADR 0010). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.locator('[data-prerendered]')).toHaveCount(0);
}

/** Nothing on the page is still moving: every CSS/Web animation has finished at once. */
async function expectNothingMoving(page: Page, where: string) {
  await page.waitForTimeout(300);
  const moving = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        const name = 'animationName' in a ? (a as CSSAnimation).animationName : 'web animation';
        return `${name} on <${el?.tagName.toLowerCase()} class="${el?.getAttribute('class') ?? ''}">`;
      }),
  );
  expect(moving, `still moving on ${where}`).toEqual([]);
}

test.describe('Reduced motion: nothing moves', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'desktop project only');

  test('the device setting: public pages and every app page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/login', '/register']) {
      await open(page, path);
      await expectNothingMoving(page, path);
    }
    for (const { who, password, paths } of PAGES) {
      await page.context().clearCookies();
      await logIn(page, who, password);
      for (const path of paths) {
        await open(page, path);
        await expectNothingMoving(page, path);
      }
    }
  });

  test('the in-app "Reduce motion" switch does the same, without the device setting', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'kf.settings',
        JSON.stringify({ state: { reduceMotion: true, theme: 'light' }, version: 0 }),
      );
    });
    await open(page, '/');
    await expectNothingMoving(page, '/');
    // The landing demo shows the finished picture, with no Pause button.
    await expect(page.getByRole('button', { name: 'Pause animation' })).toHaveCount(0);
    await logIn(page, EMPLOYER);
    for (const path of ['/employer/home', '/employer/alerts']) {
      await open(page, path);
      await expectNothingMoving(page, path);
    }
  });
});

test.describe('Smallest phones: every page fits 320 px', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'phone project only');

  for (const { who, password, paths } of PAGES) {
    test(`${who.split('@')[0]} pages`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await logIn(page, who, password);
      for (const path of paths) {
        await open(page, `${path}?theme=light`);
        await expectNoHorizontalScroll(page);
      }
      // One full accessibility check at this size, on the busiest page.
      await open(page, `${paths[0]}?theme=dark`);
      await expectNoSeriousA11yIssues(page);
    });
  }
});

test.describe('Keyboard only: the new design pieces', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'desktop project only');

  /** Presses Tab until `target` has the focus (fails after `max` presses). */
  async function tabTo(page: Page, target: ReturnType<Page['getByRole']>, max = 60) {
    for (let i = 0; i < max; i++) {
      if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
  }

  test('landing: the theme switch and the demo Pause button', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, '/');
    const theme = page.getByRole('button', { name: 'Dark mode' });
    await expect(theme).toHaveAttribute('aria-pressed', 'false');
    await tabTo(page, theme);
    await page.keyboard.press('Enter');
    await expect(theme).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const pause = page.getByRole('button', { name: 'Pause animation' });
    await tabTo(page, pause);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Play animation' })).toBeFocused();
  });

  test('alerts: move between the tabs with the arrow keys and open an alert', async ({ page }) => {
    await logIn(page, WORKER);
    await open(page, '/worker/alerts');
    // Tab reaches the open category; the arrow keys move to the next one and back.
    const tabs = page.getByRole('tab');
    const open0 = await tabs.evaluateAll((all) =>
      all.findIndex((el) => el.getAttribute('aria-selected') === 'true'),
    );
    const next = (open0 + 1) % 3;
    await tabTo(page, tabs.nth(open0));
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(next)).toBeFocused();
    await expect(tabs.nth(next)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(open0)).toHaveAttribute('aria-selected', 'true');

    const alert = page.getByRole('tabpanel').getByRole('listitem').getByRole('button').first();
    await tabTo(page, alert);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeFocused();
  });

  test('employer home: reach "Post a job" and the jobs table', async ({ page }) => {
    await logIn(page, EMPLOYER);
    await open(page, '/employer/home');
    const post = page.getByRole('link', { name: 'Post a job' }).first();
    await tabTo(page, post);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/employer\/jobs\/new/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('admin: the menu works from the keyboard', async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    await open(page, '/admin/overview');
    const spam = page.getByRole('navigation').getByRole('link', { name: /spam/i }).first();
    await tabTo(page, spam);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/admin\/spam/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('404: one Tab to "Take me home"', async ({ page }) => {
    await open(page, '/no-such-page?theme=light');
    const home = page.getByRole('link', { name: 'Take me home' });
    await tabTo(page, home);
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === '/');
  });
});
