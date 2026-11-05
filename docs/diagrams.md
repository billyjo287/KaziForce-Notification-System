# Analysis and design diagrams (as built) — for thesis Chapter 4

These diagrams describe the system **as implemented**, updating the proposal's sections 3.5 and
3.6. They are written in Mermaid, so GitHub shows them as pictures. To put one in the Word
thesis: the pictures are ready in [diagrams/](diagrams/) (`1-architecture.png` … `9-database-schema.png`),
or open https://mermaid.live, paste the diagram's code, and use **Actions → PNG**.

Last updated 5 November 2026: log-in and sign-up codes (ADR 0013, 0015), the scam check on new
job posts, the reason behind "Not important to me", the priority names people see ("Act now",
"Check today", "When you're free", "Blocked scam"; stored as urgent, medium, low, spam), alert
types on/off and per channel, "Always send" rules, editable SMS/email wording and a weekly or
monthly summary (ADR 0016), browser pop-ups (Web Push) and the history of settings changes
(ADR 0017), and a full database schema (diagram 9).

## What changed from the proposal, and why

| Proposal (sections 3.5–3.8) | As built | Why (record) |
| --- | --- | --- |
| Urgent alerts go to **both** WhatsApp and SMS | In-app at once + the person's **first** channel; the **next** channel only if sending fails or the alert is not opened in time ("first choice, with a safety net"); "send on both" is an option | Fewer duplicate messages (less fatigue) and lower SMS cost, while urgent alerts still reach people (PRD FR-4, ADR 0006) |
| The Python service reads jobs from the BullMQ queue | The Node worker calls the Python service over REST (`POST /predict`, 500 ms limit, rules inside Node as a fallback) | One queue technology; an urgent alert never waits for, or is lost because of, the ML service (ADR 0001, 0005) |
| Notification created → queued directly | **Outbox pattern**: the business action and a `DomainEvent` are saved in one database transaction; a relay turns events into notifications | Nothing can be "done but never announced", even if the server stops at the wrong moment (ADR 0003, 0004) |
| `NotificationQueue` table | Not needed: queued work lives in Redis (BullMQ), saved to disk; the notification's `status` shows where it is | One source of truth for the queue (ADR 0004) |
| `UserPreference` = one row per channel | One row per person: channel order, per-channel on/off and threshold (JSON), quiet hours, daily summary, preset | Simpler to read and change in one go; presets first (PRD FR-5) |
| Hosting: Railway or Render, Upstash Redis | Vercel + one Azure for Students server (Docker) + Supabase | Free; Upstash's free tier cannot carry idle BullMQ traffic (ADR 0011) |
| Priority shown as "Urgent / Medium / Low" | The same three levels, shown as **Act now**, **Check today** and **When you're free** (spam: **Blocked scam**); stored as `urgent`, `medium`, `low` | Says what to do, not how the system ranks it; easier for older and first-time users (design refresh) |
| Log-in with email and password | Email **or phone number**, one question per screen; a **6-digit code** by SMS or email on a new phone or computer and at sign-up; "remember this device for 30 days" | Protects accounts whose password leaks, while a person on their own phone sees a code about once a month (ADR 0013, 0015) |
| Only notifications are checked for scams | **Job posts are checked too**, before anyone sees them: a suspicious post is held (not listed, no alerts) until an admin publishes or removes it | Stops a scam at the source instead of blocking one alert per worker; same classifier and 500 ms fallback as the alerts (ADR 0012) |
| Notifications only by in-app, WhatsApp, SMS and email | Also **browser pop-ups** (Web Push) on phones and computers that allowed them; silent during quiet hours | Alerts reach people even when the site is closed; KaziForce requirements FR-NOT-016..020 (ADR 0017) |
| Preferences per channel only | Also per **alert type** (on/off, which channels), a daily, weekly or monthly summary, and admin "Always send" rules and SMS/email wording | KaziForce requirements FR-NOT-003, 011, 031, 032, 035, 037 (ADR 0016) |
| — | Added: quiet hours with held messages, delivery reports from providers, tracked links ("opened"), "Not important to me", admin corrections, anonymised training export, account deletion after 14 days | Requirements found during the build (PRD FR-4b, FR-9, Kenya Data Protection Act) |

---

## 1. System architecture (deployment)

