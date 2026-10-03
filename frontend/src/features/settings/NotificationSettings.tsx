import { ArrowDown, ArrowUp, ChevronDown, Mail, MessageCircle, MessageSquare } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { usePreferences, useUpdatePreferences } from './settingsApi';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ChoiceCards } from '../../components/ui/ChoiceCards';
import { HelpText } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { showToast } from '../../stores/toasts';
import type {
  ExternalChannel,
  NotificationPreferences,
  PreferencesChange,
  PresetName,
  QuietHours,
  Threshold,
} from '../../types/api';
import '../onboarding/strings';
import './strings';

const ICONS = { whatsapp: MessageCircle, sms: MessageSquare, email: Mail };
const PRESETS: PresetName[] = ['recommended', 'urgent_only', 'everything'];
const THRESHOLDS: Threshold[] = ['everything', 'urgent_and_important', 'urgent_only'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The notification part of Settings (PRD FR-5). Order of the screen, simplest first: where urgent
 * alerts go, then three presets, then the details behind "Customise" (progressive disclosure).
 * Every change is saved at once, with "Saved" and an Undo button.
 */
export function NotificationSettings() {
  const { t } = useTranslation();
  const { data: prefs, isPending, isError, refetch } = usePreferences();
  const update = useUpdatePreferences();
  const errorMessage = useApiErrorMessage();
  const location = useLocation();
  // Closed at first, unless the person already has their own settings.
  const [customiseChoice, setCustomiseChoice] = useState<boolean | null>(null);
  const customiseOpen = customiseChoice ?? prefs?.preset === 'custom';

  // "Manage your notification preferences" in the daily summary email links to #notifications.
  const loaded = prefs !== undefined;
  useEffect(() => {
    if (loaded && location.hash === '#notifications') {
      document.getElementById('notifications')?.scrollIntoView();
    }
  }, [loaded, location.hash]);

  /** Saves a change; the toast offers Undo, which saves `undo` (the values from before). */
  function save(change: PreferencesChange, undo: PreferencesChange, message = t('settings.saved')) {
    update.mutate(change, {
      onSuccess: () =>
        showToast({
          message,
          actionLabel: t('common.undo'),
          onAction: () =>
            update.mutate(undo, {
              onSuccess: () => showToast({ message: t('settings.notifications.undone') }),
              onError: (error) => showToast({ message: errorMessage(error) }),
            }),
        }),
      onError: (error) => showToast({ message: errorMessage(error) }),
    });
  }

  return (
    <Card className="mb-6">
      <section id="notifications" aria-labelledby="notifications-title" className="scroll-mt-24">
        <h2 id="notifications-title" className="text-xl font-bold">
          {t('settings.notifications.title')}
        </h2>
        <p className="mt-1 mb-6 text-ink-muted">{t('settings.notifications.intro')}</p>

        {isPending ? (
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{t('common.loading')}</span>
            {/* Grey placeholders (drawn here, not with <Skeleton>, to keep the app shell's files
                as they are: see docs/adr/0007). */}
            {[1, 2, 3].map((i) => (
              <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-line" />
            ))}
          </div>
        ) : isError || !prefs ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="font-bold">{t('settings.notifications.loadError')}</p>
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <ChannelOrder prefs={prefs} save={save} />

            <Switch
              label={t('settings.notifications.whatsapp.label')}
              help={t('settings.notifications.whatsapp.help')}
              checked={prefs.usesWhatsApp}
              onCheckedChange={(on) =>
                save(
                  { usesWhatsApp: on },
                  { usesWhatsApp: prefs.usesWhatsApp, channelOrder: prefs.channelOrder },
                )
              }
            />

            <Switch
              label={t('settings.notifications.both.label')}
              help={t('settings.notifications.both.help')}
              checked={prefs.urgentOnBothChannels}
              onCheckedChange={(on) =>
                save(
                  { urgentOnBothChannels: on },
                  { urgentOnBothChannels: prefs.urgentOnBothChannels },
                )
              }
            />

            <div className="flex flex-col gap-2">
              <ChoiceCards<PresetName>
                legend={t('settings.notifications.presets.title')}
                help={t('settings.notifications.presets.help')}
                name="notification-preset"
                value={prefs.preset === 'custom' ? undefined : prefs.preset}
                onChange={(preset) =>
                  save(
                    { preset },
                    { channelSettings: prefs.channelSettings, dailySummary: prefs.dailySummary },
                  )
                }
                choices={PRESETS.map((preset) => ({
                  value: preset,
                  label: t(`onboarding.preset.${preset}`),
                  help: t(`onboarding.preset.${preset}Help`),
                }))}
              />
              {prefs.preset === 'custom' && (
                <p className="font-bold">{t('settings.notifications.presets.custom')}</p>
              )}
            </div>

            <div className="flex flex-col items-start gap-2">
              <Button
                variant="secondary"
                aria-expanded={customiseOpen}
                aria-controls="customise-panel"
                aria-describedby="customise-help"
                onClick={() => setCustomiseChoice(!customiseOpen)}
              >
                {t('settings.notifications.customise.button')}
                <ChevronDown
                  aria-hidden="true"
                  className={`size-5 transition-transform duration-150 ${customiseOpen ? 'rotate-180' : ''}`}
                />
              </Button>
              <HelpText id="customise-help">{t('settings.notifications.customise.help')}</HelpText>
            </div>

            {customiseOpen && (
              <div
                id="customise-panel"
                className="flex flex-col gap-8 border-l-4 border-line pl-4 sm:pl-6"
              >
                {prefs.channelOrder.map((channel) => (
                  <ChannelControls key={channel} channel={channel} prefs={prefs} save={save} />
                ))}
                <QuietHoursControls
                  value={prefs.quietHours}
                  onSave={(quietHours) => save({ quietHours }, { quietHours: prefs.quietHours })}
                />
                <Switch
                  label={t('settings.notifications.summary.label')}
                  help={t('settings.notifications.summary.help')}
                  checked={prefs.dailySummary}
                  onCheckedChange={(on) =>
                    save({ dailySummary: on }, { dailySummary: prefs.dailySummary })
                  }
                />
              </div>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}

type Save = (change: PreferencesChange, undo: PreferencesChange, message?: string) => void;

/** Why a channel may be skipped, in plain words (or nothing if it works). */
function channelNote(channel: ExternalChannel, prefs: NotificationPreferences) {
  if (channel !== 'email' && !prefs.phoneVerified) return 'needsPhone';
  if (channel !== 'email' && prefs.optedOut[channel]) return 'stopped';
  if (!prefs.channelSettings[channel].enabled) return 'switchedOff';
  return null;
}

/** Up/down buttons (not drag-only): works with a keyboard, a screen reader and big fingers. */
function ChannelOrder({ prefs, save }: { prefs: NotificationPreferences; save: Save }) {
  const { t } = useTranslation();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focusAfterMove, setFocusAfterMove] = useState<{
    channel: ExternalChannel;
    direction: 'up' | 'down';
  } | null>(null);
  const order = prefs.channelOrder;

  // Keep the keyboard focus on the channel that moved; at the top or bottom its button is
  // disabled, so the other one gets it.
  useEffect(() => {
    if (!focusAfterMove) return;
    const { channel, direction } = focusAfterMove;
    const same = buttons.current.get(`${channel}-${direction}`);
    const other = buttons.current.get(`${channel}-${direction === 'up' ? 'down' : 'up'}`);
    (same && !same.disabled ? same : other)?.focus();
  }, [focusAfterMove, order]);

  function move(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const channel = order[index]!;
    setFocusAfterMove({ channel, direction });
    save(
      { channelOrder: next },
      { channelOrder: order },
      t('settings.notifications.order.moved', {
        channel: t(`channelTitles.${channel}`),
        position: target + 1,
      }),
    );
  }

  return (
    <section aria-labelledby="order-title">
      <h3 id="order-title" className="text-lg font-bold">
        {t('settings.notifications.order.title')}
      </h3>
      <HelpText id="order-help">{t('settings.notifications.order.help')}</HelpText>
      <ol
        aria-labelledby="order-title"
        aria-describedby="order-help"
        className="mt-3 flex flex-col gap-2"
      >
        {order.map((channel, index) => {
          const Icon = ICONS[channel];
          const title = t(`channelTitles.${channel}`);
          const note = channelNote(channel, prefs);
          return (
            <li
              key={channel}
              className="flex items-center gap-3 rounded-xl border-2 border-line-strong bg-surface p-3"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary"
              >
                {index + 1}
              </span>
              <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{title}</span>
                {note && (
                  <span className="block text-ink-muted">
                    {t(`settings.notifications.order.${note}`)}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-2">
                {(['up', 'down'] as const).map((direction) => {
                  const Arrow = direction === 'up' ? ArrowUp : ArrowDown;
                  const disabled = direction === 'up' ? index === 0 : index === order.length - 1;
                  return (
                    <button
                      key={direction}
                      type="button"
                      ref={(el) => {
                        if (el) buttons.current.set(`${channel}-${direction}`, el);
                        else buttons.current.delete(`${channel}-${direction}`);
                      }}
                      aria-label={t(
                        direction === 'up'
                          ? 'settings.notifications.order.moveUp'
                          : 'settings.notifications.order.moveDown',
                        { channel: title },
                      )}
                      disabled={disabled}
                      onClick={() => move(index, direction)}
                      className="flex size-12 items-center justify-center rounded-xl border-2 border-line-strong bg-surface text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Arrow aria-hidden="true" className="size-6" />
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** One channel: on/off, and which alerts it gets. */
function ChannelControls({
  channel,
  prefs,
  save,
}: {
  channel: ExternalChannel;
  prefs: NotificationPreferences;
  save: Save;
}) {
  const { t } = useTranslation();
  const setting = prefs.channelSettings[channel];
  const stopped = channel !== 'email' && prefs.optedOut[channel];
  const on = setting.enabled && !stopped;
  const title = t(`channelTitles.${channel}`);
  const name = t(`channels.${channel}`);

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="sr-only">{title}</legend>
      <Switch
        label={t('settings.notifications.channel.label', { channel: title })}
        help={t('settings.notifications.channel.help', { channel: name })}
        checked={on}
        onCheckedChange={(enabled) =>
          save(
            { channelSettings: { [channel]: { enabled } } },
            { channelSettings: { [channel]: { enabled: setting.enabled } } },
          )
        }
      />
      {on && (
        <Select
          label={t('settings.notifications.channel.what', { channel: name })}
          help={t('settings.notifications.channel.whatHelp')}
          value={setting.threshold}
          options={THRESHOLDS.map((value) => ({
            value,
            label: t(`settings.notifications.channel.thresholds.${value}`),
          }))}
          onValueChange={(threshold) =>
            save(
              { channelSettings: { [channel]: { threshold: threshold as Threshold } } },
              { channelSettings: { [channel]: { threshold: setting.threshold } } },
            )
          }
        />
      )}
    </fieldset>
  );
}

/**
 * Quiet hours: on/off and two time pickers (the phone's own clock picker). A time is saved when
 * the person leaves the field, or a second after they stop changing it.
 */
function QuietHoursControls({
  value,
  onSave,
}: {
  value: QuietHours;
  onSave: (value: QuietHours) => void;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  // When the saved value changes (e.g. Undo), show it.
  const [shown, setShown] = useState(value);
  if (shown.start !== value.start || shown.end !== value.end) {
    setShown(value);
    setStart(value.start);
    setEnd(value.end);
  }

  const same = start === end;
  const valid = TIME.test(start) && TIME.test(end) && !same;
  const changed = start !== value.start || end !== value.end;

  const commit = () => {
    if (valid && changed) onSave({ ...value, start, end });
  };
  const commitAfterPause = useEffectEvent(commit);
  useEffect(() => {
    const timer = setTimeout(() => commitAfterPause(), 1000);
    return () => clearTimeout(timer);
  }, [start, end]);

  return (
    <div className="flex flex-col gap-4">
      <Switch
        label={t('settings.notifications.quiet.label')}
        help={t('settings.notifications.quiet.help')}
        checked={value.enabled}
        onCheckedChange={(enabled) => onSave({ ...value, enabled })}
      />
      {value.enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="time"
            label={t('settings.notifications.quiet.from')}
            help={t('settings.notifications.quiet.fromHelp')}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={commit}
          />
          <Input
            type="time"
            label={t('settings.notifications.quiet.until')}
            help={t('settings.notifications.quiet.untilHelp')}
            error={same ? t('settings.notifications.quiet.same') : undefined}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onBlur={commit}
          />
        </div>
      )}
    </div>
  );
}
