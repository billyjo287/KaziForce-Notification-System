import { useMutation } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { FormAlert } from '../../components/ui/FormAlert';
import { Textarea } from '../../components/ui/Textarea';
import { addPageStrings } from '../../i18n/addPageStrings';
import feedbackEn from '../../i18n/locales/alertFeedback.en.json';
import feedbackSw from '../../i18n/locales/alertFeedback.sw.json';
import { api } from '../../lib/api';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { showToast } from '../../stores/toasts';

addPageStrings(feedbackEn, feedbackSw);

const NOT_IMPORTANT_REASONS = [
  'not_my_work',
  'too_far',
  'pay_too_low',
  'not_available',
  'too_many',
  'other',
] as const;
type Reason = (typeof NOT_IMPORTANT_REASONS)[number];

/**
 * After "Not important to me": an optional "why?" (feedback for KaziForce and a training signal
 * for the model). Not a pop-up: a small card above the list that can be skipped, and that goes
 * away on its own if the person presses Undo.
 */
export function NotImportantFeedback({
  alertId,
  alertTitle,
  onDone,
}: {
  alertId: string;
  alertTitle: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const [reason, setReason] = useState<Reason>();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async () =>
      api.post(`/notifications/${alertId}/feedback`, {
        reason,
        ...(reason === 'other' && note.trim() && { note: note.trim() }),
      }),
  });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError(t('alerts.feedback.pickOne'));
      return;
    }
    setError(null);
    try {
      await send.mutateAsync();
      showToast({ message: t('alerts.feedback.thanks') });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section
      aria-labelledby={`feedback-${alertId}`}
      className="mb-6 rounded-2xl border-2 border-line-strong bg-surface p-5"
    >
      <h2 id={`feedback-${alertId}`} className="flex items-center gap-2 text-xl font-bold">
        <MessageSquareText aria-hidden="true" className="size-5 shrink-0" />
        {t('alerts.feedback.title')}
      </h2>
      <p className="mt-1 text-ink-muted">{t('alerts.feedback.intro', { title: alertTitle })}</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        {error && <FormAlert>{error}</FormAlert>}
        <ChoiceCards
          legend={t('alerts.feedback.legend')}
          hideLegend
          name={`reason-${alertId}`}
          value={reason}
          onChange={setReason}
          columns={2}
          choices={NOT_IMPORTANT_REASONS.map((value) => ({
            value,
            label: t(`alerts.feedback.reasons.${value}`),
          }))}
        />
        {reason === 'other' && (
          <Textarea
            label={t('alerts.feedback.noteLabel')}
            help={t('alerts.feedback.noteHelp')}
            maxLength={300}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={send.isPending}>
            {t('alerts.feedback.send')}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t('alerts.feedback.skip')}
          </Button>
        </div>
      </form>
    </section>
  );
}