```mermaid
flowchart LR
  subgraph Users["People (phone or computer browser)"]
    W[Worker]
    E[Employer]
    A[Admin]
  end
  subgraph Vercel["Vercel (free)"]
    WEB["Website<br/>React + Vite<br/>ready-made pages for /, /login, /register"]
  end
  subgraph Azure["Azure for Students server (Docker)"]
    CADDY["Caddy<br/>HTTPS"]
    API["API<br/>Express + Socket.IO"]
    WORKER["Worker<br/>outbox relay, BullMQ jobs,<br/>channel router, clock jobs"]
    ML["ML service<br/>FastAPI /predict"]
    REDIS[("Redis<br/>job queues,<br/>log-in codes (hashed)")]
  end
  subgraph Supabase["Supabase (free)"]
    PG[("PostgreSQL")]
  end
  subgraph Providers["Message providers"]
    TW["Twilio<br/>WhatsApp"]
    AT["Africa's Talking<br/>SMS"]
    RS["Resend<br/>email"]
  end
  PUSH["Browser push services<br/>(Google, Mozilla, Apple)"]
  W & E & A -->|HTTPS| WEB
  WEB -->|"/api forwarded"| CADDY
  W & E & A -.->|"live alerts (Socket.IO)"| CADDY
  CADDY --> API
  API --> PG
  API <--> REDIS
  WORKER --> PG
  WORKER <--> REDIS
  WORKER -->|"REST, 500 ms limit"| ML
  WORKER --> TW & AT & RS
  WORKER -->|"Web Push, summary line only"| PUSH
  PUSH -.->|pop-ups| W & E
  API -->|"log-in and sign-up codes"| AT & RS
  TW & AT -.->|delivery reports, STOP| CADDY
```

## 2. Use cases

```mermaid
flowchart LR
  W([Worker])
  E([Employer])
  A([Admin])
  ML[[ML service]]
  CLOCK[[Clock 08:00 / 03:30]]

  subgraph System["KaziForce notification system"]
    U1(Receive urgent job alert)
    U2(Receive application update)
    U3(Send and receive messages)
    U4(Set channel order, quiet hours, presets)
    U5(Receive daily summary email)
    U6(View alert history; mark 'Not important to me' and say why)
    U7(Post a job; accept or reject applicants)
    U8(See who got the job alert)
    U9(Review blocked spam and held job posts; correct priority)
    U10(Monitor delivery and queues)
    U11(Send announcements)
    U12(Manage users and jobs)
    U13(Export anonymised training data)
    U14(Classify priority and detect spam)
    U15(Sign up and log in; 6-digit code on a new device)
    U16(Search alerts; mark as unread)
    U17(Choose alert types, channels per type, summary frequency, pop-ups)
    U18(Set 'Always send' rules and SMS/email wording)
  end

  W --- U1 & U2 & U3 & U4 & U5 & U6 & U15 & U16 & U17
  E --- U3 & U4 & U6 & U7 & U8 & U15 & U16 & U17
  A --- U9 & U10 & U11 & U12 & U13 & U18
  U1 & U2 & U3 & U7 & U11 -.->|include| U14
  ML --- U14
  CLOCK --- U5
```

## 3. Sequence: an employer posts an urgent job

```mermaid
sequenceDiagram
  autonumber
  actor E as Employer
  participant API as API (Express)
  participant DB as PostgreSQL
  participant R as Worker: outbox relay
  participant Q as Redis (BullMQ)
  participant N as Worker: notification job
  participant ML as ML service
  participant RT as Channel router
  participant CH as Channel adapters
  actor W as Worker (job seeker)

  E->>API: POST /api/jobs (title, place, skill, deadline, urgent)
  API->>ML: scam check of the post (500 ms limit, rules in Node as fallback)
  alt looks like a scam
    API->>DB: save Job, status held (no event, not listed)
    API-->>E: 201 Created (held for review)
    Note over API,DB: an admin publishes it (then "job.posted" as below) or removes it
  else looks fine
    API->>DB: save Job + DomainEvent "job.posted" (one transaction)
    API-->>E: 201 Created
  end
  DB-->>R: NOTIFY new event
  R->>DB: find workers (same place or skill), save Notifications (QUEUED)
  R->>Q: one job per notification (job id = notification id)
  Q->>N: process notification
  N->>ML: POST /predict (text, type, roles, time, deadline)
  alt answers within 500 ms
    ML-->>N: priority, spam score, model version, explanation
  else slow or down
    N->>N: same rules in Node (predictionSource = rules_fallback)
  end
  alt spam
    N->>DB: status blocked (admin spam review)
  else not spam
    N->>DB: priority saved, in-app DeliveryLog
    N-->>W: Socket.IO "notification:new" (shows at once)
    N-->>W: browser pop-up (Web Push, summary line only, silent at night)
    N->>RT: plan channels (priority, preferences, quiet hours)
    RT->>Q: WhatsApp job (first choice) + escalation check later
    Q->>CH: send via Twilio
    CH->>DB: DeliveryLog (sent, provider id)
    W->>API: opens the alert (tracked link or in-app)
    API->>DB: openedAt (escalation not needed)
  end
```

