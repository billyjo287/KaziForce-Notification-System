// Phase 6: the notification settings (PRD FR-5) in a real browser, on a phone and a desktop.
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousA11yIssues, logIn } from './helpers';

const WHO = 'worker4@example.com'; // Joseph: no other browser test changes his settings

test.describe('Notification settings', () => {
  test('channel order: move, "Saved", Undo; still the same after a reload', async ({ page }) => {
    await logIn(page, WHO);
    await page.goto('/worker/settings?theme=light');
    const list = page.getByRole('list', { name: 'Where urgent alerts go first' });
    await expect(list.getByRole('listitem').first()).toBeVisible();
    const before = await list.getByRole('listitem').allTextContents();

    await list.getByRole('listitem').first().getByRole('button', { name: /down$/ }).click();
    await expect(page.getByText(/^Saved: .+ is now choice 2$/).first()).toBeVisible();
    await expect(list.getByRole('listitem').nth(1)).toHaveText(before[0]!.replace(/^1/, '2'));

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Change undone').first()).toBeVisible();
    await page.reload();
    await expect(list.getByRole('listitem')).toHaveText(before);
  });

  test('Customise: quiet hours save on their own; passes axe and fits the screen', async ({
    page,
  }) => {
    await logIn(page, WHO);
    await page.goto('/worker/settings?theme=light');
    await page.getByRole('button', { name: 'Customise' }).click();
    const quiet = page.getByRole('switch', { name: 'Quiet hours' });
    if (!(await quiet.isChecked())) await quiet.click();

    const until = page.getByLabel('Until');
    const old = await until.inputValue();
    await until.fill(old === '06:30' ? '07:00' : '06:30');
    await until.blur();
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

    await expectNoSeriousA11yIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('the daily summary email\'s "Manage your notification preferences" link lands on the section', async ({
    page,
  }) => {
    await logIn(page, WHO);
    await page.goto('/worker/settings#notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeInViewport();
  });

  test('Delete my account: asks for the password first; cancel changes nothing', async ({
    page,
  }) => {
    await logIn(page, WHO);
    await page.goto('/worker/settings?theme=light');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
    await expect(dialog.getByLabel('Your password')).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();
  });
});
