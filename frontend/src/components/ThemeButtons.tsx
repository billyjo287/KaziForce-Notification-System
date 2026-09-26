import { Moon, MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings, useShownTheme } from '../stores/settings';
import { headerButtonClasses } from './headerButtonStyles';

/**
 * Two buttons for how the screen looks:
 *   "Dark"   switches dark mode on or off (pressed while the screen is dark);
 *   "Device" follows the phone/computer setting (pressed while that is chosen, the default).
 * `compact` puts the word under the icon, for the narrow phone top bar.
 */
export function ThemeButtons({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const dark = useShownTheme() === 'dark';

  return (
    <div role="group" aria-label={t('theme.label')} className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={dark}
        title={t(dark ? 'theme.darkOff' : 'theme.darkOn')}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        className={headerButtonClasses(compact, dark)}
      >
        <Moon aria-hidden="true" className="size-5 shrink-0" />
        {t('theme.dark')}
      </button>
      <button
        type="button"
        aria-pressed={theme === 'system'}
        title={t('theme.deviceHelp')}
        onClick={() => setTheme('system')}
        className={headerButtonClasses(compact, theme === 'system')}
      >
        <MonitorSmartphone aria-hidden="true" className="size-5 shrink-0" />
        {t('theme.device')}
      </button>
    </div>
  );
}
