// KaziLoader: full-area loading state. The logo's head hops while friendly lines rotate.
// Use wherever the app currently shows a spinner or "Loading...". Purely visual: render it
// where the existing loading flag is true; do not change how loading is decided.
import React, { useEffect, useState } from 'react';
import KaziMark from './KaziMark';
import { COPY } from './copy';

function WinkFace() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="15" cy="15" r="13" fill="#F2B33A" />
      <circle cx="10" cy="12" r="2" fill="#14162B" />
      <path d="M17.5 12.5q2.5 -2.5 5 0" fill="none" stroke="#14162B" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 18q6 5 12 0" fill="none" stroke="#14162B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function KaziLoader({ messages = COPY.loading, skeletonRows = 3, compact = false }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const msg = messages[i % messages.length];

  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20, padding: compact ? 16 : 48 }}>
      <KaziMark size={compact ? 64 : 104} variant="hop" title="Loading" />
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, animation: 'kf-msg 2.6s ease both' }}>
        <span className="kf-display" style={{ fontWeight: 700, fontSize: compact ? 18 : 22 }}>{msg.text}</span>
        {msg.wink && <WinkFace />}
      </div>
      {skeletonRows > 0 && (
        <div aria-hidden="true" style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: skeletonRows }).map((_, r) => (
            <div key={r} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="kf-skel" style={{ width: 48, height: 48, borderRadius: 14, flex: 'none' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="kf-skel" style={{ height: 14, width: `${70 - r * 8}%` }} />
                <div className="kf-skel" style={{ height: 12, width: `${45 - r * 5}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
