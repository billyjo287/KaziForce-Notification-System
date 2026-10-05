# KaziForce Notification System — Product Requirements (from the approved proposal)

Source: "Intelligent Multi-Channel Notification Prioritization for Workforce Marketplaces: Development of a Real-Time Alert System for KaziForce in Kenya" (B. J. Igiraneza, 167022). Requirement IDs are for traceability in tests and in thesis Chapter 5. Where this document adjusts the proposal, the change is marked **[ADJUSTED]** with the reason.

## 1. Problem and goal

**Problem.** Workforce marketplaces send every alert with the same urgency. A job alert that expires in minutes looks the same as a routine announcement. Users get overloaded, start ignoring or disabling alerts, miss income opportunities, and businesses wait longer for responses. Fake job posts and phishing add to the noise.

**Goal.** A real-time system that filters spam, ranks each notification by urgency, and delivers it through the most suitable channel, while giving users simple control.

**Success criteria (evaluation, thesis Chapter 5).** Priority classifier weighted F1 ≥ 85%; spam detector accuracy ≥ 95% with false positive rate < 5%; response time to urgent alerts improves ≥ 40% vs a no-priority baseline (A/B); ≥ 70% of test users say it is less overwhelming.

## 2. Users (actors)

- **Worker** — receives job alerts and application updates, messages businesses, sets preferences, views history.
- **Business** (labelled **"Employer"** in the interface, because it's plainer) — posts jobs, updates application status, messages workers, receives notifications (new applicants, worker replies, worker accepted), sees delivery status of what it sent.
- **Administrator** — manages users (view, suspend), moderates job posts, monitors delivery logs and channel health, reviews blocked spam, corrects priorities, sends announcements, exports anonymised data, views model versions.
- **ML service** — internal component, not a user.

## 3. Functional requirements

**FR-1 Authentication & authorisation.** Register and log in with email + password; bcrypt hashing; JWT (short-lived access token, refresh token in an httpOnly cookie). Roles: worker, business, admin, with route and socket-level checks. Password reset via verified email link. "Log out of all devices" in Settings. Phone number collected with explicit consent for WhatsApp/SMS and verified with a one-time SMS code. At sign-up the user answers two plain questions that set their channel order: "Do you use WhatsApp on this number?" and "Where do you check messages most?" (WhatsApp / SMS / Email). The account belongs to the person, not the device: logging in from any browser shows the full in-app history.

**FR-2 Notification creation & management.**
- FR-2.1 Business creates a job post (title, description, location, deadline, urgency hint) → generates job-alert notifications for relevant workers (simple rule: same location or skill tag; no matching algorithm).
- FR-2.2 Application status changes (received, reviewed, accepted, rejected) automatically notify the worker.
- FR-2.3 Direct messages between an authenticated worker and business generate notifications.
- FR-2.4 Admin announcements to everyone or to one role.
- Input contract: type, recipientId, message text (UTF-8, max 1,000 chars), timestamp. Reject if recipient or text is missing (DR-3).

**FR-3 Priority classification & spam detection.** Every notification is scored for spam and classified URGENT / MEDIUM / LOW using content, recipient role and context. Spam is blocked, never delivered, and queued for admin review. Missing priority defaults to MEDIUM. Until models are trained, a rule-based classifier provides the same outputs (see section 5).

**FR-4 Multi-channel delivery ("first choice, with a safety net").**
| Priority | Channels |
|---|---|
| URGENT | In-app immediately + the user's FIRST external channel (WhatsApp via Twilio or SMS via Africa's Talking, from their channel order). **Escalation:** if that send fails after 3 retries, OR the alert is not opened within the escalation window, send on the user's NEXT channel. Window = 10 minutes, or half the time left before the job deadline if shorter. If the user switched on "Send urgent alerts on both", send on first and second channels together (no escalation needed). |
| MEDIUM | In-app + email (Resend; SendGrid as alternative). Held during quiet hours. |
| LOW | In-app only (no sound, no toast) + daily summary email |
Rules: a disabled channel is never used; a user without WhatsApp never gets WhatsApp; "opened" means opened in-app, a link click from SMS/email, or a WhatsApp "read" status. External messages (WhatsApp/SMS) contain only a short summary + link, never personal details, so a lost or stolen phone reveals little. SMS text is plain GSM characters, ≤ 160 chars, no emoji. **[ADJUSTED]** Replaces both the old "SMS only as backup" text and the old parallel fork in the activity diagram.

**FR-4b Channel suggestion (simple statistics, not ML).** Track per user which channel they actually open first and how fast. When one channel is clearly faster over at least 5 urgent alerts, show a one-time suggestion: "You usually reply faster on SMS. Make SMS your first choice?" The user decides; never change it silently.

