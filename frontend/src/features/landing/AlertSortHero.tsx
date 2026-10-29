import { Ban, Bell, Clock, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '../../components/ui/Badge';

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

const CARDS: {
  key: 'urgent' | 'medium' | 'low';
  tone: BadgeTone;
  icon: LucideIcon;
  drop: number;
}[] = [
  { key: 'urgent', tone: 'urgent', icon: TriangleAlert, drop: 0.5 },
  { key: 'medium', tone: 'important', icon: Bell, drop: 0.85 },
  { key: 'low', tone: 'later', icon: Clock, drop: 1.15 },
];

/**
 * The landing page's hero picture (design refresh): "the alerts sort themselves". Sample content
 * on a marketing page, so it is plain JSX and CSS, played once per page load:
 *   1. three alerts drop in, each priority badge stamps on half a second later;
 *   2. a scam drops in with a "Blocked scam" stamp and is swept off to the right (it sits over
 *      the space of the line below, so nothing else moves);
 *   3. "3 spam messages blocked today" fades in and the title changes to "Sorted for you";
 *   4. the card then floats gently.
 * Screen readers get one sentence instead. With reduced motion the finished picture shows at
 * once. In the ready-made copy of the page (ADR 0010) it stays hidden until the app arrives, so it
 * plays once, not twice (index.css, [data-prerendered] .kf-hero-demo).
 */
export function AlertSortHero() {
  const { t } = useTranslation();
  return (
    <figure className="kf-hero-demo m-0 w-full max-w-md justify-self-center md:justify-self-end">
      <figcaption className="sr-only">{t('landing.demo.description')}</figcaption>
      <div
        aria-hidden="true"
        className="kf-float overflow-hidden rounded-[28px] bg-kf-inverse p-4 text-kf-on-inverse shadow-kf sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <p className="kf-display text-xl font-bold">{t('landing.demo.title')}</p>
          <span className="relative inline-grid text-sm font-bold text-kf-on-inverse-2">
            <span className="kf-fade-out col-start-1 row-start-1" style={delay(3.5)}>
              {t('landing.demo.sorting')}
            </span>
            <span
              className="kf-fade-in col-start-1 row-start-1 flex items-center gap-1.5 text-kf-accent"
              style={delay(3.5)}
            >
              <ShieldCheck className="size-4" />
              {t('landing.demo.sorted')}
            </span>
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {CARDS.map(({ key, tone, icon, drop }) => (
            <li
              key={key}
              className="kf-drop rounded-[18px] bg-kf-surface p-4 text-kf-text"
              style={delay(drop)}
            >
              <span className="kf-stamp inline-block" style={delay(drop + 0.5)}>
                <Badge tone={tone} icon={icon}>
                  {t(`priority.${key}`)}
                </Badge>
              </span>
              <p className="mt-2 font-bold">{t(`landing.demo.${key}Title`)}</p>
              <p className="text-kf-muted">{t(`landing.demo.${key}Body`)}</p>
            </li>
          ))}
        </ul>

        {/* The scam and, in the same place, the line that replaces it. */}
        <div className="relative mt-3 grid">
          <p
            className="kf-fade-in col-start-1 row-start-1 flex items-center gap-2 self-center px-1 py-3 text-kf-on-inverse-2"
            style={delay(3.5)}
          >
            <ShieldCheck className="size-5 shrink-0 text-kf-accent" />
            {t('landing.demo.blocked')}
          </p>
          <div className="kf-drop-sweep col-start-1 row-start-1 rounded-[18px] border-2 border-dashed border-kf-urgent-line bg-kf-surface p-4 text-kf-text">
            <span className="kf-stamp inline-block" style={delay(2.3)}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-kf-spam-bg px-2.5 py-0.5 font-bold text-kf-spam-fg">
                <Ban className="size-4" strokeWidth={2.5} />
                {t('priority.spam')}
              </span>
            </span>
            <p className="mt-2 font-bold line-through decoration-2">
              {t('landing.demo.scamTitle')}
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}
