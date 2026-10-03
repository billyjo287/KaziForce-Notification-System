import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import sw from './locales/sw.json';
import adminEn from './locales/admin.en.json';
import adminSw from './locales/admin.sw.json';
import employerDeliveryEn from './locales/employerDelivery.en.json';
import employerDeliverySw from './locales/employerDelivery.sw.json';
import employerEn from './locales/employer.en.json';
import employerSw from './locales/employer.sw.json';
import messagesEn from './locales/messages.en.json';
import messagesSw from './locales/messages.sw.json';
import profileEn from './locales/profile.en.json';
import profileSw from './locales/profile.sw.json';
import landingEn from './locales/landing.en.json';
import landingSw from './locales/landing.sw.json';
import onboardingEn from './locales/onboarding.en.json';
import onboardingSw from './locales/onboarding.sw.json';
import settingsPageEn from './locales/settingsPage.en.json';
import settingsPageSw from './locales/settingsPage.sw.json';
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
    expect(keys(settingsPageSw).sort()).toEqual(keys(settingsPageEn).sort());
    expect(keys(employerSw).sort()).toEqual(keys(employerEn).sort());
    expect(keys(messagesSw).sort()).toEqual(keys(messagesEn).sort());
    expect(keys(profileSw).sort()).toEqual(keys(profileEn).sort());
    expect(keys(landingSw).sort()).toEqual(keys(landingEn).sort());
    expect(keys(onboardingSw).sort()).toEqual(keys(onboardingEn).sort());
    expect(keys(employerDeliverySw).sort()).toEqual(keys(employerDeliveryEn).sort());
  });

  it('no Kiswahili text is empty', () => {
    const empty = keys(sw).filter((key) => {
      const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], sw);
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});
