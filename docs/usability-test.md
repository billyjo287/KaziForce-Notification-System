# Usability test kit (BT-25)

A short, ready-to-run test with real people, to show the 18-to-80 rule (CLAUDE.md section 2)
with evidence and not only with automated checks. It takes **about 20 minutes per person**.
The results go into Chapter 5 (Testing, usability).

## 1. Who to test with

**5 people** is enough to find most problems (Nielsen Norman Group, "Why you only need to test
with 5 users").

| # | Profile | Why |
| --- | --- | --- |
| P1 | Aged 55 or older, uses WhatsApp daily, not "techy" | The golden rule |
| P2 | Aged 55 or older, or with weaker eyesight | Text size, contrast, tap targets |
| P3 | Prefers Kiswahili | The Kiswahili wording |
| P4 | Aged 18–30, looking for casual work | The main worker group |
| P5 | Runs a small business, or hires helpers | The employer side |

- Use **their own phone** if they agree (a mid-range Android is ideal), on the live site
  `https://kaziforce-notification-system.vercel.app`.
- Have mobile data or Wi-Fi ready.
- Nobody should have used KaziForce before.

## 2. Before you start (say this, in English or Kiswahili)

> "Thank you for helping. I am testing the website, not you: if something is hard, that is the
> website's fault, and it helps me fix it. Please think aloud as you go. I will not help unless you
> are completely stuck. It takes about 20 minutes. I will write notes and time each task, but I
> will not record your face or your voice. Your name will not appear in my report. You can stop
> at any time. Is that okay?"

> "Asante kwa kunisaidia. Ninajaribu tovuti, si wewe: kitu kikiwa kigumu, ni kosa la tovuti, na
> hiyo inanisaidia kuirekebisha. Tafadhali sema unachofikiri unapoendelea. Sitakusaidia isipokuwa
> umekwama kabisa. Inachukua kama dakika 20. Nitaandika maelezo na kupima muda wa kila kazi,
> lakini sitarekodi uso wala sauti yako. Jina lako halitaonekana kwenye ripoti yangu. Unaweza
> kuacha wakati wowote. Je, ni sawa?"

Write down only: P-number, age group (18–30, 31–54, 55+), language used, phone model. **No
names or phone numbers** in your notes (Data Protection Act).

**Set up before each session:**
- an employer account (yours) with one **urgent** job posted for the participant's area;
- for P5, a test worker account that has applied to one of your jobs.

## 3. Tasks (give one at a time, in their words, never the button names)

| # | Task (say it like this) | Success means | Side |
| --- | --- | --- | --- |
| T1 | "Make an account to find work." | Account made, reaches Home | Worker |
| T2 | "There is an urgent job near you. Find it and apply." | Applied to the urgent job | Worker |
| T3 | "You don't want messages at night. Make the app stay quiet from 10 at night to 6 in the morning." | Quiet hours on, 22:00–06:00, saved | Worker |
| T4 | "One of your alerts is not useful to you. Tell the app." | "Not important to me" on any alert | Worker |
| T5 | "Read the app in Kiswahili (or English)." | Language changed | Worker |
| T6 (P5 only) | "Post a job for a cleaner tomorrow morning, then accept the person who applied for your other job." | Job posted, applicant accepted | Employer |

For each task, record:
- **Done?** ✓ (alone), ~ (with a hint), ✗ (gave up or wrong);
- **Time** in seconds, from the end of your sentence to success;
- **Errors**: wrong taps or wrong pages;
- **What they said**: short quotes, especially confusion.

## 4. After the tasks: System Usability Scale (SUS)

Read each statement aloud, or let them read it. They answer **1 = strongly disagree … 5 =
strongly agree**. SUS is a standard, free questionnaire (Brooke, 1996). The Kiswahili wording is
our own translation (not formally validated); say so in the thesis.

| # | English | Kiswahili |
| --- | --- | --- |
| 1 | I think that I would like to use this website frequently. | Nadhani ningependa kutumia tovuti hii mara kwa mara. |
| 2 | I found the website unnecessarily complex. | Niliona tovuti hii ni ngumu bila sababu. |
| 3 | I thought the website was easy to use. | Niliona tovuti hii ni rahisi kutumia. |
| 4 | I think that I would need the support of a technical person to be able to use this website. | Nadhani ningehitaji msaada wa mtaalamu ili kutumia tovuti hii. |
| 5 | I found the various functions in this website were well integrated. | Niliona sehemu mbalimbali za tovuti hii zinafanya kazi pamoja vizuri. |
| 6 | I thought there was too much inconsistency in this website. | Niliona tovuti hii haina mpangilio unaofanana. |
| 7 | I would imagine that most people would learn to use this website very quickly. | Nadhani watu wengi wangejifunza kutumia tovuti hii haraka sana. |
| 8 | I found the website very cumbersome to use. | Niliona tovuti hii inasumbua sana kutumia. |
| 9 | I felt very confident using the website. | Nilijiamini sana nilipotumia tovuti hii. |
| 10 | I needed to learn a lot of things before I could get going with this website. | Nilihitaji kujifunza mambo mengi kabla ya kuanza kutumia tovuti hii. |

**Scoring** (per person):
1. For odd items (1, 3, 5, 7, 9), take the answer minus 1.
2. For even items (2, 4, 6, 8, 10), take 5 minus the answer.
3. Add the ten numbers and multiply by 2.5. The result is a score from 0 to 100.

**Reading it:** about 68 is average; **80 or more** is good. Report each person's score and the
mean.

Finish with two open questions:
- "What was the hardest part?"
- "What would you change first?"

## 5. Results table (copy into Chapter 5)

| Task | P1 | P2 | P3 | P4 | P5 | Success rate | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 Sign up | | | | | | /5 | s |
| T2 Apply to urgent job | | | | | | /5 | s |
| T3 Quiet hours | | | | | | /5 | s |
| T4 Not important | | | | | | /5 | s |
| T5 Language | | | | | | /5 | s |
| T6 Employer | — | — | — | — | | /1 | s |
| **SUS** | | | | | | mean: | |

**Problems found:**

| # | Problem (what happened) | Who | Severity (blocker / major / minor) | Fix |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## 6. Targets (from the PRD and the golden rule)

- Every task done alone (✓) by at least 4 of 5 people, including both people aged 55 or older.
- Mean SUS of 75 or more.
- No "blocker" left unfixed before the defence.

If a target is missed, that is a finding, not a failure. Report it honestly with the fix you made
or plan to make.
