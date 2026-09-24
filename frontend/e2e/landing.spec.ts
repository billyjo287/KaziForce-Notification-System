import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousA11yIssues, trackScripts } from './helpers';

test.describe('Landing page', () => {
  test('passes axe (light and dark) and fits the screen', async ({ page }) => {
    // Reduced motion: every section is visible at once, so axe can check all of it.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const theme of ['light', 'dark']) {
      await page.goto(`/?theme=${theme}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousA11yIssues(page);
      await expectNoHorizontalScroll(page);
    }
  });

  test('with reduced motion: still picture, and Three.js is never downloaded', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-hero-mode]')).toHaveAttribute('data-hero-mode', 'static');
    expect(scripts.filter((url) => /heroScene|three/i.test(url))).toEqual([]);
  });

  test('with "Data Saver" on: still picture, Three.js never downloaded', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', { value: { saveData: true } }),
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-hero-mode]')).toHaveAttribute('data-hero-mode', 'static');
    expect(scripts.filter((url) => /heroScene/i.test(url))).toEqual([]);
  });

  test('the 3D hero is only downloaded after the page has shown', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const mode = await page.locator('[data-hero-mode]').getAttribute('data-hero-mode');
    // Headless browsers may have no WebGL: then the still picture is the correct result.
    if (mode === '3d') {
      await expect(page.locator('[data-hero-mode] canvas')).toBeVisible();
      expect(scripts.some((url) => /heroScene/.test(url))).toBe(true);
    } else {
      expect(scripts.some((url) => /heroScene/.test(url))).toBe(false);
    }
  });

  test('sections fade in on scroll and all end up visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Scroll down in steps, like a person reading.
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(900);
    const hidden = await page.$$eval(
      '[data-reveal]',
      (els) => els.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
    );
    expect(hidden).toBe(0);
  });

  test('language switch changes the page to Kiswahili', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Kiswahili' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Usikose kazi inayokufaa');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('sw');
  });
});
