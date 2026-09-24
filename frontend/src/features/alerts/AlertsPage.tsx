import { CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { usePageTitle } from '../../lib/usePageTitle';
import { AlertsDashboard } from './AlertsDashboard';
import { useAlertsStore } from './alertsStore';
import { createIncomingAlert } from './mockAlerts';
import type { AlertRole } from './types';

// Design-phase demo: one new urgent alert "arrives" after a short wait, to show the slide-in.
// Skipped in automated tests (and browsers driven by test tools) so results stay predictable.
const LIVE_DEMO_DELAY_MS = 12_000;
const liveDemoEnabled = import.meta.env.MODE !== 'test' && !navigator.webdriver;
let liveDemoShown = false;

export function AlertsPage({ role }: { role: AlertRole }) {
  const { t } = useTranslation();
  usePageTitle(t('alerts.title'));
  const status = useAlertsStore((s) => s.status[role]);
  const alerts = useAlertsStore((s) => s.alerts[role]);
  const load = useAlertsStore((s) => s.load);
  const add = useAlertsStore((s) => s.add);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    load(role);
  }, [load, role]);

  useEffect(() => {
    if (role !== 'worker' || status !== 'ready' || !liveDemoEnabled || liveDemoShown) return;
    const timer = setTimeout(() => {
      liveDemoShown = true;
      const alert = createIncomingAlert();
      add(role, alert);
      setAnnouncement(
        t('alerts.newAlertAnnouncement', { priority: t('priority.urgent'), title: alert.title }),
      );
    }, LIVE_DEMO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [add, role, status, t]);

  return (
    <>
      {/* Screen readers hear new alerts without losing their place. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {status === 'loading' && (
        <div className="lg:max-w-md">
          <h1 className="text-3xl font-bold">{t('alerts.title')}</h1>
          <Skeleton className="mt-2 mb-6 h-5 w-56" />
          <CardListSkeleton count={4} />
        </div>
      )}

      {status === 'error' && (
        <div className="lg:max-w-xl">
          <h1 className="mb-5 text-3xl font-bold">{t('alerts.title')}</h1>
          <EmptyState
            role="alert"
            icon={CloudOff}
            title={t('alerts.error.title')}
            body={t('alerts.error.body')}
            action={
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {t('common.tryAgain')}
              </Button>
            }
          />
        </div>
      )}

      {status === 'ready' && <AlertsDashboard role={role} alerts={alerts} />}
    </>
  );
}
