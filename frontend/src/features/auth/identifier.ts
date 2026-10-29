// Small helpers for the log-in and sign-up pages: reading "email or phone number", spotting a
// mistyped email address, easy-to-guess passwords, and the account this device remembers.

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** Same rules as the backend (accountCodes.ts): Kenyan mobile numbers in any common format. */
export function parseIdentifier(raw: string): Identifier | null {
  const value = raw.trim();
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
      ? { kind: 'email', value: value.toLowerCase() }
      : null;
  }
  const match = /^(?:\+?254|0)?([17]\d{8})$/.exec(value.replace(/[\s\-().]/g, ''));
  return match ? { kind: 'phone', value: `+254${match[1]}` } : null;
}

/** "+254712345678" -> "0712 345 678", the way people write it in Kenya. */
export function formatPhone(e164: string): string {
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'ymail.com',
  'live.com',
  'aol.com',
  'protonmail.com',
  'strathmore.edu',
];

/** Letters to add, remove, change or swap to turn one word into the other. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** "wanjiru@gmial.com" -> "wanjiru@gmail.com". Null when the address looks fine. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (COMMON_DOMAINS.includes(domain) || domain.length < 4) return null;
  const close = COMMON_DOMAINS.find((d) => distance(domain, d) <= 2);
  return close ? `${email.slice(0, at)}@${close}` : null;
}

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '12341234',
  '11223344',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'abc12345',
  'abcd1234',
  'kenya123',
  'nairobi123',
  'kaziforce',
  'kaziforce1',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

// ---------- The account this device remembers ----------
// Saved only after "Remember this phone or computer for 30 days" (or a log-in that skipped the
// code because the device was remembered): first name and email, so the log-in page can say
// "Welcome back, Wanjiru" and ask only for the password. "Not you?" and "Log out of all
// devices" forget it. Read by the small script in index.html too (it then hides the
// ready-made page, which cannot know this).
const REMEMBERED = 'kf.rememberedAccount';

export interface RememberedAccount {
  name: string;
  email: string;
}

export function rememberedAccount(): RememberedAccount | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(REMEMBERED) ?? 'null',
    ) as RememberedAccount | null;
    return saved?.name && saved.email ? saved : null;
  } catch {
    return null;
  }
}

export function rememberAccount(account: RememberedAccount) {
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(account));
  } catch {
    // storage blocked: the page simply asks for the email next time
  }
}

export function forgetAccount() {
  try {
    localStorage.removeItem(REMEMBERED);
  } catch {
    // nothing saved
  }
}
