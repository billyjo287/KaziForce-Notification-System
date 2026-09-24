// Display settings chosen by the user: text size and reduce motion.
// Stored in the browser (localStorage) for now; Phase 6 saves them to the user's account.
// The language is stored by i18n itself (see src/i18n).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TextSize = 'normal' | 'large';

interface SettingsState {
  textSize: TextSize;
  reduceMotion: boolean;
  setTextSize: (size: TextSize) => void;
  setReduceMotion: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      textSize: 'normal',
      reduceMotion: false,
      setTextSize: (textSize) => set({ textSize }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: 'kf.settings',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ textSize, reduceMotion }) => ({ textSize, reduceMotion }),
    },
  ),
);

/** Mirror the settings onto <html> so plain CSS can react (see index.css). */
function applyToDocument({ textSize, reduceMotion }: SettingsState) {
  const root = document.documentElement;
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
