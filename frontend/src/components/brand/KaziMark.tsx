/**
 * The logo mark as inline SVG, so it can move: a stopwatch (time-sensitive work) with a mint
 * hand and a mint alert badge. Same drawing as public/brand/kaziforce-mark.svg.
 * variant: 'static' | 'ping' (rings pulse from the badge) | 'hop' (the hand sweeps round and the
 * badge hops: loading) | 'intro' (the dial draws in, the badge drops). For plain headers use
 * components/Logo.tsx.
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
  const sweep = variant === 'hop' || draw;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      {(draw || sweep) && (
        <style>{`@keyframes kf-dial-draw{from{stroke-dashoffset:139}to{stroke-dashoffset:0}}
          @keyframes kf-hand-sweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          @keyframes kf-badge-drop{0%{transform:translateY(-40px);opacity:0}60%{transform:translateY(3px);opacity:1}80%{transform:translateY(-2px)}100%{transform:none;opacity:1}}`}</style>
      )}
      <rect width="100" height="100" rx="28" fill="#3B3FB6" />
      <g fill="#FFFFFF">
        <rect x="41" y="20" width="12" height="7" rx="2.5" />
        <rect x="44" y="25" width="6" height="7" />
        <rect x="64.4" y="33.1" width="9" height="6" rx="2" transform="rotate(45 68.9 36.1)" />
      </g>
      <circle
        cx="47"
        cy="58"
        r="22"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="12"
        style={
          draw
            ? {
                strokeDasharray: 139,
                animation: 'kf-dial-draw .8s cubic-bezier(.6,0,.2,1) .1s both',
              }
            : undefined
        }
      />
      <g
        style={
          sweep
            ? {
                transformBox: 'view-box',
                transformOrigin: '47px 58px',
                animation: draw
                  ? 'kf-hand-sweep .9s cubic-bezier(.3,0,.2,1) .5s 1 both'
                  : 'kf-hand-sweep 1.2s linear infinite',
              }
            : undefined
        }
      >
        <path d="M47 58L52.5 46" stroke="#4FD1A5" strokeWidth="7" strokeLinecap="round" />
      </g>
      <circle cx="47" cy="58" r="5" fill="#4FD1A5" />
      {variant !== 'static' && (
        <circle
          className="kf-ring"
          cx="78"
          cy="22"
          r="9"
          fill="none"
          stroke="#4FD1A5"
          strokeWidth="2.5"
          style={variant === 'hop' ? { animationDuration: '1.2s' } : undefined}
        />
      )}
      <circle
        cx="78"
        cy="22"
        r="10"
        fill="#4FD1A5"
        stroke="#3B3FB6"
        strokeWidth="3.5"
        className={variant === 'hop' ? 'kf-hop' : undefined}
        style={
          draw
            ? {
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: 'kf-badge-drop .7s cubic-bezier(.3,1.3,.5,1) 1s both',
              }
            : undefined
        }
      />
    </svg>
  );
}
