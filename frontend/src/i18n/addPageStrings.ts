// Words used by only one part of the site (the admin pages, the component gallery) live in their
// own files and arrive with that part, so everyone else's first download stays small.
import i18n from './index';

type Strings = Record<string, unknown>;

/**
 * Adds a page's own words. They are added only to a language that is already loaded: adding
 * them earlier would make i18next think Kiswahili was loaded and skip downloading the rest.
 */
export function addPageStrings(en: Strings, sw: Strings) {
  const add = () => {
    for (const [lng, strings] of [
      ['en', en],
      ['sw', sw],
    ] as const) {
      if (i18n.hasResourceBundle(lng, 'translation')) {
        i18n.addResourceBundle(lng, 'translation', strings, true, false);
      }
    }
  };
  add();
  i18n.on('loaded', add);
}
