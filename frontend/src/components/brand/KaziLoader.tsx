import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '../../stores/settings';
import { KaziMark } from './KaziMark';
import './strings';

interface LoadingLine {
  text: string;
  wink?: boolean;
}

function WinkFace() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="15" r="13" fill="#F2B33A" />
      <circle cx="10" cy="12" r="2" fill="#14162B" />
      <path
        d="M17.5 12.5q2.5 -2.5 5 0"
        fill="none"
        stroke="#14162B"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M9 18q6 5 12 0" fill="none" stroke="#14162B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Loading state (design refresh): the logo's head hops while friendly lines change every 2.6 s,
 * above skeleton rows. Purely visual: show it where the page already knows it is loading.
 * With reduced motion the head stays still and the first line stays (no fading text).
 */
export function KaziLoader({
  skeletonRows = 3,
  compact = false,
}: {
  skeletonRows?: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const lines = t('brand.loading', { returnObjects: true }) as LoadingLine[];
  const still = prefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, [still]);
  const line = Array.isArray(lines) ? lines[i % lines.length] : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center gap-5 text-center ${compact ? 'p-4' : 'p-12'}`}
    >
      <KaziMark
        size={compact ? 64 : 104}
        variant={still ? 'static' : 'hop'}
        title={t('brand.loadingLabel')}
      />
      {line && (
        <div
          key={i}
          className="flex min-h-10 items-center gap-2.5"
          style={still ? undefined : { animation: 'kf-msg 2.6s ease both' }}
        >
          <span className={`kf-display font-bold ${compact ? 'text-lg' : 'text-xl'}`}>
            {line.text}
          </span>
          {line.wink && <WinkFace />}
        </div>
      )}
      {skeletonRows > 0 && (
        <div aria-hidden="true" className="flex w-full max-w-[520px] flex-col gap-3">
          {Array.from({ length: skeletonRows }, (_, r) => (
            <div key={r} className="flex items-center gap-3">
              <div className="kf-skel size-12 shrink-0 rounded-[14px]" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="kf-skel h-3.5" style={{ width: `${70 - r * 8}%` }} />
                <div className="kf-skel h-3" style={{ width: `${45 - r * 5}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
