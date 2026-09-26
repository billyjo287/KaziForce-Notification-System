import { useTranslation } from 'react-i18next';

/**
 * KaziForce mark: the letters KF inside a clock face, with an amber "seconds" dot on the rim.
 * Idea: KaziForce saves you time by getting the right alert to you at the right moment.
 *
 * Animations (CSS in index.css, all switched off by reduced motion):
 *   1. the clock rim draws itself in when the logo first appears;
 *   2. the seconds dot ticks once around the clock (under 5 s, then stops: WCAG 2.2.2);
 *   3. on hover or keyboard focus of a logo link, the dot rewinds ("time saved").
 */
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`kf-logo shrink-0 ${className}`} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="var(--kf-primary)" />
      {/* Clock rim */}
      <circle
        className="kf-logo-ring"
        cx="20"
        cy="20"
        r="15"
        fill="none"
        stroke="var(--kf-on-primary)"
        strokeWidth="2.2"
        pathLength="100"
        transform="rotate(-90 20 20)"
      />
      {/* Hour marks at 3, 6 and 9 (12 is where the seconds dot rests) */}
      <g stroke="var(--kf-on-primary)" strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <path d="M32.2 20h-1.8M20 32.2v-1.8M7.8 20h1.8" />
      </g>
      {/* K and F as clean strokes */}
      <g
        fill="none"
        stroke="var(--kf-on-primary)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 13.5v13M18.8 13.5l-5.4 6.8M15.2 18.1l4 8.4" />
        <path d="M22.6 26.5v-13h5.6M22.6 19.8h4.6" />
      </g>
      {/* Seconds dot */}
      <circle className="kf-logo-dot" cx="20" cy="5" r="2.6" fill="var(--kf-important-bar)" />
    </svg>
  );
}

/** The mark is clearly bigger than the word next to it, so the clock and the KF are readable. */
export function Logo({ markClassName = 'size-12' }: { markClassName?: string }) {
  const { t } = useTranslation();
  return (
    <span className="kf-logo-link flex items-center gap-2.5 text-xl font-bold">
      <LogoMark className={markClassName} />
      {t('app.name')}
    </span>
  );
}
