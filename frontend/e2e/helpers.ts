import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Password123!';
export const ADMIN = { email: 'admin@example.com', password: PASSWORD };

/** Runs axe (WCAG 2.2 A + AA rules) and fails on any serious or critical problem. */
export async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(serious, 'serious accessibility problems').toEqual([]);
}

/** The page must never scroll sideways (PRD NFR-4). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** Collects the URLs of every JavaScript file the page downloads. */
export function trackScripts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.push(request.url());
  });
  return urls;
}

/** Logs in through the real log-in page and waits for the user's home page. */
export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/(worker|employer|admin)\//);
}

/** Picks an option in one of our (Radix) dropdowns by its label. */
export async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
