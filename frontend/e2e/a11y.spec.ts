// Phase 8 accessibility pass (WCAG 2.2 AA, PRD section 6): keyboard only, and 200% zoom.
// axe itself runs on every page in the other test files.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, PASSWORD, expectNoHorizontalScroll, logIn } from './helpers';

test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 1000,
  'desktop project only (sets its own size)',
);

/** Presses Tab until `target` has the keyboard focus (fails after `max` presses). */
async function tabTo(page: Page, target: ReturnType<Page['getByRole']>, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('keyboard only: log in, skip to the content, see where the focus is, open a job', async ({
  page,
}) => {
  await page.goto('/login?theme=light');
  await tabTo(page, page.getByLabel('Email address'));
  await page.keyboard.type('worker2@example.com');
  await tabTo(page, page.getByLabel('Password', { exact: true }));
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/worker\/alerts/);

  // The first Tab shows "Skip to main content"; Enter moves past the menu.
  await page.goto('/worker/jobs?theme=light');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  // Every focused control shows a clear outline (WCAG 2.4.7 / 2.4.13).
  const firstJob = page.getByRole('main').getByRole('listitem').getByRole('link').first();
  await tabTo(page, firstJob);
  const outline = await firstJob.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Back to jobs' })).toBeVisible();
});

test('200% zoom with Large text: the main pages reflow without sideways scrolling', async ({
  page,
}) => {
  // 200% zoom on a 1280-pixel screen leaves 640 CSS pixels (WCAG 1.4.4 and 1.4.10).
  await page.setViewportSize({ width: 640, height: 450 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'kf.settings',
      JSON.stringify({ state: { textSize: 'large', theme: 'light' }, version: 0 }),
    );
  });
  await logIn(page, 'worker2@example.com');
  for (const path of ['/worker/alerts', '/worker/jobs', '/worker/messages', '/worker/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');
    await expectNoHorizontalScroll(page);
  }

  await page.context().clearCookies();
  await logIn(page, ADMIN.email, ADMIN.password);
  for (const path of ['/admin/overview', '/admin/delivery-logs', '/admin/announcements']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