**FR-5 Preference management.** Channel order (drag or up/down buttons), WhatsApp yes/no, "Send urgent alerts on both" switch (off by default: SMS costs money and duplicates add to fatigue). Per channel: on/off and threshold ("Everything", "Urgent and important", "Urgent only"). Quiet hours (only URGENT gets through). Daily summary on/off. **[ADJUSTED for usability]** Show three presets first ("Recommended", "Only urgent things", "Tell me everything") with the detailed per-channel controls behind a "Customise" link (progressive disclosure).

**FR-6 Real-time in-app delivery.** Socket.IO with per-user rooms; dashboard updates without refresh; mark read on open/click; reconnect automatically with long-polling fallback; after reconnect, fetch anything missed via REST.

**FR-7 Delivery tracking & logging.** A DeliveryLog row per attempt (channel, time, status, error). Exponential backoff, max 3 retries. Admin dashboard: delivery success rate per channel, failed deliveries, queue backlog, channel health.

**FR-8 Daily summary.** 08:00 Africa/Nairobi, per user with the setting on: last 24 h of LOW notifications, grouped by category, each with a link into the app, footer button "Manage your notification preferences". Skip sending if there is nothing to summarise.

**FR-9 (ML-readiness, added for the later training phase).** Interaction tracking (opened, clicked, dismissed, "Not important to me"), admin priority/spam corrections, anonymised CSV export, model version registry (MLMetadata).

## 4. Non-functional requirements

- **NFR-1 Performance.** 1,000 notifications/minute sustained. 95% of urgent WhatsApp sends handed to Twilio within 2 s of creation (measure "accepted by provider", since final handset delivery is outside our control). In-app median latency < 200 ms. ML `/predict` < 300 ms; hard timeout 500 ms → rules fallback. Frontend: app shell JS ≤ ~200 KB gzipped, Largest Contentful Paint < 2.5 s on a throttled "Fast 3G" profile; Three.js never in the app bundle.
- **NFR-2 Security & privacy.** New-login alert by email. HTTPS/TLS 1.2+, bcrypt, JWT, RBAC, helmet, rate limiting on auth and create endpoints, zod validation on every input, CORS limited to the frontend origin, secrets only in env vars. Kenya Data Protection Act 2019: consent for SMS/WhatsApp, easy opt-out, account deletion within 30 days, no PII in ML datasets.
- **NFR-3 Reliability.** Recover from Redis/Postgres connection loss within 30 s without losing queued jobs; ≥ 98% delivery success under normal conditions; `/health` endpoints on backend and ML service.
- **NFR-4 Usability & accessibility.** WCAG 2.2 AA; urgent visibly distinct; tooltips/help text on preferences; responsive from 320 px to wide desktop. **[ADJUSTED]** The proposal's compatibility constraint of "1024×768 or higher" conflicts with mobile use; replace with "320 px width and up" in the thesis.
- **NFR-5 Maintainability.** Modular channel adapters; versioned models with timestamp and metrics; TypeScript; ADRs; tests in CI (GitHub Actions).
- **NFR-6 Model quality & explainability.** Targets in section 1; SHAP explanations visible to admins (ML phase).
- **NFR-7 Compatibility.** One responsive website for phones AND laptops/desktops: works from 320 px (small phones) to large monitors, tested at 360, 768, 1024 and 1440 px. Phones get a bottom navigation bar and single-column layouts; tablets and laptops get a left sidebar and two-column layouts where it helps (e.g. list + detail side by side). Latest Chrome, Firefox, Safari, Edge, Samsung Internet; Android Chrome on mid-range devices; iOS Safari.

## 5. Data requirements

**Core tables (thesis ERD):** User, Notification, UserPreference, DeliveryLog, MLMetadata. **Host-app tables (needed to generate events, describe separately in the thesis):** Job, Application, Message, plus Skill/Location lookup lists and AuditLog for admin actions.

Key fields to include beyond the ERD for ML-readiness: Notification.predictedPriority, spamScore, isSpam, modelVersion, predictionSource, correctedPriority, correctedSpam, markedNotImportant, readAt, category. DeliveryLog.sentAt, deliveredAt, openedAt, clickedAt, dismissedAt, attempt, providerMessageId, error. User.language (en | sw), quietHours (JSON), phone (E.164), phoneVerified, consentSmsWhatsapp, usesWhatsApp, channelOrder (e.g. ["whatsapp","sms","email"]), urgentOnBothChannels, status (active | suspended), deletionRequestedAt. Notification.escalatedAt, escalatedTo.

**ML service contract (fixed now, used by rules today and models later):**
```
POST /predict
request:  { "text": str, "type": "job_alert|status_update|message|announcement",
            "recipient_role": "worker|business", "created_at": ISO-8601,
            "sender_role": "business|worker|admin|system", "deadline_minutes": int|null }
response: { "priority": "urgent|medium|low", "priority_confidence": float,
            "is_spam": bool, "spam_score": float,
            "model_version": str, "source": "rules|ml",
            "explanation": [ { "feature": str, "weight": float } ] }
GET /health  → { "status": "ok", "model_version": str }
```
Rule-based v0 (examples): deadline ≤ 60 min or words like "urgent", "expires", "today", "action required", application accepted → URGENT; application reviewed/rejected, direct message → MEDIUM; announcements, general job suggestions → LOW. Spam: payment/registration-fee requests, "send money", suspicious links, all-caps + excessive punctuation, blocked keyword list.

