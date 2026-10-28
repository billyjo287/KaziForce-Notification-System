# Labelling guide for the hand-written evaluation set (`holdout-v1.csv`)

The evaluation set is **only for testing**. It is never used to train a model, choose features
or tune settings (Phase 9 must keep it apart, as the proposal's held-out test set, section
3.2.4). Messages were written by hand to look like real KaziForce traffic in English and
Kiswahili (including fake-job scams), then labelled with the rules below.

The labels follow the **definitions in the proposal and the PRD**, written down before the
rule-based classifier (`rules-v0`) was run on the set. They are a person's judgement of what the
recipient needs, not a copy of what the rules do. The `why` column records the reason for each
label. The researcher should review every label before the results are reported.

## Priority (asked: "how soon must the recipient act, or lose something?")

| Label | Meaning | Typical examples |
| --- | --- | --- |
| **urgent** | The recipient loses an opportunity or lets someone down unless they act **within a few hours** (today). | A job that closes within 3 hours or starts today/tonight; "you got the job, confirm by 6 pm"; "the shift starts in 30 minutes, are you coming?"; an interview today. |
| **medium** | Needs the recipient's attention **within a day or two**, but not right away. | A job closing within 48 hours; an application reviewed or turned down; an ordinary direct message; a new applicant for an employer; an admin request with a deadline days away. |
| **low** | **No action needed**, or nothing is lost by reading it in tomorrow's summary. | A job closing in more than 2 days; announcements, tips, maintenance notices; "thank you" messages. |

Job alerts use the time to the deadline (`deadline_minutes`) together with the text: "start
tonight" makes a job urgent even if applications close later.

## Spam (asked: "would a careful admin block this?")

**Spam = yes** when the message tries to take money or personal secrets, or is plainly not a
real job: registration, training or "processing" fees; "send money" or M-Pesa requests to
strangers; asking for a PIN or password; prizes and lotteries; guaranteed income; crypto
schemes; shortened links that hide where they go.

**Spam = no** for normal business that mentions money or links: wages paid by M-Pesa after the
work, a fare refund, a company website, a meeting place. These "hard negatives" check that
honest messages are not blocked (the PRD limits false positives to under 5%).

For spam rows the priority label is filled in for completeness but **not scored**: spam is
blocked and never delivered, so its priority does not matter. Priority is evaluated on the
rows that are not spam.

## Columns

| Column | Meaning |
| --- | --- |
| `id` | Row number |
| `language` | `en` or `sw` (Kiswahili, including common mixed Kiswahili-English) |
| `type`, `recipient_role`, `sender_role`, `created_at`, `deadline_minutes`, `text` | Exactly the `/predict` request fields (PRD section 5) |
| `priority` | `urgent`, `medium` or `low` (the label) |
| `is_spam` | `true` or `false` (the label) |
| `why` | The reason for the labels |
