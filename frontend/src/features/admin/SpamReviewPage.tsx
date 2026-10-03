import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import { useConfirmSpam, useReleaseSpam, useSpamQueue, type SpamItem } from './adminApi';
import { PriorityDialog } from './PriorityDialog';
import { LoadError } from './shared';

/** "payment_request" -> "payment request" (the classifier's reasons, in plain-ish words). */
const reason = (feature: string) => feature.replace(/_/g, ' ');

/**
 * Spam review (PRD FR-3): alerts the classifier blocked. "Yes, it is spam" keeps it blocked;
 * "Not spam" delivers it now, with the priority the admin chooses. Both are saved as training
 * labels.
 */
export default function SpamReviewPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.spam.title'));
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useSpamQueue(page);
  const [releasing, setReleasing] = useState<SpamItem | null>(null);
  const release = useReleaseSpam();
  const errorMessage = useApiErrorMessage();

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t('admin.spam.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.spam.intro')}</p>
      {isPending && <CardListSkeleton count={3} />}
      {isError && <LoadError title={t('admin.spam.errorTitle')} onRetry={() => void refetch()} />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title={t('admin.spam.emptyTitle')}
          body={t('admin.spam.emptyBody')}
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <SpamCard item={item} onRelease={() => setReleasing(item)} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={setPage}
          />
        </>
      )}

      <PriorityDialog
        open={releasing !== null}
        onOpenChange={(open) => !open && setReleasing(null)}
        title={t('admin.spam.releaseTitle', {
          title: releasing?.title ?? '',
          name: releasing?.recipient.name ?? '',
        })}
        description={t('admin.spam.releaseBody')}
        initial={releasing?.predictedPriority ?? 'medium'}
        confirmLabel={t('admin.spam.releaseConfirm')}
        onConfirm={async (priority) => {
          if (!releasing) return;
          try {
            await release.mutateAsync({ id: releasing.id, priority });
            showToast({ message: t('admin.spam.released', { name: releasing.recipient.name }) });
          } catch (e) {
            throw new Error(errorMessage(e), { cause: e });
          }
        }}
      />
    </div>
  );
}

function SpamCard({ item, onRelease }: { item: SpamItem; onRelease: () => void }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirmSpam();
  const errorMessage = useApiErrorMessage();
  const reasons = (item.explanation ?? []).map((e) => reason(e.feature));
  const percent =
    item.spamScore === null
      ? null
      : new Intl.NumberFormat(i18n.language === 'sw' ? 'sw-KE' : 'en-KE', {
          style: 'percent',
        }).format(item.spamScore);

  return (
    <article
      aria-labelledby={`spam-${item.id}`}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <div>
        <h2 id={`spam-${item.id}`} className="text-lg font-bold break-words">
          {item.title}
        </h2>
        <p className="text-ink-muted">
          {item.sender
            ? t('admin.spam.from', { name: item.sender.name })
            : t('admin.spam.fromSystem')}
          {' · '}
          {t('admin.spam.to', { name: item.recipient.name })}
          {' · '}
          {relativeTime(new Date(item.createdAt), i18n.language)}
        </p>
      </div>
      <blockquote className="rounded-lg border-l-4 border-urgent bg-canvas p-3 break-words whitespace-pre-line">
        {item.message}
      </blockquote>
      <p>
        {percent && <span className="font-bold">{t('admin.spam.score', { percent })}</span>}
        {reasons.length > 0 && (
          <>
            {percent && ' · '}
            {t('admin.spam.why', { reasons: reasons.join(', ') })}
          </>
        )}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() =>
            confirm.mutate(item.id, {
              onSuccess: () => showToast({ message: t('admin.spam.confirmed') }),
              onError: (e) => showToast({ message: errorMessage(e) }),
            })
          }
          disabled={confirm.isPending}
        >
          {t('admin.spam.confirm')}
        </Button>
        <Button variant="secondary" onClick={onRelease}>
          {t('admin.spam.release')}
        </Button>
      </div>
    </article>
  );
}
