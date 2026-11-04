import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { HelpText } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { apiErrorCode } from '../../lib/api';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import {
  useNotificationRules,
  useSaveWording,
  useSetRule,
  useWording,
  type RuleCategory,
  type WordingRow,
} from './adminApi';
import { LoadError } from './shared';

const CATEGORIES: RuleCategory[] = [
  'new_job',
  'application_update',
  'new_applicant',
  'message',
  'announcement',
];
/** The same limit as the server (backend/src/channels/wording.ts): the SMS stays one message. */
const WORDING_MAX = 80;
/** What a real tracked link looks like, for the preview. */
const SAMPLE_LINK = 'https://api.kaziforce.co.ke/o/k7Qp2xZa';
const SMS_WORDS = {
  en: { urgent: 'Act now', open: 'Open' },
  sw: { urgent: 'Sasa hivi', open: 'Fungua' },
} as const;

/**
 * Notification rules (ADR 0016), one page with two parts:
 *   Always send   alert types people cannot switch off (SRS FR-NOT-035)
 *   Wording       the one-line summary every SMS and email is built from, per type, language and
 *                 urgency (FR-NOT-003, FR-NOT-011). Each save is a new version; old ones are kept.
 * Every change is in the audit log.
 */
export default function NotificationRulesPage() {
  const { t } = useTranslation();
  usePageTitle(t('admin.rules.title'));
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">{t('admin.rules.title')}</h1>
      <p className="mt-2 mb-6 text-lg text-ink-muted">{t('admin.rules.intro')}</p>
      <AlwaysSend />
      <Wording />
    </div>
  );
}

function AlwaysSend() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useNotificationRules();
  const setRule = useSetRule();

  function change(category: RuleCategory, mandatory: boolean) {
    setRule.mutate(
      { category, mandatory },
      {
        onSuccess: () =>
          showToast({
            message: t(
              mandatory ? 'admin.rules.always.madeMandatory' : 'admin.rules.always.madeOptional',
              {
                type: t(`admin.rules.types.${category}`),
              },
            ),
            actionLabel: t('common.undo'),
            onAction: () => setRule.mutate({ category, mandatory: !mandatory }),
          }),
        onError: () => showToast({ message: t('admin.rules.saveError') }),
      },
    );
  }

  return (
    <Card className="mb-6">
      <section aria-labelledby="always-title" aria-describedby="always-help">
        <h2 id="always-title" className="text-xl font-bold">
          {t('admin.rules.always.title')}
        </h2>
        <HelpText id="always-help">{t('admin.rules.always.help')}</HelpText>
        <div className="mt-5 flex flex-col gap-5">
          {isPending && <CardListSkeleton count={2} />}
          {isError && (
            <LoadError title={t('admin.rules.loadError')} onRetry={() => void refetch()} />
          )}
          {data?.map((rule) => (
            <Switch
              key={rule.category}
              label={t(`admin.rules.types.${rule.category}`)}
              help={
                rule.mandatory ? t('admin.rules.always.onHelp') : t('admin.rules.always.offHelp')
              }
              checked={rule.mandatory}
              onCheckedChange={(on) => change(rule.category, on)}
            />
          ))}
        </div>
      </section>
    </Card>
  );
}

