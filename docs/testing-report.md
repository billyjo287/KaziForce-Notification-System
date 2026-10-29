# KaziForce: how the system was tested

**Project:** Intelligent Multi-Channel Notification Prioritisation for Workforce Marketplaces (KaziForce)
**Student:** Billy John Igiraneza (167022) · **Supervisor:** Dr Vincent Ochango
**Results below were produced on:** 22–23 October 2026

This report explains, step by step, how the system was tested: what was checked, with which
tools, on which computer, how to repeat every test, and what the results were. It is written so
that someone who did not build the system can follow it and run the tests again.

---

## 1. The idea in plain words

The system was tested at four levels, from small to large. Think of building a car:

| Level | Car example | In KaziForce | Tool |
| --- | --- | --- | --- |
| **Unit tests** | Test one part on its own (a brake pad) | One function, e.g. "is this message spam?", "which channel comes next?" | Vitest, pytest |
| **Integration tests** | Test parts working together (brakes + wheel) | The API with the real database and Redis, e.g. "posting a job creates alerts" | Vitest + Supertest |
| **System (end-to-end) tests** | Drive the whole car on a road | A robot opens the real website in Chrome, logs in, clicks buttons and checks what appears, at phone and desktop sizes | Playwright |
| **Performance and recovery tests** | Drive at top speed, then cut the engine for a moment | 1,000 alerts a minute for 10 minutes; Redis and the database restarted in the middle | k6 |

On top of these:

- **Accessibility checks:** a tool called axe checks every page for problems that would stop
  older users or people using screen readers (contrast, labels, headings).
- **Classifier evaluation:** the spam and priority classifier is scored on 177 hand-written
  messages it has never seen, against the targets in the proposal.
- **Security checks:** known problems in the packages used, and a scan for passwords or keys
  committed by mistake.

All of these tests are **automated**. They are programs that check the system and print
"passed" or "failed", so they can be repeated at any time and give the same answer. A test only
passes if the system's actual behaviour matches the expected result written in the test.

---

## 2. Where the tests ran

