import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTimedExit } from '../../lib/useTimedExit';
import { useAuth } from '../../stores/auth';

const SHOW_MS = 5000;

/**
 * "Welcome back, Wanjiru! You are logged in." after logging in: slides in, a check mark draws
 * itself, a bar counts down 5 seconds, then it slides away. It never blocks the page (the
 * person can start straight away) and can be closed early.
 */
export default function WelcomeBanner() {
  const { t } = useTranslation();
  const justLoggedIn = useAuth((s) => s.justLoggedIn);
  const name = useAuth((s) => s.user?.name);
  const setJustLoggedIn = useAuth((s) => s.setJustLoggedIn);
  const leaving = useTimedExit(justLoggedIn, SHOW_MS, () => setJustLoggedIn(false));

  if (!justLoggedIn || !name) return null;
  const firstName = name.split(' ')[0];

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-40 flex justify-center">
      <div
        role="status"
        className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-primary bg-surface shadow-xl ${
          leaving ? 'kf-leave' : 'kf-enter'
        }`}
      >
        <div className="flex items-center gap-3 p-4">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-10 shrink-0">
            <circle cx="12" cy="12" r="11" fill="var(--kf-primary)" />
            <path
              className="kf-check-draw"
              pathLength="1"
              d="M7 12.5l3.2 3.2L17 9"
              fill="none"
              stroke="var(--kf-on-primary)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="flex-1">
            <span className="block text-lg font-bold">
              {t('auth.welcome.title', { name: firstName })}
            </span>
            <span className="block text-ink-muted">{t('auth.welcome.body')}</span>
          </p>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setJustLoggedIn(false)}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-canvas"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {/* Shrinks over the 5 seconds, so the person can see the message is about to go. */}
        <span aria-hidden="true" className="kf-countdown block h-1.5 bg-primary" />
      </div>
    </div>
  );
}
