// The main Phase 2 journey, at 360 px (phone) and 1440 px (desktop), with axe on every screen:
// an employer posts a job, a worker applies, the employer accepts (and tries Undo).
import { expect, test, type Browser, type TestInfo } from '@playwright/test';
import {
  PASSWORD,
  choose,
  expectNoHorizontalScroll,
  expectNoSeriousA11yIssues,
  logIn,
} from './helpers';

/** A separate browser "person" with this test's screen size. */
async function person(browser: Browser, testInfo: TestInfo) {
  const context = await browser.newContext({
    viewport: testInfo.project.use.viewport,
    hasTouch: testInfo.project.use.hasTouch,
    baseURL: 'http://localhost:4173',
  });
  return context.newPage();
}

test('employer posts a job → worker applies → employer accepts', async ({ browser }, testInfo) => {
  const title = `Parcel sorters ${testInfo.project.name} ${Date.now()}`;

  // ---------- Employer posts a job ----------
  const employer = await person(browser, testInfo);
  await logIn(employer, 'employer1@example.com');
  await employer.getByRole('link', { name: 'My jobs' }).first().click();
  await employer.getByRole('link', { name: 'Post a job' }).first().click();
  await expect(employer.getByRole('heading', { level: 1, name: 'Post a job' })).toBeVisible();
  await expectNoSeriousA11yIssues(employer);

  await employer.getByLabel('Job title').fill(title);
  await employer
    .getByLabel('What will the worker do?')
    .fill('Sort parcels at our depot from 6pm to 10pm.');
  await choose(employer, 'Where is the job?', 'Westlands');
  await choose(employer, 'Main skill needed', 'Delivery');
  await employer.getByLabel('Pay').fill('KSh 1,000');
  await employer.getByRole('radio', { name: /^No$/ }).check();
  await employer.getByRole('button', { name: 'Post the job' }).click();

  await expect(employer).toHaveURL(/\/employer\/jobs\/[0-9a-f-]{36}$/);
  await expect(employer.getByText('Your job is posted.', { exact: true })).toBeVisible();
  await expect(employer.getByRole('heading', { name: /No applicants yet/ })).toBeVisible();
  await expectNoSeriousA11yIssues(employer);
  await expectNoHorizontalScroll(employer);

  // ---------- Worker finds it and applies ----------
  const worker = await person(browser, testInfo);
  await logIn(worker, 'worker2@example.com'); // Brian Kiprono
  await worker.getByRole('link', { name: 'Jobs' }).first().click();
  await choose(worker, 'Place', 'Westlands');
  await worker.getByRole('link', { name: title }).click();
  await expect(worker.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expectNoSeriousA11yIssues(worker);

  await worker.getByLabel('Short note to the employer').fill('I can start at 6pm.');
  await worker.getByRole('button', { name: 'Apply now' }).click();
  await expect(
    worker.getByText('Application sent. We will tell you when the employer replies.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(worker.getByText('Sent, waiting')).toBeVisible();
  await expectNoSeriousA11yIssues(worker);

  // ---------- Employer accepts (Undo, then accept for real) ----------
  await employer.reload();
  const applicant = employer.getByRole('article').filter({ hasText: 'Brian Kiprono' });
  await expect(applicant.getByText('I can start at 6pm.')).toBeVisible();
  await expect(applicant.getByText('Seen')).toBeVisible();
  await expectNoSeriousA11yIssues(employer);

  await applicant.getByRole('button', { name: 'Accept' }).click();
  await expect(employer.getByText('Brian Kiprono accepted.', { exact: true })).toBeVisible();
  await expect(applicant.getByText('Accepted')).toBeVisible();
  await employer.getByRole('button', { name: 'Undo' }).click();
  await expect(employer.getByText('Change undone.', { exact: true })).toBeVisible();
  await expect(applicant.getByRole('button', { name: 'Accept' })).toBeVisible();

  await applicant.getByRole('button', { name: 'Accept' }).click();
  await expect(applicant.getByText('Accepted')).toBeVisible();
  await expectNoHorizontalScroll(employer);

  // ---------- Worker sees the good news and can message the employer ----------
  await worker.goto('/worker/jobs?tab=applications');
  const mine = worker.getByRole('article').filter({ hasText: title });
  await expect(mine.getByText('You got the job')).toBeVisible();
  await expectNoSeriousA11yIssues(worker);

  await worker.getByRole('link', { name: title }).click();
  await worker.getByRole('link', { name: 'Message the employer' }).click();
  await worker.getByLabel('Your message').fill('Thank you! I will be there at 6pm.');
  await worker.getByRole('button', { name: 'Send' }).click();
  await expect(worker.getByText('Thank you! I will be there at 6pm.')).toBeVisible();
  await expectNoSeriousA11yIssues(worker);

  await employer.context().close();
  await worker.context().close();
});

test('a new worker signs up and completes onboarding', async ({ page }, testInfo) => {
  const email = `new.${testInfo.project.name}.${Date.now()}@example.com`;
  const phone = `07${String(Date.now()).slice(-8)}`;

  await page.goto('/register');
  await page.getByRole('radio', { name: /I'm looking for work/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your full name').fill('Test Mfanyakazi');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Step 2: phone, consent, SMS code (mock mode returns the code to tests).
  await expect(page.getByRole('heading', { level: 1, name: 'Your phone number' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('checkbox', { name: /I agree to receive/ }).check();
  const codeResponse = page.waitForResponse((r) => r.url().endsWith('/api/me/phone'));
  await page.getByRole('button', { name: 'Send me a code' }).click();
  const { mockCode } = await (await codeResponse).json();
  await page.getByLabel('6-digit code').fill(mockCode);
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'How should we reach you?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Yes' }).check();
  await page.getByRole('radio', { name: /SMS/ }).check();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: preset.
  await expect(
    page.getByRole('heading', { level: 1, name: 'How much should we tell you?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: /Only urgent things/ }).check();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page).toHaveURL(/\/worker\/alerts$/);
  await expect(
    page.getByRole('heading', { name: /Nothing under "Urgent" right now/ }),
  ).toBeVisible();
});

test('a suspended user cannot log in and is told why', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'one run is enough');
  const admin = await person(browser, testInfo);
  await logIn(admin, 'admin@example.com');
  await admin.getByLabel('Search').fill('worker6@example.com');
  await admin.getByRole('button', { name: 'Search' }).click();
  await admin.getByRole('link', { name: 'Joseph Mutua' }).click();
  await admin.getByRole('button', { name: 'Suspend this account' }).click();
  await admin.getByLabel('Reason').fill('Test: asked workers for money');
  await admin.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(admin.getByText('Account suspended.', { exact: true })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email address').fill('worker6@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('This account has been suspended.');

  await admin.getByRole('button', { name: 'Reactivate this account' }).click();
  await expect(admin.getByText('Account reactivated.', { exact: true })).toBeVisible();
  await admin.context().close();
});