**DR-1..7 (from proposal):** inputs/outputs as FR-2; messages UTF-8 ≤ 1,000 chars, preferences as JSON, ML training data as CSV; reject incomplete notifications, default missing priority to MEDIUM; keep notification logs ≥ 90 days, archive/remove delivery logs after 180 days, delete accounts within 30 days of request (scheduled cleanup job); pseudonymise IDs in training data; TF-IDF + one-hot preprocessing; balanced classes via synthetic data/SMOTE.

## 6. UX rules for ages 18–80 (non-negotiable)

1. **Text:** body ≥ 16 px (18 px on mobile preferred), line height ≥ 1.5, a "Text size: Normal / Large" setting. Contrast ≥ 4.5:1 (3:1 for large text and icons).
2. **Targets:** every tap target ≥ 44×44 px with ≥ 8 px spacing.
3. **Never colour alone:** priority = colour + icon + word ("Urgent", "Important", "For later"). Use friendly words, not "LOW/MEDIUM".
4. **Plain language:** short sentences, no jargon ("Quiet hours — we won't disturb you, except for urgent job offers"). Every setting has one line of help text.
5. **One main action per screen**, clearly the biggest button. Labels always visible above fields (no placeholder-only labels).
6. **Navigation:** mobile bottom bar with max 4 items (Alerts, Jobs, Messages, Settings), icons always with text labels. Desktop: same four as a left sidebar.
7. **Forgiving:** undo for dismiss/delete instead of scary confirmations; clear error messages that say how to fix it; generous session length.
8. **Predictable:** consistent placement, no surprise pop-ups, no auto-advancing carousels, no scroll-jacking or custom smooth scrolling.
9. **Feedback:** every action gets visible confirmation within 100 ms; offline/reconnecting banner when the socket drops.
10. **Low bandwidth:** skeleton loaders, images lazy-loaded and compressed, works acceptably on Fast 3G.
11. **Language:** English and Kiswahili switch in Settings and on the login screen.
12. **Onboarding:** at most 3 short steps (who are you, phone + consent, pick a preset). Skippable.

## 7. Motion rules

Motion should explain, not decorate.
- **Where:** landing page (GSAP ScrollTrigger reveals, one Three.js hero), app micro-interactions (Motion: new notification slides in, card expand, toggle, list reorder), page transitions (short fade/slide).
- **Durations:** 150–300 ms for UI, ≤ 600 ms for landing sections; ease-out; no bouncing or spinning on functional UI; urgent alerts may pulse gently at most 2 times, never flash (WCAG: no more than 3 flashes per second).
- **Three.js hero:** a calm "alerts finding the right person" network scene. Lazy-loaded after first paint, paused when off-screen or tab hidden, capped pixel ratio (≤ 1.5), and replaced by a static SVG when `prefers-reduced-motion`, `navigator.connection.saveData`, low device memory, or no WebGL. Never used inside the logged-in app.
- **Reduced motion:** honour `prefers-reduced-motion` AND provide an in-app "Reduce motion" switch; both turn animations into instant state changes.
- **WebGL shaders / heavy effects** beyond the single hero are out of scope.

## 8. Screens (keep to this list)

Public: Landing, Log in, Register (+3-step onboarding: role → phone, WhatsApp question, consent + SMS code → notification preset), Forgot password.
Worker (job seeker): Alerts dashboard (grouped Urgent / Important / For later, filters: Unread, Urgent, Last 7 days), Notification detail, Jobs list + job detail + apply, My applications, Messages, Profile (skills, location), Settings (presets, channel order, channels, quiet hours, daily summary, language, text size, reduce motion, log out of all devices, delete account). Bottom nav: Alerts, Jobs, Messages, Settings.
Employer (business): Alerts (new applicants, replies, accepted offers), Post a job (short form, one page), My jobs + applicants (accept/reject in one tap), Messages, Delivery status of what they sent, Company profile, Settings. Bottom nav: Alerts, My jobs, Messages, Settings, with a large "Post a job" button on My jobs.
Admin (desktop-first but must still work on a phone): Overview (delivery rate per channel, queue backlog, failures, spam blocked today), Users (search, view, suspend/reactivate), Jobs (moderate, remove), Delivery logs, Spam review queue (release/confirm block, correct priority), Announcements, Model versions + data export, Audit log of admin actions.
Email: Daily summary template, medium-priority notification template.

## 9. Out of scope (from proposal)

Native iOS/Android apps; push via APNs/FCM (so no Web Push either — it runs on those services); voice calls; Telegram/Messenger; integration with other platforms; long offline queueing beyond Redis persistence; sentiment analysis/topic modelling. A PWA web manifest (add to home screen, app icon) is allowed because it involves no push service.
