import { useEffect, useState } from 'react';

/** How long the "leave" animation runs (index.css .kf-leave). */
const LEAVE_MS = 300;

/**
 * For a message that shows for `showMs`, then animates away and calls `onDone`.
 * Returns true while it is leaving (add the .kf-leave class then).
 */
export function useTimedExit(active: boolean, showMs: number, onDone: () => void): boolean {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!active) return;
    const leave = setTimeout(() => setLeaving(true), showMs);
    const done = setTimeout(() => {
      setLeaving(false);
      onDone();
    }, showMs + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
    // onDone is expected to be stable (a store action); the timer restarts only with `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, showMs]);

  return leaving;
}
