// SuccessBurst: green check that pops in, draws itself, and throws a small confetti ring.
// Use ONCE per big moment (profile created, first job accepted). Never on routine saves.
import React from 'react';

const COLORS = ['#3B3FB6', '#4FD1A5', '#F2B33A', '#E9846A', '#AEB1FF', '#1F9D6E'];

export default function SuccessBurst({ size = 120, confetti = true }) {
  const bits = confetti
    ? Array.from({ length: 16 }).map((_, i) => {
        const ang = (i / 16) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 90 + (i % 4) * 22;
        const w = i % 3 === 0 ? 10 : 7;
        const h = i % 3 === 0 ? 4 : 7;
        return (
          <span key={i} className="kf-bit" aria-hidden="true" style={{
            '--dx': `${Math.round(Math.cos(ang) * dist)}px`,
            '--dy': `${Math.round(Math.sin(ang) * dist + 30)}px`,
            '--r': `${(i * 47) % 360}deg`,
            width: w, height: h, margin: `${-h / 2}px 0 0 ${-w / 2}px`,
            borderRadius: i % 2 ? 999 : 2, background: COLORS[i % COLORS.length],
            animationDelay: `${250 + (i % 5) * 30}ms`,
          }} />
        );
      })
    : null;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {bits}
      <span className="kf-pop" style={{
        position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--kf-success-solid)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 10px var(--kf-success-bg)',
      }}>
        <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="kf-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </div>
  );
}
