import { CircleCheck, CircleX, Clock, Send, ShieldCheck, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import { PriorityBadge } from '../alerts/PriorityBadge';
import {
  useCorrectPriority,
  useDeliveryLogs,
  type DeliveryLogRow,
  type DeliveryStatus,
} from './adminApi';
import { ANY, useParamSetter } from './params';
import { PriorityDialog } from './PriorityDialog';
import { LoadError } from './shared';

const CHANNELS = ['in_app', 'whatsapp', 'sms', 'email'] as const;
const STATUSES: DeliveryStatus[] = ['pending', 'sent', 'delivered', 'failed'];
const STATUS_STYLE: Record<DeliveryStatus, { tone: BadgeTone; icon: typeof Send }> = {
  pending: { tone: 'neutral', icon: Clock },
  sent: { tone: 'neutral', icon: Send },
  delivered: { tone: 'success', icon: CircleCheck },
  failed: { tone: 'urgent', icon: CircleX },
};

/** Delivery log (PRD FR-7): every try, with filters kept in the address. */
export default function DeliveryLogsPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.logs.title'));
  const { params, set } = useParamSetter();
  const [, setParams] = useSearchParams();
  const filters = {
    channel: params.get('channel') ?? undefined,
    status: params.get('status') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    page: Number(params.get('page') ?? 1) || 1,
  };
  const { data, isPending, isError, refetch } = useDeliveryLogs(filters);
  const [correcting, setCorrecting] = useState<DeliveryLogRow | null>(null);
  const correct = useCorrectPriority();
  const errorMessage = useApiErrorMessage();
  const filtered = filters.channel || filters.status || filters.from || filters.to;

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold">{t('admin.logs.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.logs.intro')}</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label={t('admin.logs.channel')}
          value={filters.channel ?? ANY}
          onValueChange={(v) => set('channel', v === ANY ? undefined : v)}
          options={[
            { value: ANY, label: t('common.any') },
            ...CHANNELS.map((c) => ({ value: c, label: t(`admin.channels.${c}`) })),
          ]}
        />
        <Select
          label={t('admin.logs.status')}
          value={filters.status ?? ANY}
          onValueChange={(v) => set('status', v === ANY ? undefined : v)}
          options={[
            { value: ANY, label: t('common.any') },
            ...STATUSES.map((s) => ({ value: s, label: t(`admin.deliveryStatus.${s}`) })),
          ]}
        />
        <Input
          type="date"
          label={t('admin.logs.from')}
          help={t('admin.logs.fromHelp')}
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(e) => set('from', e.target.value || undefined)}
        />
        <Input
          type="date"
          label={t('admin.logs.to')}
          help={t('admin.logs.toHelp')}
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(e) => set('to', e.target.value || undefined)}
        />
      </div>
      {filtered && (
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => setParams({})}>
          {t('admin.logs.clear')}
        </Button>
      )}

      {isPending && <CardListSkeleton count={4} />}
      {isError && <LoadError title={t('admin.logs.errorTitle')} onRetry={() => void refetch()} />}
      {data?.items.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={t('admin.logs.emptyTitle')}
          body={t('admin.logs.emptyBody')}
        />
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {data.items.map((row) => (
              <li key={row.id}>
                <LogRow row={row} onCorrect={() => setCorrecting(row)} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={(p) => set('page', String(p))}
          />
        </>
      )}

      <PriorityDialog
        open={correcting !== null}
        onOpenChange={(open) => !open && setCorrecting(null)}
        title={t('admin.correct.title', { title: correcting?.notification.title ?? '' })}
        description={t('admin.correct.body')}
        initial={correcting?.notification.priority ?? 'medium'}
        confirmLabel={t('admin.correct.save')}
        onConfirm={async (priority) => {
          if (!correcting) return;
          try {
            await correct.mutateAsync({ id: correcting.notification.id, priority });
            showToast({ message: t('admin.correct.saved') });
          } catch (e) {
            throw new Error(errorMessage(e), { cause: e });
          }
        }}
      />
    </div>
  );
}

function LogRow({ row, onCorrect }: { row: DeliveryLogRow; onCorrect: () => void }) {
  const { t, i18n } = useTranslation();
  const style = STATUS_STYLE[row.status];
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={style.tone} icon={style.icon}>
          {t(`admin.deliveryStatus.${row.status}`)}
        </Badge>
        <Badge>{t(`admin.channels.${row.channel}`)}</Badge>
        <span className="text-ink-muted">{t('admin.logs.try', { count: row.attempt })}</span>
        {row.isEscalation && <Badge icon={ShieldCheck}>{t('admin.logs.safetyNet')}</Badge>}
        <span className="ml-auto text-ink-muted">
          {relativeTime(new Date(row.createdAt), i18n.language)}
        </span>
      </div>
      <h2 className="text-lg font-bold break-words">{row.notification.title}</h2>
      <p className="text-ink-muted">
        {t('admin.logs.to_person', { name: row.notification.recipient.name })}
        {row.openedAt &&
          ` · ${t('admin.logs.opened', { when: relativeTime(new Date(row.openedAt), i18n.language) })}`}
      </p>
      {row.error && <p className="font-bold break-words text-urgent">{row.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <PriorityBadge priority={row.notification.priority} />
        {row.notification.corrected && (
          <span className="text-ink-muted">{t('admin.logs.corrected')}</span>
        )}
        <Button variant="secondary" className="ml-auto" onClick={onCorrect}>
          {t('admin.logs.correct')}
        </Button>
      </div>
    </article>
  );
}
