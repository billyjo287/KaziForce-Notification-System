// Phase 7: the admin pages and the employer's delivery view, in a real browser (phone and desktop).
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  ADMIN,
  choose,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  logIn,
} from './helpers';

const asAdmin = (page: Parameters<typeof logIn>[0]) => logIn(page, ADMIN.email, ADMIN.password);

test.describe('Admin', () => {
  test('lands on the overview: big numbers, channel meters and queues; passes axe', async ({
    page,
  }) => {
    await asAdmin(page);
    await expect(page).toHaveURL(/\/admin\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Alerts created today')).toBeVisible();
    await expect(page.getByRole('meter', { name: /^In the app: .+ got through$/ })).toBeVisible();
    await expect(page.getByText('New alerts being sorted').filter({ visible: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('spam review: the seeded scam can be released with a priority, or the list is empty', async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto('/admin/spam?theme=light');
    await expect(page.getByRole('heading', { level: 1, name: 'Spam review' })).toBeVisible();
    await expect(
      page.getByText('Nothing to review').or(page.getByText(/^Spam score: /).first()),
    ).toBeVisible();
    await expectNoSeriousA11yIssues(page);

    const release = page.getByRole('button', { name: 'Not spam: deliver it' }).first();
    if (await release.isVisible()) {
      await release.click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('radio', { name: /Important/ }).check();
      await expectNoSeriousA11yIssues(page);
      await dialog.getByRole('button', { name: 'Deliver now' }).click();
      await expect(page.getByText(/^Delivered to /).first()).toBeVisible();
    }
  });

  test('delivery logs: filters go into the address', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/delivery-logs?theme=light');
    await choose(page, 'Channel', 'In the app');
    await expect(page).toHaveURL(/channel=in_app/);
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/channel=/);
  });

  test('announcements: reach, preview, one confirmation, sent', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/announcements?theme=light');
    await page.getByRole('radio', { name: 'Employers only' }).check();
    await expect(page.getByRole('button', { name: /^Send to \d+ (person|people)$/ })).toBeEnabled();
    await page.getByLabel('Title').fill('Holiday hours');
    await page.getByLabel('Message').fill('The help desk is closed on Monday.');
    await expect(page.getByRole('region', { name: 'Preview: how it will look' })).toContainText(
      'Holiday hours',
    );
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: /^Send to / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send it' }).click();
    await expect(page.getByText('Sent. It is on its way.').first()).toBeVisible();
  });

  test('model versions and the anonymised training data download', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/models?theme=light');
    const rules = page.getByRole('article', { name: 'rules-v0' });
    await expect(rules.getByText('In use', { exact: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download training data (CSV)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^kaziforce-training-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('notification_token,recipient_token');
    // No names, emails or phone numbers of the sample people.
    for (const secret of ['@example.com', 'Wanjiru', 'Mwangi', '+2547']) {
      expect(csv).not.toContain(secret);
    }
  });
});

test.describe('Employer', () => {
  test('a job page shows who got the job alert and who saw it', async ({ page }) => {
    await logIn(page, 'employer1@example.com');
    await page.goto('/employer/jobs?theme=light');
    await page.getByRole('main').getByRole('listitem').getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Who got your job alert' })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });
});
