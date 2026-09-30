// Quiet hours (PRD FR-5): during them only URGENT alerts leave the app; other external sends
// (email, and SMS/WhatsApp for people who chose "everything") wait until the quiet hours end.
// Times are "HH:MM" in Africa/Nairobi, the person's local time. Pure functions, no database.
//
//   22:00-06:00  crosses midnight: 22:00 up to 23:59 and 00:00 up to 05:59 are quiet
//   13:00-15:00  same day: 13:00 up to 14:59 are quiet
//   the start minute is quiet, the end minute is not (at 06:00 the morning has begun)
//   start = end  means no quiet time at all (the settings screen does not allow it)

export const TIMEZONE = 'Africa/Nairobi';
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MINUTES = 24 * 60;

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM", 24-hour clock, Nairobi time */
  start: string;
  end: string;
}

export const NO_QUIET_HOURS: QuietHours = { enabled: false, start: '21:00', end: '07:00' };

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Saved JSON can be anything: a broken value means "no quiet hours" (never hold by mistake). */
export function normalizeQuietHours(saved: unknown): QuietHours {
  const q = saved as Partial<QuietHours> | null;
  if (
    !q ||
    typeof q.enabled !== 'boolean' ||
    typeof q.start !== 'string' ||
    typeof q.end !== 'string' ||
    !TIME_PATTERN.test(q.start) ||
    !TIME_PATTERN.test(q.end)
  ) {
    return NO_QUIET_HOURS;
  }
  return { enabled: q.enabled, start: q.start, end: q.end };
}

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutes since midnight in Nairobi, e.g. 19:30 UTC -> 22:30 Nairobi -> 1350. */
export function nairobiMinutes(now: Date): number {
  const parts = clock.formatToParts(now);
  const part = (type: 'hour' | 'minute') => Number(parts.find((p) => p.type === type)!.value);
  return part('hour') * 60 + part('minute');
}

/** True when `now` falls inside the quiet hours. */
export function isQuietTime(quietHours: QuietHours, now: Date): boolean {
  if (!quietHours.enabled) return false;
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  if (start === end) return false;
  const minute = nairobiMinutes(now);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * When the current quiet hours end (the next "end" time, to the minute), or null if `now` is
 * not in quiet hours. Kenya has no daylight saving time, so adding minutes is exact.
 */
export function quietHoursEndAt(quietHours: QuietHours, now: Date): Date | null {
  if (!isQuietTime(quietHours, now)) return null;
  const minutesLeft = (toMinutes(quietHours.end) - nairobiMinutes(now) + DAY_MINUTES) % DAY_MINUTES;
  const startOfMinute = now.getTime() - (now.getTime() % 60_000);
  return new Date(startOfMinute + minutesLeft * 60_000);
}
