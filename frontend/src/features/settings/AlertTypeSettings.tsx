import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../components/ui/Checkbox';
import { HelpText } from '../../components/ui/Field';
import { Switch } from '../../components/ui/Switch';
import type {
  AlertCategory,
  ExternalChannel,
  NotificationPreferences,
  PreferencesChange,
} from '../../types/api';

type Save = (change: PreferencesChange, undo: PreferencesChange, message?: string) => void;

/**
 * "Types of alerts", inside Customise (SRS FR-NOT-031, FR-NOT-032, FR-NOT-035; ADR 0016). Each
 * type this side of the app gets: on/off, and which of the person's channels may carry it
 * outside the app. Types an admin made "Always send" are shown locked on, with the reason.
 * Off means no pop-up, no SMS or email and not in the summary; the alert is still kept in the
 * list (marked read), so nothing is lost.
 */
export function AlertTypeSettings({ prefs, save }: { prefs: NotificationPreferences; save: Save }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="alert-types-title"
      aria-describedby="alert-types-help"
      className="flex flex-col gap-4"
    >
      <div>
        <h3 id="alert-types-title" className="text-lg font-bold">
          {t('settings.notifications.types.title')}
        </h3>
        <HelpText id="alert-types-help">{t('settings.notifications.types.help')}</HelpText>
      </div>
      {prefs.categories.map((category) => (
        <AlertType key={category} category={category} prefs={prefs} save={save} />
      ))}
    </section>
  );
}

function AlertType({
  category,
  prefs,
  save,
}: {
  category: AlertCategory;
  prefs: NotificationPreferences;
  save: Save;
}) {
  const { t } = useTranslation();
  const name = t(`settings.notifications.types.names.${category}`);
  const setting = prefs.categorySettings[category];

  if (prefs.mandatoryCategories.includes(category)) {
    return (
      <div className="rounded-xl border-2 border-line bg-canvas p-4">
        <p className="text-lg font-bold">{name}</p>
        <p className="mt-1 flex items-start gap-2 text-ink-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('settings.notifications.types.mandatory')}
        </p>
      </div>
    );
  }

  const toggleChannel = (channel: ExternalChannel, on: boolean) => {
    const channels = on
      ? [...setting.channels, channel]
      : setting.channels.filter((c) => c !== channel);
    save(
      { categorySettings: { [category]: { channels } } },
      { categorySettings: { [category]: { channels: setting.channels } } },
    );
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-line p-4">
      <legend className="sr-only">{name}</legend>
      <Switch
        label={name}
        help={t(`settings.notifications.types.helps.${category}`)}
        checked={setting.enabled}
        onCheckedChange={(enabled) =>
          save(
            { categorySettings: { [category]: { enabled } } },
            { categorySettings: { [category]: { enabled: setting.enabled } } },
          )
        }
      />
      {setting.enabled ? (
        <fieldset aria-describedby={`${category}-channels-help`} className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">
            {t('settings.notifications.types.channels', { type: name })}
          </legend>
          {prefs.channelOrder.map((channel) => (
            <Checkbox
              key={channel}
              label={t(`channelTitles.${channel}`)}
              checked={setting.channels.includes(channel)}
              onChange={(e) => toggleChannel(channel, e.target.checked)}
            />
          ))}
          <HelpText id={`${category}-channels-help`}>
            {t('settings.notifications.types.channelsHelp')}
          </HelpText>
        </fieldset>
      ) : (
        <p className="text-ink-muted">{t('settings.notifications.types.offNote')}</p>
      )}
    </fieldset>
  );
}
