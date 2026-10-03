import { BrainCircuit, CircleCheck, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import { downloadTrainingData, useModels, type ModelVersion } from './adminApi';
import { LoadError } from './shared';

/** Model versions (MLMetadata) and the anonymised training data download (PRD FR-9). */
export default function ModelsPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.models.title'));
  const { data, isPending, isError, refetch } = useModels();

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t('admin.models.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.models.intro')}</p>
      {isPending && <CardListSkeleton count={2} />}
      {isError && <LoadError title={t('admin.models.errorTitle')} onRetry={() => void refetch()} />}
      {data?.length === 0 && (
        <EmptyState
          icon={BrainCircuit}
          title={t('admin.models.emptyTitle')}
          body={t('admin.models.emptyBody')}
        />
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.map((model) => (
            <li key={model.id}>
              <ModelCard model={model} />
            </li>
          ))}
        </ul>
      )}
      <TrainingExport />
    </div>
  );
}

function ModelCard({ model }: { model: ModelVersion }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sw' ? 'sw-KE' : 'en-KE';
  const number = (n: number) => n.toLocaleString(locale);
  const day = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          timeZone: 'Africa/Nairobi',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
  const metrics = Object.entries(model.metrics ?? {});

  return (
    <article
      aria-labelledby={`model-${model.id}`}
      className={`rounded-xl border bg-surface p-4 ${model.isActive ? 'border-primary' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`model-${model.id}`} className="font-mono text-xl font-bold">
          {model.version}
        </h2>
        {model.isActive && (
          <Badge tone="success" icon={CircleCheck}>
            {t('admin.models.active')}
          </Badge>
        )}
        <span className="text-ink-muted">
          {t(`admin.models.algorithms.${model.algorithm}`, { defaultValue: model.algorithm })}
        </span>
      </div>
      {model.description && <p className="mt-2">{model.description}</p>}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="font-bold">{t('admin.models.classified')}</dt>
          <dd className="text-2xl font-bold tabular-nums">{number(model.classified)}</dd>
        </div>
        <div>
          <dt className="font-bold">{t('admin.models.corrected')}</dt>
          <dd className="text-2xl font-bold tabular-nums">{number(model.corrected)}</dd>
        </div>
        <div>
          <dt className="font-bold">{t('admin.models.fallback')}</dt>
          <dd>
            <span className="text-2xl font-bold tabular-nums">{number(model.fallback)}</span>
            <span className="block text-ink-muted">{t('admin.models.fallbackHelp')}</span>
          </dd>
        </div>
        <div>
          <dt className="font-bold">
            {model.trainedAt ? t('admin.models.trained') : t('admin.models.since')}
          </dt>
          <dd>{day(model.trainedAt ?? model.deployedAt)}</dd>
        </div>
      </dl>
      <h3 className="mt-4 font-bold">{t('admin.models.metrics')}</h3>
      {metrics.length === 0 ? (
        <p className="text-ink-muted">{t('admin.models.noMetrics')}</p>
      ) : (
        <dl className="mt-1 grid gap-x-4 sm:grid-cols-2">
          {metrics.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-b border-line py-1">
              <dt>{key.replace(/_/g, ' ')}</dt>
              <dd className="font-bold tabular-nums">
                {typeof value === 'number' ? value.toLocaleString(locale) : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function TrainingExport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const errorMessage = useApiErrorMessage();

  async function download() {
    setBusy(true);
    setError(undefined);
    try {
      await downloadTrainingData({ from: from || undefined, to: to || undefined });
      showToast({ message: t('admin.export.done') });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8">
      <section aria-labelledby="export-title" className="flex flex-col gap-4">
        <h2 id="export-title" className="text-xl font-bold">
          {t('admin.export.title')}
        </h2>
        <p>{t('admin.export.body')}</p>
        {error && <FormAlert>{error}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="date"
            label={t('admin.export.from')}
            help={t('admin.export.fromHelp')}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            label={t('admin.export.to')}
            help={t('admin.export.toHelp')}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button className="self-start" onClick={() => void download()} disabled={busy}>
          <Download aria-hidden="true" className="size-5" />
          {busy ? t('admin.export.busy') : t('admin.export.button')}
        </Button>
      </section>
    </Card>
  );
}
