import {
  Ban,
  Bell,
  Clock,
  Pause,
  Play,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState, type AnimationEvent, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { prefersReducedMotion } from '../../stores/settings';

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

// The story, in seconds from the start of each round. Unhurried on purpose: each step finishes
// before the next one starts, so it is easy to follow.
const T = {
  cards: [0.6, 1.5, 2.4], // each alert drops in…
  stamp: 0.7, // …and its priority badge stamps on this much later
  scamDrop: 3.6,
  scamStamp: 4.3,
  scamSweep: 5.8,
  sorted: 6.5, // "Sorted for you" and "3 spam messages blocked today"
  fadeOut: 11, // the finished picture stays for about 4 s, fades out, and the next round starts
};

const CARDS: { key: 'urgent' | 'medium' | 'low'; tone: BadgeTone; icon: LucideIcon }[] = [
  { key: 'urgent', tone: 'urgent', icon: TriangleAlert },
  { key: 'medium', tone: 'important', icon: Bell },
  { key: 'low', tone: 'later', icon: Clock },
];

/**
 * The landing page's hero picture (design refresh): "the alerts sort themselves". Sample content
 * on a marketing page, so it is plain JSX and CSS, played in rounds of about 12 s:
 *   1. three alerts drop in, each priority badge stamps on a moment later;
 *   2. a scam drops in with a "Blocked scam" stamp and is swept off to the right (it sits over
 *      the space of the line below, so nothing else moves);
 *   3. "3 spam messages blocked today" fades in and the title changes to "Sorted for you";
 *   4. the finished picture stays, fades out, and the next round starts (when the fade-out ends,
 *      the content is drawn again, which restarts every animation).
 * It moves for more than 5 seconds, so a Pause button stops it (WCAG 2.2.2); paused, everything
 * freezes where it is. Screen readers get one sentence instead. With reduced motion the finished
 * picture shows at once and stays. In the ready-made copy of the page (ADR 0010) it stays hidden
 * until the app arrives, so the first round is not cut short (index.css, [data-prerendered]).
 */
export function AlertSortHero() {
  const { t } = useTranslation();
  const [round, setRound] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = prefersReducedMotion();

  const nextRound = (event: AnimationEvent) => {
    if (event.target === event.currentTarget) setRound((n) => n + 1);
  };

  return (
    <figure className="kf-hero-demo m-0 flex w-full max-w-md flex-col items-end gap-2 justify-self-center md:justify-self-end">
      <figcaption className="sr-only">{t('landing.demo.description')}</figcaption>
      <div
        aria-hidden="true"
        className={`kf-float w-full overflow-hidden rounded-[28px] bg-kf-inverse p-4 text-kf-on-inverse shadow-kf sm:p-5 ${paused ? 'kf-paused' : ''}`}
      >
        <div
          key={round}
          className={still ? undefined : 'kf-hero-round'}
          style={still ? undefined : delay(T.fadeOut)}
          onAnimationEnd={still ? undefined : nextRound}
        >
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <p className="kf-display text-xl font-bold">{t('landing.demo.title')}</p>
            <span className="relative inline-grid text-sm font-bold text-kf-on-inverse-2">
              <span className="kf-fade-out col-start-1 row-start-1" style={delay(T.sorted)}>
                {t('landing.demo.sorting')}
              </span>
              <span
                className="kf-fade-in col-start-1 row-start-1 flex items-center gap-1.5 text-kf-accent"
                style={delay(T.sorted)}
              >
                <ShieldCheck className="size-4" />
                {t('landing.demo.sorted')}
              </span>
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            {CARDS.map(({ key, tone, icon }, i) => (
              <li
                key={key}
                className="kf-hero-drop rounded-[18px] bg-kf-surface p-4 text-kf-text"
                style={delay(T.cards[i]!)}
              >
                <span className="kf-hero-stamp inline-block" style={delay(T.cards[i]! + T.stamp)}>
                  <Badge tone={tone} icon={icon}>
                    {t(`priority.${key}`)}
                  </Badge>
                </span>
                <p className="mt-2 font-bold">{t(`landing.demo.${key}Title`)}</p>
                <p className="text-kf-muted">{t(`landing.demo.${key}Body`)}</p>
              </li>
            ))}
          </ul>

          {/* The scam and, in the same place, the line that replaces it. Dropping in and being
              swept away are on two nested boxes, so the two animations never fight. */}
          <div className="relative mt-3 grid">
            <p
              className="kf-fade-in col-start-1 row-start-1 flex items-center gap-2 self-center px-1 py-3 text-kf-on-inverse-2"
              style={delay(T.sorted)}
            >
              <ShieldCheck className="size-5 shrink-0 text-kf-accent" />
              {t('landing.demo.blocked')}
            </p>
            <div className="kf-hero-drop col-start-1 row-start-1" style={delay(T.scamDrop)}>
              <div
                className="kf-hero-sweep rounded-[18px] border-2 border-dashed border-kf-urgent-line bg-kf-surface p-4 text-kf-text"
                style={delay(T.scamSweep)}
              >
                <span className="kf-hero-stamp inline-block" style={delay(T.scamStamp)}>
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
        </div>
      </div>
      {!still && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-kf-muted hover:bg-kf-surface-2 hover:text-kf-text"
        >
          {paused ? (
            <Play aria-hidden="true" className="size-4" />
          ) : (
            <Pause aria-hidden="true" className="size-4" />
          )}
          {t(paused ? 'landing.demo.play' : 'landing.demo.pause')}
        </button>
      )}
    </figure>
  );
}
