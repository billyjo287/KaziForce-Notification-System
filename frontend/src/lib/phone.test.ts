import { describe, expect, it } from 'vitest';
import { safeNext } from '../features/auth/safeNext';
import { formatPhone, normalizeKenyanPhone } from './phone';

describe('normalizeKenyanPhone', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['0712 345 678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254 712-345-678', '+254712345678'],
    ['0110 123 456', '+254110123456'],
  ])('%s becomes %s', (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(['12345', '0812345678', '+255712345678', 'hello'])('rejects %s', (input) => {
    expect(normalizeKenyanPhone(input)).toBeNull();
  });

  it('formats for reading', () => {
    expect(formatPhone('+254712345678')).toBe('+254 712 345 678');
  });
});

describe('safeNext', () => {
  it('only follows links on this site', () => {
    expect(safeNext('/worker/jobs')).toBe('/worker/jobs');
    expect(safeNext('//evil.example.com')).toBeNull();
    expect(safeNext('https://evil.example.com')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
