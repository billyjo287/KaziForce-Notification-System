const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/**
 * "12 minutes ago", "in 38 minutes", "yesterday" (or "dakika 12 zilizopita" in Kiswahili).
 * Uses the browser's built-in translations, so it needs no extra text files.
 */
export function relativeTime(date: Date, language: string, now = Date.now()): string {
  const diff = date.getTime() - now;
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'minute') {
      return format.format(Math.round(diff / ms), unit);
    }
  }
  return format.format(0, 'minute');
}
