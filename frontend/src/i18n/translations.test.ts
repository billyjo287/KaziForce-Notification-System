import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import sw from './locales/sw.json';
import adminEn from './locales/admin.en.json';
import adminSw from './locales/admin.sw.json';
import uiKitEn from './locales/uiKit.en.json';
import uiKitSw from './locales/uiKit.sw.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('English and Kiswahili have exactly the same keys (nothing left untranslated)', () => {
    expect(keys(sw).sort()).toEqual(keys(en).sort());
    expect(keys(uiKitSw).sort()).toEqual(keys(uiKitEn).sort());
    expect(keys(adminSw).sort()).toEqual(keys(adminEn).sort());
  });

  it('no Kiswahili text is empty', () => {
    const empty = keys(sw).filter((key) => {
      const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], sw);
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});
