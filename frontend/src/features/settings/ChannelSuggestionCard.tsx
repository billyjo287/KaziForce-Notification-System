import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAnswerChannelSuggestion, useChannelSuggestion } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { addPageStrings } from '../../i18n/addPageStrings';
import suggestionEn from '../../i18n/locales/suggestion.en.json';
import suggestionSw from '../../i18n/locales/suggestion.sw.json';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { showToast } from '../../stores/toasts';

// Its words arrive with the Settings page (most visits never need them).
addPageStrings(suggestionEn, suggestionSw);

/**
 * PRD FR-4b: shown once, when the person clearly opens urgent alerts faster on another channel.
 * Nothing changes unless they tap "Yes"; either answer hides it for good.
 */
export function ChannelSuggestionCard({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const { data: suggestion } = useChannelSuggestion(enabled);
  const answer = useAnswerChannelSuggestion();
  const errorMessage = useApiErrorMessage();
  if (!suggestion) return null;

  const channel = t(`channels.${suggestion.channel}`);
  const current = t(`channels.${suggestion.currentFirst}`);
  const reply = (accept: boolean) =>
    answer.mutate(accept, {
      onSuccess: () =>
        showToast({
          message: accept
            ? t('settings.suggestion.accepted', { channel })
            : t('settings.suggestion.declined', { channel: current }),
        }),
      onError: (error) => showToast({ message: errorMessage(error) }),
    });

  return (
    <section
      aria-labelledby="channel-suggestion-title"
      className="mb-6 rounded-xl border-2 border-primary bg-primary-soft p-5"
    >
      <h2 id="channel-suggestion-title" className="flex items-center gap-3 text-xl font-bold">
        <Lightbulb aria-hidden="true" className="size-6 shrink-0 text-primary" />
        {t('settings.suggestion.title', { channel })}
      </h2>
      <p className="mt-2 text-lg">
        {t('settings.suggestion.body', {
          channel,
          count: suggestion.wins,
          total: suggestion.alerts,
          minutes: suggestion.medianMinutes,
        })}
      </p>
      <p className="mt-1 text-ink-muted">{t('settings.suggestion.help')}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button onClick={() => reply(true)} disabled={answer.isPending}>
          {t('settings.suggestion.yes', { channel })}
        </Button>
        <Button variant="secondary" onClick={() => reply(false)} disabled={answer.isPending}>
          {t('settings.suggestion.no', { channel: current })}
        </Button>
      </div>
    </section>
  );
}