## 4. Sequence: daily summary (08:00 Nairobi)

```mermaid
sequenceDiagram
  autonumber
  participant C as Clock job (BullMQ, every day 08:00 Africa/Nairobi)
  participant S as Daily summary
  participant DB as PostgreSQL
  participant M as Email adapter (Resend)
  C->>S: run
  S->>DB: people whose summary is due today (daily, weekly on Monday, monthly on the 1st)
  S->>DB: their "When you're free" (low) alerts in that period
  loop each person
    S->>DB: their alerts (not spam, not "Not important to me")
    S->>S: group by category, newest first, in their language
    S->>M: email with links + "Manage your notification preferences"
    M->>DB: DeliveryLog (email)
  end
```

## 5. Activity: processing one notification

```mermaid
flowchart TD
  START([Business action saved with its event]) --> REL[Relay creates notifications: QUEUED]
  REL --> PRED{ML service answers<br/>within 500 ms?}
  PRED -- yes --> CLS[Use ML answer]
  PRED -- no --> FB[Use rules in Node<br/>rules_fallback]
  CLS --> SPAM{Spam?}
  FB --> SPAM
  SPAM -- yes --> BLOCK[Blocked scam; admin spam review] --> LOG
  SPAM -- no --> OFF{Type switched off<br/>and not 'Always send'?}
  OFF -- yes --> QUIETLY[Keep quietly in the list<br/>marked read, nothing sent] --> LOG
  OFF -- no --> INAPP[Deliver in the app at once + live push<br/>+ browser pop-ups]
  INAPP --> PRIO{Priority}
  PRIO -- "Act now (urgent)" --> FIRST[Send on first usable channel<br/>WhatsApp or SMS]
  FIRST --> OK{Sent and opened<br/>within the window?}
  OK -- yes --> LOG
  OK -- "no (failed after 3 tries,<br/>or not opened)" --> NEXT[Send on next channel] --> LOG
  PRIO -- "Check today (medium)" --> QUIET{Quiet hours?}
  QUIET -- yes --> HOLD[Hold until quiet hours end] --> EMAIL
  QUIET -- no --> EMAIL[Email + other channels set to<br/>'Act now and Check today']
  EMAIL --> LOG
  PRIO -- "When you're free (low)" --> SUM[In the app only;<br/>08:00 summary: daily, weekly or monthly] --> LOG
  LOG([DeliveryLog per attempt; times kept for training])
```

## 6. Entity-relationship diagram (core tables)

