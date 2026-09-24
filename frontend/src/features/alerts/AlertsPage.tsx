import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { usePageTitle } from '../../lib/usePageTitle';
import { AlertsDashboard } from './AlertsDashboard';
import type { AlertRole } from './types';
import { useAlerts } from './useAlerts';

export function AlertsPage({ role }: { role: AlertRole }) {
  const { t } = useTranslation();
  usePageTitle(t('alerts.title'));
  const { status, alerts, actions, refetch } = useAlerts();

  if (status === 'loading') {
    return (
      <div className="lg:max-w-md">
        <h1 className="text-3xl font-bold">{t('alerts.title')}</h1>
        <Skeleton className="mt-2 mb-6 h-5 w-56" />
        <CardListSkeleton count={4} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="lg:max-w-xl">
        <h1 className="mb-5 text-3xl font-bold">{t('alerts.title')}</h1>
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('alerts.error.title')}
          body={t('alerts.error.body')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      </div>
    );
  }

  return <AlertsDashboard role={role} alerts={alerts} actions={actions} />;
}
