import { useEffect, useState } from 'react';

/** Remaining time for a server-timed question, ticking every 100 ms. */
export function useCountdown(timer: { durationMs: number; endsAt: number | null } | undefined, skew: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !timer?.endsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active, timer?.endsAt]);

  if (!timer?.endsAt) return { timed: false, remainingMs: 0, fraction: 1, seconds: 0 };
  const remainingMs = active ? Math.max(0, timer.endsAt - (now + skew)) : 0;
  return {
    timed: true,
    remainingMs,
    fraction: timer.durationMs ? Math.min(1, remainingMs / timer.durationMs) : 0,
    seconds: Math.ceil(remainingMs / 1000),
  };
}