```mermaid
erDiagram
  User ||--o| UserPreference : has
  User ||--o{ Notification : receives
  User |o--o{ Notification : sends
  Notification ||--o{ DeliveryLog : "tried on"
  Notification ||--o{ TrackedLink : "links to"
  User ||--o{ Job : posts
  Job ||--o{ Application : receives
  User ||--o{ Application : makes
  Application ||--o{ Message : "conversation"
  Job |o--o{ Notification : "announced by"
  Location ||--o{ Job : "located in"
  Skill ||--o{ Job : needs
  User ||--o{ AuditLog : "admin actions"
  User ||--o{ TrustedDevice : "remembered devices"
  User ||--o{ PushSubscription : "browsers with pop-ups"

  User {
    uuid id PK
    string email
    string name
    enum role "worker | business | admin"
    enum language "en | sw"
    string phone "E.164"
    bool phoneVerified
    datetime emailVerifiedAt
    datetime onboardingCompletedAt
    bool consentSmsWhatsapp
    bool usesWhatsApp
    datetime deletionRequestedAt
  }
  UserPreference {
    uuid userId FK
    enum preset
    enum[] channelOrder
    json channelSettings "on/off + threshold per channel"
    bool urgentOnBothChannels
    json quietHours
    bool dailySummary
    enum summaryFrequency "daily | weekly | monthly"
    json categorySettings "per alert type: on/off, channels"
  }
  Notification {
    uuid id PK
    uuid recipientId FK
    uuid senderId FK
    enum type
    string title
    string message
    enum status
    enum predictedPriority
    float spamScore
    bool isSpam
    string modelVersion
    enum predictionSource "ml | rules | rules_fallback"
    enum correctedPriority "training label"
    bool correctedSpam "training label"
    bool markedNotImportant
    string notImportantReason "why, optional"
    bool mutedByPreference "type switched off"
    datetime heldUntil
    datetime escalatedAt
  }
  DeliveryLog {
    uuid id PK
    uuid notificationId FK
    enum channel "in_app | whatsapp | sms | email | push"
    int attempt
    enum status
    bool isEscalation
    datetime sentAt
    datetime deliveredAt
    datetime openedAt
    datetime clickedAt
    datetime dismissedAt
    string error
  }
  Job {
    uuid id PK
    uuid employerId FK
    string title
    enum status "open | closed | removed | held"
    enum urgency
    datetime deadline
    float spamScore "scam check of the post"
    datetime heldAt
    uuid reviewedById FK
  }
  TrustedDevice {
    uuid id PK
    uuid userId FK
    string tokenHash "cookie token, hashed"
    datetime expiresAt "30 days"
  }
  PushSubscription {
    uuid id PK
    uuid userId FK
    string endpoint "the browser's push address"
    string p256dh "encryption key"
    string auth
  }
  NotificationRule {
    string category PK
    bool mandatory "Always send"
  }
  MessageWording {
    uuid id PK
    string category
    enum language
    bool urgent
    string text "null = built-in wording"
    int version "never changed, new row per save"
  }
  MLMetadata {
    uuid id PK
    string version
    string algorithm
    json metrics
    bool isActive
  }
  DomainEvent {
    uuid id PK
    string type
    json payload
    datetime processedAt
  }
```

`MLMetadata` (model registry), `DomainEvent` (outbox), `NotificationRule` and `MessageWording`
(admin settings) stand on their own. Other tables:
`Location`, `Skill`, `Application`, `Message`, `Session`, `PasswordResetToken`,
`PhoneVerification`, `AuditLog`, `TrackedLink` ([schema.prisma](../backend/prisma/schema.prisma)).
Log-in and sign-up codes are not a table: they live in Redis for 5 minutes, hashed (ADR 0013).

## 7. Class diagram (main components)

```mermaid
classDiagram
  class ChannelAdapter {
    <<abstract>>
    +name: Channel
    +addressFor(recipient) string?
    +send(message) SendResult
    #sendWithProvider(message)* SendResult
    #sendMock(message) SendResult
  }
  class WhatsAppAdapter { Twilio Messages API, templates }
  class SmsAdapter { Africa's Talking }
  class EmailAdapter { Resend or SendGrid; Mailpit in mock mode }
  class InAppAdapter { Socket.IO via Redis pub/sub }
  class PushAdapter { Web Push via web-push; summary only }
  ChannelAdapter <|-- WhatsAppAdapter
  ChannelAdapter <|-- SmsAdapter
  ChannelAdapter <|-- EmailAdapter
  ChannelAdapter <|-- InAppAdapter
  ChannelAdapter <|-- PushAdapter

  class ChannelRouter {
    +planDelivery(priority, preferences, recipient, now) Plan
    +nextChannel(plan, tried) Channel?
    +escalationWindowMs(deadline, now) number
  }
  class UserPreferenceManager {
    +get(userId) UserPreferences
    +update(userId, change)
  }
  class CategoryRules {
    +effectiveCategorySetting(settings, category, mandatory)
    +mandatory.get() Set
  }
  class Wording {
    +summary(category, priority, language) string
  }
  class NotificationWorker {
    +process(notificationId)
    -classify() Verdict
  }
  class OutboxRelay {
    +relay(event) Notification[]
  }
  class DailySummary {
    +summaryRecipients(until)
    +buildSummaryFor(userId)
  }
  class Classifier {
    <<protocol, Python>>
    +predict(PredictRequest) PredictResponse
  }
  class RuleBasedClassifier { rules-v0.json }
  class TrainedClassifier { Phase 9 }
  Classifier <|.. RuleBasedClassifier
  Classifier <|.. TrainedClassifier

  OutboxRelay --> NotificationWorker : queues jobs
  NotificationWorker --> Classifier : POST /predict
  NotificationWorker --> ChannelRouter
  ChannelRouter --> UserPreferenceManager
  ChannelRouter --> CategoryRules
  NotificationWorker --> PushAdapter : pop-ups after in-app
  ChannelAdapter ..> Wording : message text
  ChannelRouter --> ChannelAdapter : one job per channel
  DailySummary --> EmailAdapter
```

