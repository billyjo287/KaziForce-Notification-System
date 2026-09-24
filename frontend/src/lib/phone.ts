/**
 * Turns what people type ("0712 345 678", "712345678", "+254 712 345678") into E.164
 * (+254712345678). Returns null if it is not a Kenyan mobile number.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  if (/^\+254[17]\d{8}$/.test(digits)) return digits;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
  return null;
}

/** "+254712345678" → "+254 712 345 678" (easier to read aloud and check). */
export function formatPhone(e164: string): string {
  const match = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return match ? `+254 ${match[1]} ${match[2]} ${match[3]}` : e164;
}
