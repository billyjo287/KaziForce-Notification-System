/**
 * The logo mark as inline SVG, so it can move (design refresh).
 * variant: 'static' | 'ping' (rings pulse from the head) | 'hop' (the head hops: loading) |
 * 'intro' (the strokes draw in, the head drops). For plain headers use components/Logo.tsx.
 */
export type KaziMarkVariant = 'static' | 'ping' | 'hop' | 'intro';

export function KaziMark({
  size = 48,
  variant = 'static',
  title = 'KaziForce',
}: {
  size?: number;
  variant?: KaziMarkVariant;
  title?: string;
}) {
  const draw = variant === 'intro';
  const strokeStyle = (delay: number) =>
    draw
      ? {
          strokeDasharray: 60,
          animation: `kf-draw-long .7s cubic-bezier(.6,0,.2,1) ${delay}s both`,
        }
      : undefined;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      {draw && (
        <style>{`@keyframes kf-draw-long{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}
          @keyframes kf-head-drop{0%{transform:translateY(-40px);opacity:0}60%{transform:translateY(3px);opacity:1}80%{transform:translateY(-2px)}100%{transform:none;opacity:1}}`}</style>
      )}
      <rect width="100" height="100" rx="28" fill="#3B3FB6" />
      <g transform="translate(50 50) scale(0.9) translate(-47.5 -48.5)">
        <g fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round">
          <path d="M34 46V76" style={strokeStyle(0.1)} />
          <path d="M34 64L70 30" style={strokeStyle(0.35)} />
          <path d="M50.5 49L72 76" style={strokeStyle(0.6)} />
        </g>
        {variant !== 'static' && (
          <circle
            className="kf-ring"
            cx="34"
            cy="24"
            r="9"
            fill="none"
            stroke="#4FD1A5"
            strokeWidth="2.5"
            style={variant === 'hop' ? { animationDuration: '1.2s' } : undefined}
          />
        )}
        {(variant === 'static' || variant === 'ping') && (
          <g fill="none" stroke="#4FD1A5" strokeWidth="3" strokeLinecap="round">
            <path d="M21.5 15.5a15 15 0 0 0 0 17" />
            <path d="M46.5 15.5a15 15 0 0 1 0 17" />
          </g>
        )}
        <circle
          cx="34"
          cy="24"
          r="8.5"
          fill="#4FD1A5"
          className={variant === 'hop' ? 'kf-hop' : undefined}
          style={
            draw
              ? {
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  animation: 'kf-head-drop .7s cubic-bezier(.3,1.3,.5,1) .9s both',
                }
              : undefined
          }
        />
      </g>
    </svg>
  );
}