The router and planner are plain functions in `backend/src/channels/router.ts`, shown here as one
class for readability.

## 8. Sequence: logging in on a new phone or computer (6-digit code)

```mermaid
sequenceDiagram
  autonumber
  actor P as Person
  participant WEB as Website
  participant API as API (Express)
  participant R as Redis
  participant DB as PostgreSQL
  participant CH as SMS (Africa's Talking) or email (Resend)

  P->>WEB: email or phone number
  WEB->>API: POST /auth/check
  API-->>WEB: account exists (yes / no only)
  P->>WEB: password
  WEB->>API: POST /auth/login
  API->>DB: check password (bcrypt), look for a remembered device cookie
  alt device remembered (30 days)
    API-->>WEB: logged in
  else new device
    API->>R: challenge (hashed id), 10 minutes to choose
    API-->>WEB: "Where should we send your code?" (07•• ••• 678 or wa•••@gmail.com)
    P->>WEB: SMS or email
    WEB->>API: POST /auth/login/send (sms or email)
    API->>R: code hash, 5 minutes, 5 tries
    API->>CH: 6-digit code
    CH-->>P: code
    P->>WEB: types the code (fills in by itself on Android)
    WEB->>API: POST /auth/login/code
    API->>R: compare hash, delete it
    opt "Remember this phone or computer"
      API->>DB: TrustedDevice (token hash), cookie on the device
    end
    API-->>WEB: logged in
  end
```

Sign-up works the same way: the code goes to the email or phone the person typed (they choose,
ADR 0015), and the account is created only after the right code. With `ACCOUNT_CODES=false`
(automated tests, or while reviewing the design) the code steps are skipped.

## 9. Database schema (every table, as built)

Generated from `backend/prisma/schema.prisma` (5 November 2026): 20 tables, every
column, primary keys (PK) and foreign keys (FK). Diagram 6 shows the core tables with their
meaning; this one is the complete physical schema.

