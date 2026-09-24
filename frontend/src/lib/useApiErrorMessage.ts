import { useTranslation } from 'react-i18next';
import { apiErrorCode } from './api';

/** Turns any API error into one plain sentence in the user's language. */
export function useApiErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown) => {
    const code = apiErrorCode(error);
    return t(`apiErrors.${code}`, { defaultValue: t('apiErrors.generic') });
  };
}
