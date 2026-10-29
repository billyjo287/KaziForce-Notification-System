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

  test('the alerts sort themselves: the scam is swept away, then "Sorted for you"', async ({
    page,
  }) => {
    const scripts = trackScripts(page);
    await page.goto('/');
    const demo = page.locator('.kf-hero-demo');
    // Screen readers get one sentence describing the picture.
    await expect(demo.locator('figcaption')).toContainText('a scam message asking for money');
    const scam = demo.getByText('Pay KES 5,000 to secure your Dubai job!');
    // The whole show takes about 4 seconds, once.
    await expect
      .poll(() => scam.evaluate((el) => getComputedStyle(el.parentElement!).opacity), {
        timeout: 8000,
      })
      .toBe('0');
    await expect
      .poll(() => demo.getByText('Sorted for you').evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await expect(demo.getByText('3 spam messages blocked today.', { exact: false })).toBeVisible();
    // The old 3D picture is gone for good: no Three.js download.
    expect(scripts.filter((url) => /three|heroScene/i.test(url))).toEqual([]);
  });

  test('with reduced motion the finished picture shows at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const demo = page.locator('.kf-hero-demo');
    await expect(demo.getByText('Sorted for you')).toBeVisible();
    expect(
      await demo
        .getByText('Pay KES 5,000 to secure your Dubai job!')
        .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
    ).toBe('0');
  });

  test('sections fade in on scroll and all end up visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Scroll down in steps, like a person reading, all the way to the bottom.
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(120);
      const atBottom = await page.evaluate(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      );
      if (atBottom) break;
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Pata kazi. Usikose kilicho muhimu.',
    );
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('sw');
  });
});

test('"Add to home screen": the manifest and its icons load', async ({ page, request }) => {
  await page.goto('/login');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({ name: 'KaziForce', start_url: '/', display: 'standalone' });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of [...manifest.icons, { src: '/brand/kaziforce-apple-touch-180.png' }]) {
    const image = await request.get(icon.src);
    expect(image.ok(), icon.src).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
  }
});
