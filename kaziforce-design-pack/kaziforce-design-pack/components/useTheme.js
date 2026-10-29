// useTheme: light/dark switching. Presentational only.
// Stores the choice in localStorage ('kf-theme'); first visit follows the phone/computer setting.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'kf-theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) { /* storage blocked: fall through */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0E1022' : '#F5F6FA');
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (_) {}
      return next;
    });
  }, []);

  return { theme, isDark: theme === 'dark', toggle };
}
