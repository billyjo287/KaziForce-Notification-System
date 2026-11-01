import { useEffect, useState } from 'react';
import brandEn from '../../i18n/locales/brand.en.json';
import brandSw from '../../i18n/locales/brand.sw.json';
import { KaziMark } from './KaziMark';

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
 * The top of every loading state (design refresh): the logo's head hops while friendly lines
 * change every 2.6 s. Decoration only, loaded separately by LoaderHead (components/ui/Skeleton),
 * which passes the language and motion setting in: this file uses nothing but React, so the
 * shared app code is not split into extra downloads (ADR 0014). Screen readers hear one steady
 * "Loading…" there, not every line. With reduced motion the head stays still and the first line
 * stays.
 */
export default function KaziLoader({ language, still }: { language: string; still: boolean }) {
  const lines: LoadingLine[] = (language === 'sw' ? brandSw : brandEn).brand.loading;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, [still]);
  const line = lines[i % lines.length]!;

  return (
    // Fades in after 0.4 s, so a quick load shows only the grey placeholders instead of a flash.
    <div
      className="kf-fade-in flex flex-col items-center gap-3 text-center"
      style={{ animationDelay: '0.4s' }}
    >
      <KaziMark size={72} variant={still ? 'static' : 'hop'} title="" />
      <div
        key={i}
        className="flex min-h-14 items-center gap-2.5"
        style={still ? undefined : { animation: 'kf-msg 2.6s ease both' }}
      >
        <span className="kf-display text-lg font-bold">{line.text}</span>
        {line.wink && <WinkFace />}
      </div>
    </div>
  );
}
