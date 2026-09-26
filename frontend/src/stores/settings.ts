// Display settings chosen by the user: light/dark theme, text size and reduce motion.
// Stored in the browser (localStorage) for now; Phase 6 saves them to the user's account.
// The language is stored by i18n itself (see src/i18n).
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TextSize = 'normal' | 'large';
/** "system" follows the phone/computer setting (the default). */
export type Theme = 'system' | 'light' | 'dark';

interface SettingsState {
  theme: Theme;
  textSize: TextSize;
  reduceMotion: boolean;
  setTheme: (theme: Theme) => void;
  setTextSize: (size: TextSize) => void;
  setReduceMotion: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      textSize: 'normal',
      reduceMotion: false,
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: 'kf.settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, textSize, reduceMotion }) => ({ theme, textSize, reduceMotion }),
    },
  ),
);

// Design preview helper: ?theme=dark or ?theme=light forces a theme for this visit only.
const previewTheme = new URLSearchParams(window.location.search).get('theme');

/** Mirror the settings onto <html> so plain CSS can react (see index.css). */
function applyToDocument({ theme, textSize, reduceMotion }: SettingsState) {
  const root = document.documentElement;
  const forced = previewTheme === 'dark' || previewTheme === 'light' ? previewTheme : theme;
  if (forced === 'system') delete root.dataset.theme;
  else root.dataset.theme = forced;
  root.dataset.textSize = textSize;
  root.dataset.reduceMotion = String(reduceMotion);
}

applyToDocument(useSettings.getState());
useSettings.subscribe(applyToDocument);

/** True when the device asks for less motion OR the user switched "Reduce motion" on. */
export function prefersReducedMotion(): boolean {
  return (
    useSettings.getState().reduceMotion ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
function subscribeToDevice(callback: () => void) {
  const query = darkQuery();
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

/** The theme actually on screen: the user's choice, or the device's when set to "system". */
export function useShownTheme(): 'light' | 'dark' {
  const theme = useSettings((s) => s.theme);
  const deviceDark = useSyncExternalStore(subscribeToDevice, () => darkQuery().matches);
  if (theme !== 'system') return theme;
  return deviceDark ? 'dark' : 'light';
}
