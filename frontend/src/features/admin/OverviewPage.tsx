import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { HelpText } from '../../components/ui/Field';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { usePageTitle } from '../../lib/usePageTitle';
import { useOverview, type ChannelRate, type Overview } from './adminApi';
import { LoadError } from './shared';

type Period = 'last24h' | 'last7d';

/**
 * Admin overview (PRD section 6): big numbers first, then one "got through" meter per channel,
 * the queues as a small table, and the latest failures. Meters and numbers instead of a
 * coloured chart: every value is written out, so nothing depends on telling colours apart.
 */
export default function OverviewPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('admin.overview.title'));
  const { data, isPending, isError, refetch } = useOverview();

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold">{t('admin.overview.title')}</h1>
      <p className="mt-2 text-lg text-ink-muted">{t('admin.overview.intro')}</p>
      {data && (
        <p className="mt-1 text-ink-muted" aria-live="polite">
          {t('admin.overview.updated', {
            when: relativeTime(new Date(data.generatedAt), i18n.language),
          })}
        </p>
      )}
      <div className="mt-6">
        {isPending && <CardListSkeleton count={3} />}
        {isError && (
          <LoadError title={t('admin.overview.errorTitle')} onRetry={() => void refetch()} />
        )}
        {data && <OverviewBody data={data} />}
      </div>
    </div>
  );
}

function OverviewBody({ data }: { data: Overview }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-8">
      <section aria-label={t('admin.overview.title')}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label={t('admin.overview.tiles.notifications')} value={data.today.notifications} />
          <Tile label={t('admin.overview.tiles.spamBlocked')} value={data.today.spamBlocked} />
          <Tile
            label={t('admin.overview.tiles.failed')}
            value={data.today.failedDeliveries}
            warn={data.today.failedDeliveries > 0}
            link={
              data.today.failedDeliveries > 0
                ? {
                    to: '/admin/delivery-logs?status=failed',
                    label: t('admin.overview.failures.all'),
                  }
                : undefined
            }
          />
          <Tile
            label={t('admin.overview.tiles.spamWaiting')}
            value={data.spamWaiting}
            warn={data.spamWaiting > 0}
            link={
              data.spamWaiting > 0
                ? { to: '/admin/spam', label: t('admin.overview.review') }
                : undefined
            }
          />
          <Tile label={t('admin.overview.tiles.held')} value={data.heldNow} />
        </ul>
      </section>

      <ChannelRates channels={data.channels} />
      <Queues queues={data.queues} />
      <RecentFailures failures={data.recentFailures} />
    </div>
  );
}

