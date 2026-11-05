import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpText } from '../../components/ui/Field';
import { Switch } from '../../components/ui/Switch';
import { showToast } from '../../stores/toasts';
import { disablePush, enablePush, pushState } from './browserPush';

const KEY = ['push-state'];

/**
 * "Pop-ups on this phone or computer" (SRS FR-NOT-016..020, ADR 0017). Each browser is switched
 * on separately. Hidden when the server has no push keys. When this browser cannot do it, or
 * the person blocked it in the browser, a plain sentence says what to do instead.
 */
export function BrowserPopups() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: pushState, retry: false });
  const [busy, setBusy] = useState(false);

  if (!data || data.state === 'not_set_up') return null;
  const { state, publicKey } = data;

  async function change(on: boolean) {
    setBusy(true);
    try {
      const next = on ? await enablePush(publicKey!) : await disablePush();
      client.setQueryData(KEY, { state: next, publicKey });
      showToast({ message: t(`settings.notifications.popups.done.${next}`) });
    } catch {
      showToast({ message: t('settings.notifications.popups.error') });
    } finally {
      setBusy(false);
    }
  }

  if (state === 'unsupported' || state === 'blocked') {
    return (
      <div>
        <p className="text-lg font-bold">{t('settings.notifications.popups.label')}</p>
        <HelpText id="popups-note">{t(`settings.notifications.popups.${state}`)}</HelpText>
      </div>
    );
  }
  return (
    <Switch
      label={t('settings.notifications.popups.label')}
      help={t('settings.notifications.popups.help')}
      checked={state === 'on'}
      disabled={busy}
      onCheckedChange={(on) => void change(on)}
    />
  );
}
