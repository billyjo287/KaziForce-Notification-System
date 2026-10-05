import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLayoutEffect, type RefObject } from 'react';
import { prefersReducedMotion } from '../../stores/settings';

gsap.registerPlugin(ScrollTrigger);

/**
 * Sections below the hero gently fade up (500 ms, ease-out, small stagger) as they scroll into
 * view, once. Elements are marked with `data-reveal`. With reduced motion nothing moves and
 * everything is simply visible. The hero itself never waits on animation.
 */
export function useScrollReveal(scope: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!scope.current || prefersReducedMotion()) return;

    const context = gsap.context(() => {
      // Only what is still below the screen: anything the person can already see (for example
      // on the ready-made copy of the page, ADR 0010) never blinks out and back in.
      const elements = gsap.utils
        .toArray<HTMLElement>('[data-reveal]')
        .filter((element) => element.getBoundingClientRect().top > window.innerHeight);
      if (!elements.length) return;
      gsap.set(elements, { opacity: 0, y: 24 });
      ScrollTrigger.batch(elements, {
        start: 'top 90%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power2.out',
            stagger: 0.08,
            overwrite: true,
          }),
      });
    }, scope);

    return () => context.revert();
  }, [scope]);
}
