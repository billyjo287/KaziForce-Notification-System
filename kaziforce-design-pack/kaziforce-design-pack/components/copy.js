// KaziForce microcopy. Friendly, short, never at the user's expense.
// Rules:
//  - At most ONE playful line visible per screen.
//  - NO jokes on anything about money going wrong, safety, account problems, or Urgent alerts.
//    Those stay plain and clear.
//  - {name} = the user's first name from data you already have. If it's missing, drop the comma part.

export const COPY = {
  // Rotating lines in KaziLoader (2.6s each). `wink: true` shows the winking face.
  loading: [
    { text: 'Finding jobs near you…' },
    { text: 'Sorting the urgent from the not-so-urgent…' },
    { text: 'Hang on… I know someone who’s gonna wait.', wink: true },
    { text: 'Almost there. Boda boda speed.' },
  ],

  theme: {
    toDark: 'Lights off. Your eyes say asante.',
    toLight: 'Lights on. Karibu back.',
  },

  success: {
    profileCreated: { title: 'You’re all set, {name}!', body: 'Your profile is live. Now let the jobs come to you, no chasing needed.', cta: 'Show me jobs' },
    jobAccepted: { title: 'Kazi iko! You’re booked.', body: '{when} in {place}. We’ll remind you the evening before, so no alarm drama.' },
    jobDeclined: 'No problem. We’ll keep looking for something that suits you better.',
    applied: { label: 'Applied', hint: 'Fingers crossed for you' },
    applicantAccepted: 'Done. {name} gets an SMS in seconds.',
    applicantDeclined: 'Declined kindly. We’ll let {name} know there’s more work coming.',
    replacementSearching: { title: 'Asking nearby workers…', body: 'Somebody is about to have a very good morning.' },
    replacementSent: { title: '{count} workers notified by SMS and WhatsApp.', body: 'We’ll ping you the moment one says yes. Go have your tea.' },
    retryWorked: 'Back in business.',
  },

  empty: {
    all: { title: 'All caught up.', body: 'Nothing new right now. We’ll shout if something important comes in.' },
    urgent: { title: 'Nothing urgent. Enjoy your chai.', body: 'When something can’t wait, you’ll know straight away, even by SMS.' },
    medium: { title: 'Nothing here for now.', body: 'Payments and updates will show up here.' },
    low: { title: 'Quiet day.', body: 'Small updates wait here until your daily summary.' },
  },

  spam: {
    workerLine: '{count} scam messages tried to reach you today. They didn’t get past us.',
    heroLine: '{count} spam messages blocked today. You’re welcome.',
    adminBlocked: 'Blocked. That one won’t bother anyone again.',
    adminReleased: 'Released and delivered. Sorry for the suspicion.',
  },

  admin: {
    priorityCorrected: 'Noted. The model will learn from this one.',
  },

  offline: { title: 'You’re offline. Don’t worry.', body: 'Urgent alerts will still reach you by SMS, so you won’t miss a thing. We’ll sync up the moment you’re back.', cta: 'Try again', chip: 'SMS alerts are on' },
  notFound: { title: 'This page went for lunch and didn’t come back.', body: 'Let’s get you somewhere more useful.', cta: 'Take me home' },
  error: { title: 'Something tripped on our side.', body: 'It’s us, not you. Give it another go, and if it keeps happening, we’re already on it.', cta: 'Try again' },

  landing: {
    ctaSub: 'That’s less time than waiting for a matatu to fill up.',
    footer: 'Made in Nairobi, powered by a lot of chai.',
  },
};

// tiny helper: fill('Hi {name}', { name: 'Wanjiru' })
export const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
