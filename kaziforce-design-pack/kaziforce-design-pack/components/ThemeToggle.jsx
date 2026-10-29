// ThemeToggle: the sun that turns into a moon.
// The amber sun slides right and a "bite" slides over it to make a crescent; two stars fade in.
// Optional onToggled(isDarkNow) lets the page show the toast copy from copy.js.
import React from 'react';
import { useTheme } from './useTheme';

export default function ThemeToggle({ onToggled, onDarkHeader = false }) {
  const { isDark, toggle } = useTheme();
  const track = onDarkHeader ? '#22264A' : 'var(--kf-surface-2)';

  const handle = () => {
    toggle();
    if (onToggled) onToggled(!isDark);
  };

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className="kf-press"
      style={{
        position: 'relative', width: 68, height: 40, padding: 0, flex: 'none', overflow: 'hidden',
        borderRadius: 999, border: `1px solid ${onDarkHeader ? '#3A3F6B' : 'var(--kf-line-strong)'}`, background: track,
        cursor: 'pointer',
      }}
    >
      {/* stars */}
      <span aria-hidden="true" style={{
        position: 'absolute', left: 14, top: 11, width: 3, height: 3, borderRadius: 999, background: '#E6E8F3',
        boxShadow: '7px 9px 0 0 #E6E8F3, 14px 2px 0 -0.5px #E6E8F3',
        opacity: isDark ? 1 : 0, transition: 'opacity .4s ease .2s',
      }} />
      {/* sun / moon */}
      <span aria-hidden="true" style={{
        position: 'absolute', top: 5, left: 5, width: 28, height: 28, borderRadius: 999, overflow: 'hidden',
        background: isDark ? '#E6E8F3' : '#F2B33A',
        transform: `translateX(${isDark ? 28 : 0}px) rotate(${isDark ? -40 : 0}deg)`,
        transition: 'transform .55s cubic-bezier(.5,1.6,.4,1), background-color .4s ease',
        boxShadow: isDark ? '0 0 10px rgba(230,232,243,.35)' : '0 0 0 4px rgba(242,179,58,.25)',
      }}>
        <span style={{
          position: 'absolute', top: -3, left: isDark ? 9 : 36, width: 24, height: 24, borderRadius: 999,
          background: track, transition: 'left .55s cubic-bezier(.5,1.4,.4,1)',
        }} />
      </span>
    </button>
  );
}
