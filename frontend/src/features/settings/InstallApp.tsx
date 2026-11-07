import { CheckCircle2, Smartphone } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { HelpText } from '../../components/ui/Field';
import { install, installState, onInstallChange } from '../../lib/installPrompt';
import { showToast } from '../../stores/toasts';
import './strings';

/**
 * "KaziForce on your home screen" (SRS FR-NOT-016/017, ADR 0019): installed, KaziForce opens like
 * an app and its pop-ups arrive even when it is closed. One button where the browser allows it
 * (Chrome, Edge, Samsung Internet), otherwise the two steps in plain words (iPhone: Share, then
 * "Add to Home Screen").
 */
export function InstallApp() {
  const { t } = useTranslation();
  const state = useSyncExternalStore(onInstallChange, installState, () => 'menu' as const);

  if (state === 'installed') {
    return (
      <p className="flex items-center gap-2 text-lg font-bold">
        <CheckCircle2 aria-hidden="true" className="size-5 text-kf-success-fg" />
        {t('settings.notifications.install.installed')}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-lg font-bold">{t('settings.notifications.install.title')}</p>
      <HelpText id="install-help">{t('settings.notifications.install.help')}</HelpText>
      {state === 'can_install' ? (
        <Button
          variant="secondary"
          aria-describedby="install-help"
          onClick={() =>
            void install().then((yes) => {
              if (yes) showToast({ message: t('settings.notifications.install.done') });
            })
          }
        >
          <Smartphone aria-hidden="true" className="size-5" />
          {t('settings.notifications.install.button')}
        </Button>
      ) : (
        <p>{t(`settings.notifications.install.${state}`)}</p>
      )}
    </div>
  );
}
