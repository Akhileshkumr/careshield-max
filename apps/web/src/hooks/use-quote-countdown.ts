'use client';

import { useEffect, useMemo, useState } from 'react';

export type CountdownUrgency = 'normal' | 'warning' | 'critical' | 'expired';

export interface Countdown {
  remainingMs: number;
  isExpired: boolean;
  minutes: number;
  seconds: number;
  formatted: string;
  urgency: CountdownUrgency;
}

const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 60 * 1000;

// Pure, so every rule below is testable with plain numbers and no fake timers.
export function computeCountdown(expiresAtMs: number, nowMs: number): Countdown {
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    remainingMs,
    isExpired: remainingMs <= 0,
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    urgency:
      remainingMs <= 0
        ? 'expired'
        : remainingMs <= CRITICAL_THRESHOLD_MS
          ? 'critical'
          : remainingMs <= WARNING_THRESHOLD_MS
            ? 'warning'
            : 'normal',
  };
}

// Corrects for the client's own clock using the server's reading, and recomputes from
// absolute timestamps each tick — a counter that decremented would return from a
// sleeping laptop minutes wrong.
//
// UX only. The server re-checks expires_at inside the checkout transaction.
export function useQuoteCountdown(expiresAt: string, serverTime: string): Countdown {
  const expiresAtMs = useMemo(() => Date.parse(expiresAt), [expiresAt]);
  const serverTimeMs = useMemo(() => Date.parse(serverTime), [serverTime]);

  // Deterministic first render from server values alone, so hydration cannot mismatch.
  const [nowMs, setNowMs] = useState(serverTimeMs);

  useEffect(() => {
    const skewMs = serverTimeMs - Date.now();
    const read = (): number => Date.now() + skewMs;

    setNowMs(read());

    const intervalId = window.setInterval(() => {
      const now = read();
      setNowMs(now);
      if (now >= expiresAtMs) {
        window.clearInterval(intervalId);
      }
    }, 1000);

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        setNowMs(read());
      }
    };
    // Background tabs are throttled; recompute the moment the tab is visible again.
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [expiresAtMs, serverTimeMs]);

  return computeCountdown(expiresAtMs, nowMs);
}
