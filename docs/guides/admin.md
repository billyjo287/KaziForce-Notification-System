# KaziForce for admins: a short guide

Admins keep KaziForce safe and check that alerts reach people. Every admin action (suspending
an account, removing a job, a spam decision, a download) is recorded in the **Audit log**.

The admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the database is set
up (see [DEPLOYMENT.md](../DEPLOYMENT.md)). Change the password after the first log-in.

## Every day: Overview and Spam review

**Overview** (your home page) updates itself every 30 seconds:

- **Big numbers for today:** alerts created, spam blocked, failed deliveries (last 24 hours),
  alerts waiting for spam review, and alerts held because of someone's quiet hours. A red
  outline means it needs a look; tap the link under it.
- **Messages that got through:** one bar per channel (In the app, WhatsApp, SMS, Email), for
  the last 24 hours or the last 7 days. If a message failed and then got through on a retry,
  it counts as a success. A falling WhatsApp or SMS bar usually means a problem with Twilio or
  Africa's Talking (check their dashboards and the errors under **Latest failed deliveries**).
- **Waiting in the queues:** "Waiting now" should be close to 0. "Planned for later" is normal
  (retries, urgent safety-net checks, quiet hours). "Gave up" means a job failed every try.

**Spam review** lists alerts we stopped because they looked like spam or fraud. Nobody has seen
them. For each one:

- **Yes, it is spam**: it stays blocked.
- **Not spam: deliver it**: choose how important it is (Urgent, Important or For later), then
  **Deliver now**. It is sent at once.

Both answers teach the future model, so please decide even when it is obvious.

## Users and jobs

- **Users:** search by name, email or phone. Open a person to see their details and history.
  **Suspend this account** needs a short reason; the person cannot log in and is told why.
  **Reactivate** undoes it.
- **Jobs:** **Remove** a job that breaks the rules. The reason is shown to the employer.

## Delivery logs

Every try to send an alert, newest first. Filter by channel, result (Sent, Delivered, Failed,
Still trying) and dates. Each row shows the error from the provider if it failed, and whether
it was the **Safety net** (the urgent alert sent to the person's next channel).

If an alert has the wrong priority, tap **Correct priority**. This does not resend it; it is
saved to train the future model.

## Announcements

Choose **Everyone**, **Workers only** or **Employers only**, write a short title and message,
and check the preview. We tell you how many people it will reach, and ask once before sending:
an announcement cannot be taken back. Announcements usually arrive as "For later".

## Model versions and training data

**Model versions** shows the classifier in use (today the rule-based "rules-v0"), how many
alerts it classified, how often the backup rules had to answer because the ML service was slow
or down, and how many an admin corrected.

**Download training data (CSV)** gives one row per alert for training the future models.
Names, phone numbers and emails are removed, and people get random codes that change with every
download. Store the file safely anyway and delete it when you no longer need it.
