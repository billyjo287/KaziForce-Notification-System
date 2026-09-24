import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Sets the browser tab title, e.g. "Alerts · KaziForce" (WCAG 2.4.2). */
export function usePageTitle(page: string) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t('app.pageTitle', { page });
  }, [page, t]);
}
