import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { api } from '../../lib/api';
import type { ApiNotification } from '../../types/api';
import { AlertCard } from './AlertCard';
import { toAlert } from './useAlerts';
import type { Alert } from './types';

/**
 * Search results for the Alerts page (SRS FR-NOT-027): every word typed must appear in the
 * alert's title or text, across the person's whole history (the server searches, not only the
 * newest 200 shown in the tabs). Loaded only when someone searches, so the app's first download
 * stays small. Waits until typing pauses (300 ms) before asking the server.
 */
export default function AlertSearchResults({
  query,
  selectedId,
  onOpen,
}: {
  query: string;
  selectedId: string | null;
  onOpen: (alert: Alert) => void;
}) {
  const { t } = useTranslation();
  const [words, setWords] = useState(query);
  useEffect(() => {
    const id = window.setTimeout(() => setWords(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const results = useQuery({
    queryKey: ['notifications', 'search', words],
    queryFn: async () =>
      (
        await api.get<{ items: ApiNotification[] }>('/notifications', { params: { q: words } })
      ).data.items
        .map(toAlert)
        .filter((a) => !a.markedNotImportant),
  });

  if (results.isPending) return <CardListSkeleton count={2} />;
  if (results.isError) {
    return (
      <EmptyState
        role="alert"
        icon={SearchX}
        title={t('alerts.search.errorTitle')}
        body={t('alerts.search.errorBody')}
      />
    );
  }
  const found = results.data;
  return (
    <div>
      <p role="status" className="mb-4 font-bold">
        {t('alerts.search.count', { count: found.length, words })}
      </p>
      {found.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t('alerts.search.noneTitle')}
          body={t('alerts.search.noneBody')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {found.map((alert) => (
            <li key={alert.id}>
              <AlertCard
                alert={alert}
                selected={alert.id === selectedId}
                onOpen={() => onOpen(alert)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
