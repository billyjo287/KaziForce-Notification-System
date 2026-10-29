import { useTranslation } from 'react-i18next';
import { showToast } from '../../stores/toasts';
import { useTheme } from './useTheme';

/**
 * The sun that turns into a moon (design refresh). A real button with aria-pressed and one
 * fixed name ("Dark mode"), so screen readers say "Dark mode, toggle button, pressed / not
 * pressed". 44 px tall (touch target). A short toast confirms the change.
 */
export function ThemeToggle({ onDarkHeader = false }: { onDarkHeader?: boolean }) {
  const { t } = useTranslation();
  const { isDark, toggle } = useTheme();
  const track = onDarkHeader ? '#22264A' : 'var(--kf-surface-2)';

  return (
    <button
      type="button"
      onClick={() => {
        // Colours fade for half a second (styles/theme.css), only for this switch.
        const root = document.documentElement;
        root.dataset.themeSwitching = 'true';
        window.setTimeout(() => delete root.dataset.themeSwitching, 600);
        toggle();
        showToast({ message: t(isDark ? 'theme.toggle.toLight' : 'theme.toggle.toDark') });
      }}
      aria-label={t('theme.toggle.label')}
      aria-pressed={isDark}
      className="kf-press relative h-11 w-[4.5rem] shrink-0 cursor-pointer overflow-hidden rounded-full border-2 p-0"
      style={{
        borderColor: onDarkHeader ? '#6E74A6' : 'var(--kf-line-strong)',
        background: track,
      }}
    >
      {/* stars */}
      <span
        aria-hidden="true"
        className="absolute top-3 left-3.5 size-[3px] rounded-full"
        style={{
          background: '#E6E8F3',
          boxShadow: '7px 9px 0 0 #E6E8F3, 14px 2px 0 -0.5px #E6E8F3',
          opacity: isDark ? 1 : 0,
          transition: 'opacity .4s ease .2s',
        }}
      />
      {/* sun / moon */}
      <span
        aria-hidden="true"
        className="absolute top-[6px] left-[6px] size-7 overflow-hidden rounded-full"
        style={{
          background: isDark ? '#E6E8F3' : '#F2B33A',
          transform: `translateX(${isDark ? 28 : 0}px) rotate(${isDark ? -40 : 0}deg)`,
          transition: 'transform .55s cubic-bezier(.5,1.6,.4,1), background-color .4s ease',
          boxShadow: isDark ? '0 0 10px rgba(230,232,243,.35)' : '0 0 0 4px rgba(242,179,58,.25)',
        }}
      >
        <span
          className="absolute -top-[3px] size-6 rounded-full"
          style={{
            left: isDark ? 9 : 36,
            background: track,
            transition: 'left .55s cubic-bezier(.5,1.4,.4,1)',
          }}
        />
      </span>
    </button>
  );
}