| Item | Details |
| --- | --- |
| Computer | Windows 11 Pro laptop, Intel Core i7-9850H (6 cores), 32 GB RAM, 512 GB SSD |
| Database and queues | PostgreSQL 17 and Redis 8, running in Docker Desktop 29.7 |
| Runtimes | Node.js 22, Python 3.10 on the laptop (3.12 in Docker and GitHub Actions) |
| Browser | Google Chrome (Chromium engine), driven by Playwright 1.63. Firefox and WebKit (Safari's engine) run in GitHub Actions |
| Messages | **Mock mode**: WhatsApp, SMS and email are recorded but not really sent, so tests cost nothing and never message real people |
| Test data | Made-up sample people and jobs (seed script). No real person's data is used |

Each kind of test uses **its own copy of the database**: `kaziforce_test` for backend tests and
`kaziforce_e2e` for browser tests. Tests never touch the data used for demonstrations.

The same tests also run **automatically on GitHub** (GitHub Actions) every time code is pushed.
This is called continuous integration (CI): a change that breaks something is caught at once.

---

## 3. Results summary

| Test suite | What it covers | Tests | Result | Time |
| --- | --- | ---: | --- | --- |
| Backend unit + integration | API, notification pipeline, classifier fallback, channels, escalation, quiet hours, daily summary, retention, security, admin tools | **204** | All passed | ≈ 4 min |
| Website components | Screens and buttons on their own (log-in, alerts, settings, admin pages) | **93** | All passed | ≈ 1 min |
| ML service | `/predict` answers, spam and priority rules, evaluation maths | **66** | All passed | ≈ 2 s |
| Browser (end to end), Chrome | Whole tasks at 360 px (phone), 768 px (tablet), 1024 px (laptop) and 1440 px (desktop), with accessibility checks on every page | **120** | All passed | ≈ 11 min |
| Browser smoke test, Firefox + WebKit | Landing, log-in, settings and a live alert in two other browser engines | 4 | Runs in GitHub Actions | ≈ 1 min |
| Load test | 1,000 alerts a minute for 10 minutes | 10,000 alerts | All delivered | 10 min |
| Recovery test | Redis and PostgreSQL restarted during the load test | 9,975 alerts | None lost | 10 min |
| Classifier evaluation | 177 hand-written messages (60 in Kiswahili, 30 scams) | 177 | Scored (section 7) | ≈ 2 s |
| Security checks | Package problems (npm audit, pip-audit); secret scan (gitleaks) | — | Clean | ≈ 1 min |

**Total automated tests: 465**, plus the load and recovery runs.

---

## 4. How to run every test yourself (step by step)

### 4.1 Before the first time (once per computer)

1. Install **Node.js 22**, **Docker Desktop**, **Python 3.11 or newer** and **Git**.
2. Open the project folder in a terminal (for example in VS Code: *Terminal › New Terminal*).
3. Run `npm run setup`. It installs everything, creates the settings files and the database,
   and loads the sample data.
4. Start **Docker Desktop** and wait until it says it is running. The tests need the database
   and Redis that run inside Docker.

### 4.2 Backend tests (API, pipeline, channels): 204 tests

```
npm run test -w backend
```

**What you see:** each test file is listed with a tick, then a summary like this:

```
 Test Files  15 passed (15)
      Tests  204 passed (204)
```

**How it works:** before the tests start, a fresh test database is created and filled with the
sample data. Then each test sends real requests to the API (as the website would) and checks
the answer and what was saved in the database. Some tests also start the notification worker
and a stand-in ML service, and wait for the alert to arrive live, exactly as a worker's browser
would.

### 4.3 Website component tests: 93 tests

```
npm run test -w frontend
```

**What you see:** `Test Files 15 passed (15)`, `Tests 93 passed (93)`.

**How it works:** each screen is drawn in a simulated browser with a fake server, so the screen
can be tested on its own. Example: "after *Not important to me*, a card asks why; pressing *Send*
without a choice asks for one and sends nothing".

### 4.4 ML service tests: 66 tests

```
cd ml-service
.venv\Scripts\python -m pytest
```

(On macOS or Linux: `.venv/bin/python -m pytest`.) **What you see:** `66 passed in 2s`.

**How it works:** 33 example messages, from real-looking job alerts to scams in English and
Kiswahili, are sent to `/predict`. Each answer must match the expected priority, spam score and
reasons exactly. The **same 33 examples** are also checked against the backend's copy of the
rules (used when the ML service is too slow), so both always give the same answer.

### 4.5 Browser tests (end to end): 120 tests

```
cd frontend
npx playwright install chromium firefox webkit
npm run test:e2e
```

The install line downloads the test browsers and is only needed once. To use the Google Chrome
already on the computer instead, first run `$env:PW_CHANNEL="chrome"` in PowerShell.

**What you see:** a numbered list of tests with ✓ or ✘, then `120 passed`. The tests marked
*skipped* are expected: they are the optional screenshot tests, and tests meant for one screen
size only.

**How it works:** the test starts its own copy of the backend (port 4001) and of the website
(port 4173). Then a robot uses the website as a person would. For example:

- logs in as an employer, posts a job, and checks that the worker sees the alert **live**;
- applies, accepts, and checks the messages;
- turns the internet off and on and checks that missed alerts appear;
- runs **axe** on every page, in light and dark mode and in English and Kiswahili, and fails if
  there is any serious accessibility problem;
- checks that no page scrolls sideways on a 320-pixel phone.

If a test fails, a report with a screenshot and a recording opens: `npx playwright show-report`.

### 4.6 Classifier evaluation (177 messages)

```
cd ml-service
.venv\Scripts\python -m training.evaluate_baseline
```

**What you see:**

```
rules-v1 on 177 hand-written messages:
  priority weighted F1 63.5% (target 85%)
  spam accuracy 89.3% (target 95%)
  honest messages blocked 0.0% (target under 5%)
```

The full report, with tables and every wrong answer, is saved in
`ml-service/evaluation/results/rules-v1/report.md`.

### 4.7 Load and recovery tests

These need [k6](https://k6.io) installed (a free load-testing tool).

```
docker compose up -d
npm run build -w backend
.\loadtest\run.ps1             # load test: 1,000 alerts a minute for 10 minutes
.\loadtest\run.ps1 -Chaos      # the same, restarting Redis and the database in the middle
```

The results are written to `loadtest/data/report.txt`. Details: `docs/performance.md`.

### 4.8 Security checks

```
npm audit --omit=dev --audit-level=high
```

The Python packages and the secret scan run in GitHub Actions (job **Security checks**).

### 4.9 Everything at once, automatically

Push the code to GitHub. The **Actions** tab shows four jobs (Frontend, Backend, ML service,
Security checks), each with a green tick when every test passes.

---

## 5. What the tests check, by requirement

Requirements are numbered as in the proposal (Chapter 4): FR = functional requirement,
NFR = non-functional requirement.

| Requirement | What is tested (examples) | Where |
| --- | --- | --- |
| FR-1 Log-in and accounts | Wrong password gets a plain answer; too many tries are blocked; suspended users are stopped at once; stolen refresh tokens end all sessions; log-in by email or phone; the code by SMS or email after the password on a new device (right, wrong, five wrong tries, used twice, 30-second wait, "remember this device" until "log out of all devices"); sign-up account created only after the emailed code | `backend/tests/auth.test.ts`, `accountCodes.test.ts`, `frontend/src/features/auth/auth.test.tsx`, `e2e/auth.spec.ts`, `roles-and-suspension.test.ts` |
| FR-2 Notifications created | Job posts reach workers in the same place or with the same skill; application updates and messages notify the right person; incomplete notifications are refused | `pipeline.test.ts`, `marketplace.test.ts` |
| FR-3 Priority and spam | Scam messages are blocked and never delivered; **scam job posts are held** until an admin decides; ML service too slow → the same rules run inside the backend | `pipeline.test.ts`, `classify.test.ts`, `ml-service/tests` |
| FR-4 Channels and safety net | WhatsApp fails 3 times → SMS; not opened in time → next channel; deadline in 8 minutes → window of 4 minutes; STOP turns a channel off | `delivery.test.ts`, `channels.test.ts` |
| FR-5 Preferences | Presets, channel order, quiet hours (only urgent gets through) | `preferences.test.ts`, `quietHours.test.ts`, `e2e/settings.spec.ts` |
| FR-6 Live in-app alerts | Alerts appear without refreshing; a connection without a login is refused; catch-up after going offline; **the optional "why?" after *Not important to me*** | `pipeline.test.ts`, `e2e/live.spec.ts`, `AlertsPage.test.tsx` |
| FR-7 Delivery logs | One row per try; admin filters | `delivery.test.ts`, `e2e/admin.spec.ts` |
| FR-8 Daily summary | Only "for later" alerts of the last 24 hours, grouped; nothing sent when empty; once a day at 08:00 Nairobi time | `dailySummary.test.ts` |
| NFR-1 Speed | 1,000 alerts a minute; urgent alert at the provider within 2 s; page appears in about 1.2 s on slow 3G | load test, `e2e/prerender.spec.ts` |
| NFR-2 Security and privacy | Example secrets refused in production; demo codes refused in production; codes and remembered devices kept only as hashes; signed webhooks; anonymised training export | `security.test.ts`, `accountCodes.test.ts`, `admin.test.ts` |
| NFR-3 Recovery | Redis down → `/health` says so; Redis and database restarted under load → nothing lost | `health.test.ts`, recovery test |
| NFR-4 Accessibility | axe on every page; keyboard only; 200% zoom; 320 px phones; tablets and laptops | `e2e/*.spec.ts` |

---

## 6. Test cases: expected result against actual result

Each row is an automated test that passes. The scenario and the expected result are written in
the test before it runs; the test fails if the actual result is different.

| ID | Scenario | Expected result | Actual result |
| --- | --- | --- | --- |
| TC-01 | A job closing within the hour is posted | Classified Urgent, delivered in the app and pushed live | As expected ✔ |
| TC-02 | Message "Send KSh 500 registration fee" | Blocked, never delivered, waits for admin review with reasons | As expected ✔ |
| TC-03 | ML service takes longer than 500 ms | The backend's own rules decide; nothing is lost | As expected ✔ |
| TC-04 | Notification with no recipient, no text, or over 1,000 characters | Refused before saving | As expected ✔ |
| TC-05 | WhatsApp fails three times | SMS sent; one delivery-log row per try | As expected ✔ |
| TC-06 | Permanent failure (invalid number) | Next channel at once, no retries | As expected ✔ |
| TC-07 | Urgent alert not opened in time | Sent on the next channel | As expected ✔ |
| TC-08 | Job closes in 8 minutes | Waiting time shortened to 4 minutes | As expected ✔ |
| TC-09 | Important alert during quiet hours | Held until quiet hours end; urgent still gets through | As expected ✔ |
| TC-10 | Unsigned or changed WhatsApp delivery report | Refused | As expected ✔ |
| TC-11 | Worker replies STOP, then START | WhatsApp off, then back on | As expected ✔ |
| TC-12 | Wrong password; too many tries | Same answer for unknown email; then blocked for a while | As expected ✔ |
| TC-13 | Duplicate email; short password | Refused with a plain message | As expected ✔ |
| TC-14 | Suspended user | Cannot log in; open sessions stop at once | As expected ✔ |
| TC-15 | Live connection without a login | Refused | As expected ✔ |
| TC-16 | Job closing in the past | Refused | As expected ✔ |
| TC-17 | Redis down | `/health` answers 503 and names Redis | As expected ✔ |
| TC-18 | Example secret used in production | Server refuses to start | As expected ✔ |
| TC-19 | Daily summary run | Only "for later" alerts of the last 24 hours; nothing when empty | As expected ✔ |
| TC-20 | Account deletion requested | Removed after 14 days, not before; name becomes "a former user" | As expected ✔ |
| TC-21 | Admin downloads the training data | No ids, names, phones or emails | As expected ✔ |
| TC-22 | Redis and database restarted under load | No alert lost; back within 30 s | 9,975 of 9,975 delivered; 3.1 s and 1.6 s ✔ |
| TC-23 | Typing and pressing "Continue" on the log-in page before the app has loaded | Nothing lost; the password step follows; logged in | As expected ✔ |
| TC-24 | Every page at 320, 360, 768, 1024 and 1440 px | No serious accessibility problem; no sideways scrolling | As expected ✔ |
| TC-25 | **Employer posts a job asking workers to "send 500ksh … on my M-Pesa: 07…"** | Job held: not listed, no alerts, waiting in admin review with its reasons | As expected ✔ |
| TC-26 | Admin publishes a held job / removes it | Publish: alerts go out. Remove: taken down with a reason the employer sees | As expected ✔ |
| TC-27 | An older scam job (saved before the fix) is announced | Its alerts are blocked using the job's own description | As expected ✔ |
| TC-28 | Honest "Send your CV to 0712 345 678" | Not spam (one warning sign only) | As expected ✔ |
| TC-29 | Worker gives a reason after *Not important to me*; then presses Undo | Reason saved; Undo removes it; only the worker can answer | As expected ✔ |
| TC-30 | Log-in code on a new device: right, wrong, five wrong, reused | Right logs in once; wrong is explained; five wrong or reused ends the attempt | As expected ✔ |
| TC-31 | Log in on a new device, choose **By SMS** (verified phone) or **By email** | Code arrives on the chosen channel (terminal / Mailpit in mock mode); addresses masked; a person without a verified phone gets email only | As expected ✔ |
| TC-32 | Tick "Remember this phone or computer", log in again; then "Log out of all devices" | No code the second time, greeted "Welcome back, Wanjiru"; after logging out everywhere, the code is asked again | As expected ✔ |
| TC-33 | Sign up with `name@gmial.com`, password `12345678` | "Did you mean gmail.com?"; easy password refused; account created only after the emailed code | As expected ✔ |
| TC-34 | Log in with `0700 000 004` (a confirmed phone) / with an unknown email | Phone works like the email / "We cannot find an account" with "Create an account" (email carried over) | As expected ✔ |

---

## 7. Classifier evaluation

The classifier was scored on **177 hand-written messages** that were never used to build or
tune it (`ml-service/evaluation/holdout-v1.csv`, labelled with written rules in
`ml-service/evaluation/LABELLING.md`).

| Measure | rules-v0 (Sprint II baseline) | rules-v1 (now) | Target |
| --- | ---: | ---: | ---: |
| Priority, weighted F1 | 63.5% | 63.5% | ≥ 85% |
| Spam accuracy | 88.7% | **89.3%** | ≥ 95% |
| Scams caught | 10 of 30 | **11 of 30** | — |
| Honest messages blocked | 0% | **0%** | < 5% |

**rules-v1** added three scam signs after a manual test found that a job post asking workers to
send money to an M-Pesa number reached workers (defect D-11 below): an amount to send ("send
500ksh"), a phone number next to M-Pesa or "send" words, and "secure the job" phrases. Each sign
alone stays under the spam limit, so honest messages are not blocked. The scores show the rules
are **safe but not yet good enough**. That is why the next sprint trains machine learning models
(random forest and XGBoost), which must beat these numbers on the same 177 messages.

---

## 8. Problems the tests found, and how they were fixed

Failed results are kept, not hidden. Each problem was fixed and then tested again.

| ID | Found by | Problem | Fix | Re-test |
| --- | --- | --- | --- | --- |
| D-01 | Load test | Work waited for one of only 10 database connections | More connections (worker 20, API 8) | Urgent p95 132 ms (was 434 ms) |
| D-02 | Load test | Events handled one at a time | Four at a time | p95 39 ms (was 763 ms) |
| D-03 | Recovery test | 59 live alerts sent during a Redis restart never appeared on screen | Pages fetch what they missed when Redis returns | 9,975 of 9,975 appeared |
| D-04 | Browser console | Security policy blocked the form library | Library setting changed | No errors |
| D-05 | Accessibility check | A menu label read differently from what is shown | Reading order fixed | Accessibility score 100 |
| D-06 | Page-speed test | First page took 4.1–4.4 s on slow 3G | Pages saved as ready-made HTML | 1.1–1.3 s |
| D-07 | Browser test after D-06 | Windows line endings broke a security fingerprint | Line endings normalised | No errors |
| D-08 | Review | Deleted users' names stayed in other people's alerts | Replaced with "a former user" | Test passes |
| D-09 | Production trial | Database set-up container missing the Redis address | Address added | All containers healthy |
| D-10 | Sandbox preparation | Twilio could not report back to a local address | Report address only when public | Test passes |
| D-11 | **Manual test (22 Oct 2026)** | A scam **job post** reached workers: alerts carry a short summary, so the classifier never saw the employer's description | Job posts are checked when posted and held if they look like scams; alerts also check the job's description; three new scam signs (rules-v1) | TC-25 to TC-28 pass; the same post is now held |
| D-12 | Security check in CI | Three known problems in development-only tools | Updated (`npm audit fix`) | 0 problems |
| D-13 | Review | A developer-only page (`/ui-kit`) was reachable in the built website | Only in development | Test: built site shows "page not found" |

---

## 9. What has not been tested yet (honest list)

- **Trained machine-learning models**: next sprint. Today's classifier is rule-based.
- **Real WhatsApp, SMS and email**: tested in mock mode; the provider sandbox test is prepared
  (`docs/sandbox-test.md`) but not yet run.
- **The deployed server**: all results come from one laptop; they will be repeated after
  deployment.
- **Real users**: no usability test, screen-reader session, A/B test or survey yet. These need
  the deployed system and test users.
- **Firefox and WebKit**: the smoke test runs in GitHub Actions; the test browsers could not be
  downloaded on the development computer's slow connection.

---

## 10. Words used in this report

| Word | Meaning |
| --- | --- |
| Test suite | A group of automated tests run together |
| Pass / fail | The actual result matched (or did not match) the expected result |
| Mock mode | Messages are recorded instead of really sent |
| End-to-end test | A robot uses the real website in a real browser, like a person |
| axe | A tool that finds accessibility problems on a web page |
| p95 | 95% of cases were this fast or faster |
| CI (continuous integration) | GitHub runs every test automatically after each change |
| Weighted F1 | One score (0–100%) that balances how often "Urgent" is right and how many urgent messages were found |
| False positive | An honest message wrongly blocked as spam |
| Held job | A job post that looked like a scam: hidden until an admin publishes or removes it |
