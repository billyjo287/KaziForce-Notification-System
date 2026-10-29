import type { CSSProperties } from 'react';

const COLORS = ['#3B3FB6', '#4FD1A5', '#F2B33A', '#E9846A', '#AEB1FF', '#1F9D6E'];

/**
 * A green check that pops in, draws itself and throws a small ring of confetti (design refresh).
 * Once per big moment (account ready, first job accepted), never on routine saves. Decoration
 * only: the words next to it say what happened. Reduced motion shows the finished check.
 */
export function SuccessBurst({
  size = 120,
  confetti = true,
}: {
  size?: number;
  confetti?: boolean;
}) {
  const bits = confetti
    ? Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 90 + (i % 4) * 22;
        const w = i % 3 === 0 ? 10 : 7;
        const h = i % 3 === 0 ? 4 : 7;
        const style = {
          '--dx': `${Math.round(Math.cos(angle) * dist)}px`,
          '--dy': `${Math.round(Math.sin(angle) * dist + 30)}px`,
          '--r': `${(i * 47) % 360}deg`,
          width: w,
          height: h,
          margin: `${-h / 2}px 0 0 ${-w / 2}px`,
          borderRadius: i % 2 ? 999 : 2,
          background: COLORS[i % COLORS.length],
          animationDelay: `${250 + (i % 5) * 30}ms`,
        } as CSSProperties;
        return <span key={i} className="kf-bit" aria-hidden="true" style={style} />;
      })
    : null;

  return (
    <div aria-hidden="true" className="relative" style={{ width: size, height: size }}>
      {bits}
      <span
        className="kf-pop absolute inset-0 flex items-center justify-center rounded-full"
        style={{
          background: 'var(--kf-success-solid)',
          boxShadow: '0 0 0 10px var(--kf-success-bg)',
        }}
      >
        <svg
          width={size * 0.48}
          height={size * 0.48}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="kf-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </div>
  );
}
