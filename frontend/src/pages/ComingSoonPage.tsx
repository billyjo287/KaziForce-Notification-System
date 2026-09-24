import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui/EmptyState';
import { usePageTitle } from '../lib/usePageTitle';

/** Placeholder for pages built in later phases. `titleKey` is an i18n key, e.g. "nav.jobs". */
export function ComingSoonPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const title = t(titleKey);
  usePageTitle(title);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold">{title}</h1>
      <EmptyState
        icon={Construction}
        title={t('common.comingSoonTitle')}
        body={t('common.comingSoonBody')}
      />
    </div>
  );
}
