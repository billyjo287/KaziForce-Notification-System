// Small presentational hooks. No data fetching, no app state.
import { useEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// useCountUp(1234) -> animates 0 -> 1234 once when the value first appears or changes.
// It only changes how an existing number is DISPLAYED; pass in the value you already have.
export function useCountUp(target, duration = 1100) {
  const [shown, setShown] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced() || typeof target !== 'number') { setShown(target); return; }
    let raf; const start = performance.now(); const a = from.current;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (target - a) * e);
      if (t < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

// useReveal() -> ref; add className="kf-reveal" to the element. It fades up when scrolled into view.
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !('IntersectionObserver' in window)) { el.classList.add('is-visible'); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add('is-visible'); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// useCountdown(deadline) -> "1:51:48 left". Display only; the deadline comes from existing data.
export function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} left`;
}
