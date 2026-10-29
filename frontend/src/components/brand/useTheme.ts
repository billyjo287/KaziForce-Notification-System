// Light/dark for the sun-and-moon toggle (design refresh). Presentational only: it reads and
// changes the app's existing theme setting (stores/settings.ts, saved as "kf.settings"), which
// also offers "Same as device" in Settings. The toggle shows what is on screen now.
import { useCallback, useSyncExternalStore } from 'react';
import { useSettings } from '../../stores/settings';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToDevice(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const deviceIsDark = () => window.matchMedia(DARK_QUERY).matches;

export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const deviceDark = useSyncExternalStore(subscribeToDevice, deviceIsDark, () => false);
  const isDark = theme === 'dark' || (theme === 'system' && deviceDark);

  const toggle = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme]);
  return { theme, isDark, toggle };
}
