import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeCountdown, useQuoteCountdown } from './use-quote-countdown';

describe('computeCountdown', () => {
  const expiry = 1_000_000_000_000;

  it('formats remaining time as MM:SS', () => {
    expect(computeCountdown(expiry, expiry - 15 * 60 * 1000).formatted).toBe('15:00');
    expect(computeCountdown(expiry, expiry - 90 * 1000).formatted).toBe('01:30');
    expect(computeCountdown(expiry, expiry - 5 * 1000).formatted).toBe('00:05');
  });

  it('never goes negative — an overdue quote reads 00:00, not -03:12', () => {
    const past = computeCountdown(expiry, expiry + 3 * 60 * 1000);
    expect(past.remainingMs).toBe(0);
    expect(past.formatted).toBe('00:00');
    expect(past.isExpired).toBe(true);
  });

  it('treats the exact expiry instant as expired', () => {
    expect(computeCountdown(expiry, expiry).isExpired).toBe(true);
  });

  it('escalates urgency as the window closes', () => {
    expect(computeCountdown(expiry, expiry - 15 * 60 * 1000).urgency).toBe('normal');
    expect(computeCountdown(expiry, expiry - 6 * 60 * 1000).urgency).toBe('normal');
    expect(computeCountdown(expiry, expiry - 5 * 60 * 1000).urgency).toBe('warning');
    expect(computeCountdown(expiry, expiry - 61 * 1000).urgency).toBe('warning');
    expect(computeCountdown(expiry, expiry - 60 * 1000).urgency).toBe('critical');
    expect(computeCountdown(expiry, expiry).urgency).toBe('expired');
  });
});

describe('useQuoteCountdown', () => {
  const serverTime = '2026-09-19T10:00:00.000Z';
  const expiresAt = '2026-09-19T10:15:00.000Z';
  const serverTimeMs = Date.parse(serverTime);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the full window', () => {
    vi.setSystemTime(serverTimeMs);
    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));
    expect(result.current.formatted).toBe('15:00');
    expect(result.current.isExpired).toBe(false);
  });

  it('ticks down once a second', () => {
    vi.setSystemTime(serverTimeMs);
    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.formatted).toBe('14:57');
  });

  it('is correct after a long gap in which no timer fired', () => {
    vi.setSystemTime(serverTimeMs);
    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    act(() => {
      vi.setSystemTime(serverTimeMs + 10 * 60 * 1000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.formatted).toBe('04:59');
    expect(result.current.formatted).not.toBe('14:59');
  });

  it('expires when the window closes', () => {
    vi.setSystemTime(serverTimeMs);
    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    act(() => {
      vi.setSystemTime(serverTimeMs + 15 * 60 * 1000);
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isExpired).toBe(true);
    expect(result.current.formatted).toBe('00:00');
    expect(result.current.urgency).toBe('expired');
  });

  it('corrects for a client clock that is wrong', () => {
    vi.setSystemTime(serverTimeMs + 5 * 60 * 1000);

    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.minutes).toBe(14);
    expect(result.current.seconds).toBe(59);
  });

  it('recomputes immediately when the tab becomes visible again', () => {
    vi.setSystemTime(serverTimeMs);
    const { result } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    act(() => {
      vi.setSystemTime(serverTimeMs + 7 * 60 * 1000);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.formatted).toBe('08:00');
  });

  it('stops ticking once expired, rather than spinning forever', () => {
    vi.setSystemTime(serverTimeMs);
    renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    act(() => {
      vi.setSystemTime(serverTimeMs + 15 * 60 * 1000);
      vi.advanceTimersByTime(1000);
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its interval on unmount', () => {
    vi.setSystemTime(serverTimeMs);
    const { unmount } = renderHook(() => useQuoteCountdown(expiresAt, serverTime));

    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
