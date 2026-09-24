import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../stores/settings';
import { decideHeroMode, readHeroEnvironment } from './heroSupport';
import { HeroStatic } from './HeroStatic';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Landing hero picture. The still SVG shows immediately (fast first paint, no layout shift).
 * If the device can handle it, the Three.js scene is downloaded after the page is idle and
 * fades in on top. Three.js lives in its own file that only this component ever requests.
 */
export function Hero() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (decideHeroMode(readHeroEnvironment(prefersReducedMotion())) !== '3d') return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const start = () => {
      import('./heroScene')
        .then(({ mountHeroScene }) => {
          const host = canvasHost.current;
          if (cancelled || !host) return;
          cleanup = mountHeroScene(host, {
            node: cssVar('--kf-later-bar'),
            line: cssVar('--kf-line-strong'),
            hub: cssVar('--kf-primary'),
            pulse: cssVar('--kf-primary'),
            target: cssVar('--kf-primary'),
          });
          setAnimated(true);
        })
        .catch(() => {
          // Download failed (e.g. connection dropped): the still picture simply stays.
        });
    };

    // Wait until the browser is idle after the first paint (Safari lacks requestIdleCallback).
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const handle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 2500 })
      : window.setTimeout(start, 400);

    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      cleanup?.();
    };
  }, []);

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-md"
      data-hero-mode={animated ? '3d' : 'static'}
    >
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${animated ? 'opacity-0' : 'opacity-100'}`}
      >
        <HeroStatic />
      </div>
      <div ref={canvasHost} className="absolute inset-0" />
    </div>
  );
}