function Wording() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useWording();
  const [category, setCategory] = useState<RuleCategory>('new_job');
  const [language, setLanguage] = useState<'en' | 'sw'>('en');
  const rows = data?.filter((r) => r.category === category && r.language === language) ?? [];

  return (
    <Card>
      <section aria-labelledby="wording-title" aria-describedby="wording-help">
        <h2 id="wording-title" className="text-xl font-bold">
          {t('admin.rules.wording.title')}
        </h2>
        <HelpText id="wording-help">{t('admin.rules.wording.help')}</HelpText>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label={t('admin.rules.wording.type')}
            value={category}
            options={CATEGORIES.map((value) => ({
              value,
              label: t(`admin.rules.types.${value}`),
            }))}
            onValueChange={(value) => setCategory(value as RuleCategory)}
          />
          <Select
            label={t('admin.rules.wording.language')}
            value={language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'sw', label: 'Kiswahili' },
            ]}
            onValueChange={(value) => setLanguage(value as 'en' | 'sw')}
          />
        </div>
        <div className="mt-6 flex flex-col gap-8">
          {isPending && <CardListSkeleton count={2} />}
          {isError && (
            <LoadError title={t('admin.rules.loadError')} onRetry={() => void refetch()} />
          )}
          {rows.map((row) => (
            <WordingEditor
              key={`${row.category}-${row.language}-${row.urgent}-${row.version}`}
              row={row}
            />
          ))}
        </div>
      </section>
    </Card>
  );
}

function WordingEditor({ row }: { row: WordingRow }) {
  const { t, i18n } = useTranslation();
  const save = useSaveWording();
  const current = row.text ?? row.defaultText;
  const [text, setText] = useState(current);
  const trimmed = text.trim();
  const tooLong = trimmed.length > WORDING_MAX;
  const tooShort = trimmed.length < 3;
  const words = SMS_WORDS[row.language];
  const label = row.urgent ? `KaziForce (${words.urgent})` : 'KaziForce';
  const sms = `${label}: ${trimmed}. ${words.open}: ${SAMPLE_LINK}`;
  const subject = row.urgent ? `${words.urgent}: ${trimmed}` : trimmed;

  function submit(next: string | null) {
    save.mutate(
      { category: row.category, language: row.language, urgent: row.urgent, text: next },
      {
        onSuccess: () =>
          showToast({
            message: t(next === null ? 'admin.rules.wording.reset' : 'admin.rules.wording.saved'),
          }),
        onError: (error) =>
          showToast({
            message: t(`admin.rules.wording.errors.${apiErrorCode(error)}`, {
              defaultValue: t('admin.rules.saveError'),
            }),
          }),
      },
    );
  }

  const changedOn = row.updatedAt
    ? new Date(row.updatedAt).toLocaleDateString(i18n.language === 'sw' ? 'sw-KE' : 'en-KE', {
        timeZone: 'Africa/Nairobi',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border-2 border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooLong && !tooShort) submit(trimmed);
      }}
    >
      <h3 className="text-lg font-bold">
        {t(row.urgent ? 'admin.rules.wording.urgent' : 'admin.rules.wording.normal')}
      </h3>
      <Input
        label={t('admin.rules.wording.line')}
        help={t('admin.rules.wording.count', { count: trimmed.length, max: WORDING_MAX })}
        error={
          tooLong
            ? t('admin.rules.wording.errors.wording_too_long')
            : tooShort
              ? t('admin.rules.wording.errors.wording_empty')
              : undefined
        }
        value={text}
        maxLength={WORDING_MAX + 20}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="rounded-lg bg-canvas p-3">
        <p className="font-bold">{t('admin.rules.wording.smsPreview')}</p>
        <p className="mt-1 break-words">{sms}</p>
        <p className="mt-3 font-bold">{t('admin.rules.wording.emailPreview')}</p>
        <p className="mt-1 break-words">{subject}</p>
      </div>
      <p className="text-ink-muted">
        {row.text === null
          ? t('admin.rules.wording.usingDefault')
          : t('admin.rules.wording.custom', {
              version: row.version,
              name: row.updatedBy ?? '—',
              date: changedOn ?? '',
            })}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={save.isPending || trimmed === current || tooLong || tooShort}
        >
          {t('admin.rules.wording.save')}
        </Button>
        {row.text !== null && (
          <Button type="button" variant="secondary" onClick={() => submit(null)}>
            {t('admin.rules.wording.backToDefault')}
          </Button>
        )}
      </div>
      {row.text !== null && (
        <p className="text-ink-muted">
          {t('admin.rules.wording.defaultWas', { text: row.defaultText })}
        </p>
      )}
    </form>
  );
}
