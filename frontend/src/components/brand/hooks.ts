// Small presentational hooks (design refresh). No data fetching, no app state: they only change
// how a value the page already has is SHOWN. All respect reduced motion (device or in-app).
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../stores/settings';

/** Counts a number up from 0 (or the last value) once when it appears or changes. */
export function useCountUp(target: number, duration = 1100): number {
  const still = prefersReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still) {
      from.current = target;
      return;
    }
    let frame = 0;
    const start = performance.now();
    const a = from.current;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(a + (target - a) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, still]);
  // Reduced motion: the real number at once, no counting.
  return still ? target : shown;
}

/** Put the ref on an element with className="kf-reveal": it fades up when scrolled into view. */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      el.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** "1:51:48": the time left until a deadline the page already has (display only). */
export function useCountdown(deadline: string | Date): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