```mermaid
erDiagram
  User {
    string id PK
    string email
    datetime emailVerifiedAt
    string passwordHash
    string name
    enum role
    enum status
    enum language
    string phone
    bool phoneVerified
    bool consentSmsWhatsapp
    datetime consentAt
    bool usesWhatsApp
    string locationId FK
    string companyName
    datetime lastLoginAt
    datetime onboardingCompletedAt
    datetime suspendedAt
    string suspendedReason
    datetime deletionRequestedAt
    datetime whatsappOptedOutAt
    datetime smsOptedOutAt
    datetime createdAt
    datetime updatedAt
  }
  Location {
    string id PK
    string slug
    string name
    string county
  }
  Skill {
    string id PK
    string slug
    string nameEn
    string nameSw
  }
  Session {
    string id PK
    string userId FK
    string tokenHash
    string userAgent
    datetime expiresAt
    datetime revokedAt
    string replacedById
    datetime createdAt
  }
  TrustedDevice {
    string id PK
    string userId FK
    string tokenHash
    string userAgent
    datetime expiresAt
    datetime createdAt
  }
  PasswordResetToken {
    string id PK
    string userId FK
    string tokenHash
    datetime expiresAt
    datetime usedAt
    datetime createdAt
  }
  PhoneVerification {
    string id PK
    string userId FK
    string phone
    string codeHash
    int attempts
    datetime expiresAt
    datetime verifiedAt
    datetime createdAt
  }
  AuditLog {
    string id PK
    string actorId FK
    string action
    string targetType
    string targetId
    string reason
    json metadata
    datetime createdAt
  }
  DomainEvent {
    string id PK
    string type
    json payload
    datetime availableAt
    datetime processedAt
    datetime cancelledAt
    int attempts
    string lastError
    datetime createdAt
  }
  UserPreference {
    string id PK
    string userId FK
    enum preset
    enum_list channelOrder
    json channelSettings
    bool urgentOnBothChannels
    json quietHours
    bool dailySummary
    enum summaryFrequency
    json categorySettings
    enum textSize
    bool reduceMotion
    datetime channelSuggestionShownAt
    datetime createdAt
    datetime updatedAt
  }
  Notification {
    string id PK
    string recipientId FK
    enum recipientRole
    string senderId FK
    enum senderRole
    enum type
    string category
    string title
    string message
    string link
    string jobId FK
    datetime deadlineAt
    enum status
    enum predictedPriority
    float priorityConfidence
    bool isSpam
    float spamScore
    string modelVersion
    enum predictionSource
    json explanation
    enum correctedPriority
    bool correctedSpam
    string correctedById FK
    datetime correctedAt
    datetime readAt
    bool markedNotImportant
    datetime markedNotImportantAt
    string notImportantReason
    string notImportantNote
    datetime escalatedAt
    enum escalatedTo
    datetime heldUntil
    bool mutedByPreference
    datetime createdAt
    datetime updatedAt
  }
  DeliveryLog {
    string id PK
    string notificationId FK
    enum channel
    int attempt
    enum status
    bool isEscalation
    string providerMessageId
    string error
    datetime sentAt
    datetime deliveredAt
    datetime openedAt
    datetime clickedAt
    datetime dismissedAt
    datetime createdAt
    datetime updatedAt
  }
  TrackedLink {
    string id PK
    string token
    string notificationId FK
    enum channel
    int clickCount
    datetime firstClickedAt
    datetime expiresAt
    datetime createdAt
  }
  MLMetadata {
    string id PK
    string version
    string algorithm
    string description
    json metrics
    json datasetInfo
    string artifactPath
    bool isActive
    datetime trainedAt
    datetime deployedAt
    datetime createdAt
  }
  PushSubscription {
    string id PK
    string userId FK
    string endpoint
    string p256dh
    string auth
    string userAgent
    datetime createdAt
    datetime lastUsedAt
  }
  NotificationRule {
    string category PK
    bool mandatory
    string updatedById FK
    datetime updatedAt
  }
  MessageWording {
    string id PK
    string category
    enum language
    bool urgent
    string text
    int version
    string createdById FK
    datetime createdAt
  }
  Job {
    string id PK
    string employerId FK
    string title
    string description
    string locationId FK
    string skillId FK
    string pay
    datetime deadline
    enum urgency
    enum status
    string removedReason
    datetime removedAt
    string removedById FK
    float spamScore
    json spamReasons
    datetime heldAt
    datetime reviewedAt
    string reviewedById
    datetime createdAt
    datetime updatedAt
  }
  Application {
    string id PK
    string jobId FK
    string workerId FK
    enum status
    string note
    datetime statusChangedAt
    datetime createdAt
    datetime updatedAt
  }
  Message {
    string id PK
    string applicationId FK
    string senderId FK
    string recipientId FK
    string body
    datetime readAt
    datetime createdAt
  }
  Application ||--o{ Message : "application"
  Job |o--o{ Notification : "job"
  Job ||--o{ Application : "job"
  Location |o--o{ User : "location"
  Location ||--o{ Job : "location"
  Notification ||--o{ DeliveryLog : "notification"
  Notification ||--o{ TrackedLink : "notification"
  Skill ||--o{ Job : "skill"
  User |o--o{ Job : "removedBy"
  User |o--o{ MessageWording : "createdBy"
  User |o--o{ Notification : "correctedBy"
  User |o--o{ Notification : "sender"
  User |o--o{ NotificationRule : "updatedBy"
  User ||--o{ Application : "worker"
  User ||--o{ AuditLog : "actor"
  User ||--o{ Job : "employer"
  User ||--o{ Message : "recipient"
  User ||--o{ Message : "sender"
  User ||--o{ Notification : "recipient"
  User ||--o{ PasswordResetToken : "user"
  User ||--o{ PhoneVerification : "user"
  User ||--o{ PushSubscription : "user"
  User ||--o{ Session : "user"
  User ||--o{ TrustedDevice : "user"
  User ||--o{ UserPreference : "user"
```
