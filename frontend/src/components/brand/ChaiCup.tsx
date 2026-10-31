/** A cup of chai with rising steam, for an empty inbox (design refresh). Decoration only. */
export function ChaiCup() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" fill="none">
      {[22, 32, 42].map((x, i) => (
        <path
          key={x}
          className="kf-steam"
          style={{ animationDelay: `${i * 0.5}s` }}
          d={`M${x} 24c-3-4 3-6 0-11`}
          stroke="var(--kf-muted)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
      <path d="M12 30h40v8a18 18 0 0 1-18 18h-4a18 18 0 0 1-18-18z" fill="var(--kf-primary)" />
      <path
        d="M52 34h3a6 6 0 0 1 0 12h-4"
        stroke="var(--kf-primary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M8 62h50" stroke="var(--kf-line)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
