// Quiet hours (PRD FR-5) without a database: Nairobi time, midnight, and the exact edges.
import { describe, expect, it } from 'vitest';
import {
  isQuietTime,
  nairobiMinutes,
  normalizeQuietHours,
  quietHoursEndAt,
} from '../src/preferences/quietHours.js';

/** A moment given in Nairobi time (UTC+3 all year: Kenya has no daylight saving time). */
const nairobi = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`);

const night = { enabled: true, start: '22:00', end: '06:00' };
const afternoon = { enabled: true, start: '13:00', end: '15:00' };

describe('quiet hours', () => {
  it('reads the clock in Nairobi, not UTC or the computer time zone', () => {
    expect(nairobiMinutes(new Date('2026-10-02T19:30:00Z'))).toBe(22 * 60 + 30);
    expect(nairobiMinutes(new Date('2026-10-02T21:00:00Z'))).toBe(0); // midnight in Nairobi
  });

  it('22:00-06:00 crosses midnight: quiet from 22:00 up to 05:59', () => {
    const cases: [string, boolean][] = [
      ['21:59', false],
      ['22:00', true], // the start minute is quiet
      ['23:59', true],
      ['00:00', true],
      ['03:15', true],
      ['05:59', true],
      ['06:00', false], // the end minute is not: the morning has begun
      ['12:00', false],
    ];
    for (const [time, quiet] of cases) {
      expect(isQuietTime(night, nairobi('2026-10-02', time)), time).toBe(quiet);
    }
  });

  it('a same-day range (13:00-15:00) is quiet only in between', () => {
    expect(isQuietTime(afternoon, nairobi('2026-10-02', '12:59'))).toBe(false);
    expect(isQuietTime(afternoon, nairobi('2026-10-02', '13:00'))).toBe(true);
    expect(isQuietTime(afternoon, nairobi('2026-10-02', '14:59'))).toBe(true);
    expect(isQuietTime(afternoon, nairobi('2026-10-02', '15:00'))).toBe(false);
    expect(isQuietTime(afternoon, nairobi('2026-10-02', '23:00'))).toBe(false);
  });

  it('switched off, or start = end, means never quiet', () => {
    expect(isQuietTime({ ...night, enabled: false }, nairobi('2026-10-02', '23:00'))).toBe(false);
    const same = { enabled: true, start: '22:00', end: '22:00' };
    expect(isQuietTime(same, nairobi('2026-10-02', '22:00'))).toBe(false);
    expect(quietHoursEndAt(same, nairobi('2026-10-02', '22:00'))).toBeNull();
  });

  it('held messages are released when the quiet hours end, the same night or the next morning', () => {
    // Before midnight: released at 06:00 the NEXT day.
    expect(quietHoursEndAt(night, nairobi('2026-10-02', '22:00'))).toEqual(
      nairobi('2026-10-03', '06:00'),
    );
    expect(quietHoursEndAt(night, nairobi('2026-10-02', '23:30'))).toEqual(
      nairobi('2026-10-03', '06:00'),
    );
    // After midnight: released at 06:00 the SAME day.
    expect(quietHoursEndAt(night, nairobi('2026-10-03', '00:00'))).toEqual(
      nairobi('2026-10-03', '06:00'),
    );
    expect(quietHoursEndAt(night, nairobi('2026-10-03', '05:59'))).toEqual(
      nairobi('2026-10-03', '06:00'),
    );
    // Seconds do not matter: released on the minute.
    expect(quietHoursEndAt(night, new Date('2026-10-02T20:15:42.123Z'))).toEqual(
      nairobi('2026-10-03', '06:00'),
    );
    // Outside quiet hours: nothing to wait for.
    expect(quietHoursEndAt(night, nairobi('2026-10-03', '06:00'))).toBeNull();
    expect(quietHoursEndAt(afternoon, nairobi('2026-10-02', '14:00'))).toEqual(
      nairobi('2026-10-02', '15:00'),
    );
  });

  it('a broken saved value means no quiet hours (never hold a message by mistake)', () => {
    expect(normalizeQuietHours(null).enabled).toBe(false);
    expect(normalizeQuietHours({ enabled: true, start: '25:00', end: '06:00' }).enabled).toBe(
      false,
    );
    expect(normalizeQuietHours({ enabled: true, start: '9:00', end: '06:00' }).enabled).toBe(false);
    expect(normalizeQuietHours(night)).toEqual(night);
  });
});