/** One big number with a plain label (and an icon + words when it needs attention). */
function Tile({
  label,
  value,
  warn = false,
  link,
}: {
  label: string;
  value: number;
  warn?: boolean;
  link?: { to: string; label: string };
}) {
  const { i18n } = useTranslation();
  return (
    <li
      className={`flex flex-col gap-1 rounded-xl border bg-surface p-4 ${warn ? 'border-urgent' : 'border-line'}`}
    >
      <span className="flex items-center gap-2 text-ink-muted">
        {warn && <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-urgent" />}
        {label}
      </span>
      <span className="text-4xl font-bold tabular-nums">
        {value.toLocaleString(i18n.language === 'sw' ? 'sw-KE' : 'en-KE')}
      </span>
      {link && (
        <Link
          to={link.to}
          className="mt-1 inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary underline underline-offset-4"
        >
          {link.label}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </li>
  );
}

function ChannelRates({ channels }: { channels: Overview['channels'] }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('last24h');
  return (
    <Card>
      <section aria-labelledby="rates-title" className="flex flex-col gap-4">
        <div>
          <h2 id="rates-title" className="text-xl font-bold">
            {t('admin.overview.rates.title')}
          </h2>
          <HelpText id="rates-help">{t('admin.overview.rates.help')}</HelpText>
        </div>
        <ChoiceCards<Period>
          legend={t('admin.overview.rates.period')}
          name="rate-period"
          value={period}
          onChange={setPeriod}
          columns={2}
          choices={[
            { value: 'last24h', label: t('admin.overview.rates.last24h') },
            { value: 'last7d', label: t('admin.overview.rates.last7d') },
          ]}
        />
        <ul className="flex flex-col gap-5">
          {channels[period].map((rate) => (
            <RateMeter key={rate.channel} rate={rate} />
          ))}
        </ul>
      </section>
    </Card>
  );
}

/** A meter: the share that got through, on a track of the same hue. The number is written too. */
function RateMeter({ rate }: { rate: ChannelRate }) {
  const { t, i18n } = useTranslation();
  const channel = t(`admin.channels.${rate.channel}`);
  const total = rate.delivered + rate.failed;
  const percent =
    rate.rate === null
      ? null
      : new Intl.NumberFormat(i18n.language === 'sw' ? 'sw-KE' : 'en-KE', {
          style: 'percent',
          maximumFractionDigits: rate.rate > 0.99 && rate.rate < 1 ? 1 : 0,
        }).format(rate.rate);
  const extra = [
    rate.failed > 0 && t('admin.overview.rates.failed', { count: rate.failed }),
    rate.pending > 0 && t('admin.overview.rates.pending', { count: rate.pending }),
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">{channel}</span>
        <span className="text-2xl font-bold tabular-nums">{percent ?? '—'}</span>
      </div>
      {rate.rate !== null && (
        <div
          role="meter"
          aria-label={t('admin.overview.rates.meter', { channel, percent })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(rate.rate * 100)}
          className="h-3 overflow-hidden rounded-full bg-primary-soft"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(rate.rate * 100, rate.rate > 0 ? 2 : 0)}%` }}
          />
        </div>
      )}
      <p className="text-ink-muted">
        {total === 0 && rate.pending === 0
          ? t('admin.overview.rates.none')
          : [t('admin.overview.rates.detail', { delivered: rate.delivered, total }), ...extra].join(
              ' · ',
            )}
      </p>
    </li>
  );
}

function Queues({ queues }: { queues: Overview['queues'] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <section aria-labelledby="queues-title">
        <h2 id="queues-title" className="text-xl font-bold">
          {t('admin.overview.queues.title')}
        </h2>
        <HelpText id="queues-help">{t('admin.overview.queues.help')}</HelpText>
        {queues === null ? (
          <p role="alert" className="mt-4 flex items-center gap-2 font-bold text-urgent">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
            {t('admin.overview.queues.error')}
          </p>
        ) : (
          <div className="mt-4">
            {/* Phones: a simple list (four columns do not fit 360 px). Wider screens: a table. */}
            <ul className="flex flex-col gap-3 sm:hidden">
              {queues.map((q) => (
                <li key={q.name} className="border-b border-line pb-2">
                  <p className="font-bold">
                    {t(`admin.overview.queues.names.${q.name}`, { defaultValue: q.name })}
                  </p>
                  <p>
                    {t('admin.overview.queues.waiting')}: {q.waiting} ·{' '}
                    {t('admin.overview.queues.scheduled')}: {q.scheduled} ·{' '}
                    <span className={q.failed > 0 ? 'font-bold text-urgent' : ''}>
                      {t('admin.overview.queues.failed')}: {q.failed}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <table className="hidden w-full border-collapse text-left sm:table">
              <thead>
                <tr className="border-b-2 border-line-strong">
                  <th scope="col" className="py-2 pr-3 align-bottom">
                    {t('admin.overview.queues.queue')}
                  </th>
                  {(['waiting', 'scheduled', 'failed'] as const).map((key) => (
                    <th key={key} scope="col" className="px-2 py-2 text-right align-bottom">
                      {t(`admin.overview.queues.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.name} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {t(`admin.overview.queues.names.${q.name}`, { defaultValue: q.name })}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">{q.waiting}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{q.scheduled}</td>
                    <td
                      className={`px-2 py-2 text-right tabular-nums ${q.failed > 0 ? 'font-bold text-urgent' : ''}`}
                    >
                      {q.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Card>
  );
}

function RecentFailures({ failures }: { failures: Overview['recentFailures'] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <section aria-labelledby="failures-title">
        <h2 id="failures-title" className="mb-3 text-xl font-bold">
          {t('admin.overview.failures.title')}
        </h2>
        {failures.length === 0 ? (
          <p>{t('admin.overview.failures.none')}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {failures.map((f) => (
                <li key={f.id} className="border-l-4 border-urgent pl-3">
                  <p className="font-bold">
                    {t(`admin.channels.${f.channel}`)}: {f.notification.title}
                  </p>
                  {f.error && <p className="break-words">{f.error}</p>}
                  <p className="text-ink-muted">{relativeTime(new Date(f.at), i18n.language)}</p>
                </li>
              ))}
            </ul>
            <Link
              to="/admin/delivery-logs?status=failed"
              className="mt-4 inline-flex min-h-11 items-center gap-1 font-bold text-primary underline underline-offset-4"
            >
              {t('admin.overview.failures.all')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </section>
    </Card>
  );
}
