// The design refresh's friendly lines (loader, empty states, success, offline, 404, errors) arrive
// with the components that show them. English and Kiswahili (i18n/locales/brand.*.json).
import { addPageStrings } from '../../i18n/addPageStrings';
import brandEn from '../../i18n/locales/brand.en.json';
import brandSw from '../../i18n/locales/brand.sw.json';

addPageStrings(brandEn, brandSw);
