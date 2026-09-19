'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { QuoteResponse } from '@careshield/contracts';

import { checkoutAction } from '@/app/actions';
import { IDLE } from '@/lib/action-state';
import { useQuoteCountdown } from '@/hooks/use-quote-countdown';
import { Alert, Money, PremiumBreakdown, SubmitButton } from './ui';

const PAYMENT_METHODS = [
  { token: 'tok_success', label: 'HDFC •••• 4242', caption: 'Payment succeeds' },
  { token: 'tok_decline', label: 'ICICI •••• 0002', caption: 'Bank declines the payment' },
  { token: 'tok_error', label: 'Axis •••• 0119', caption: 'Provider error — tests rollback' },
] as const;

const URGENCY_CLASS = {
  normal: 'text-brand-700 bg-brand-50',
  warning: 'text-warn-700 bg-warn-100',
  critical: 'text-danger-700 bg-danger-100',
  expired: 'text-danger-700 bg-danger-100',
} as const;

export function PaymentPanel({ quote }: { quote: QuoteResponse }) {
  const [state, formAction, isPending] = useActionState(checkoutAction, IDLE);
  const countdown = useQuoteCountdown(quote.expiresAt, quote.serverTime);

  // One key per payment attempt, stable across retries — that stability is what lets the
  // server recognise a double-click as a duplicate. Generated in an effect because a
  // value made during SSR would differ from the one made at hydration.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  // A decline is bound to its key server-side, so paying with another card is a new
  // attempt and needs a new key.
  const declined = state.status === 'error' && state.code === 'PAYMENT_DECLINED';
  useEffect(() => {
    if (declined) {
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [declined]);

  const expired = countdown.isExpired || quote.isExpired;
  const serverSaysExpired = state.status === 'error' && state.code === 'QUOTE_EXPIRED';

  const announcement = useThresholdAnnouncement(countdown.minutes, expired);

  return (
    <>
      <div
        className={`mb-6 flex items-center justify-between rounded-xl px-4 py-3 ${URGENCY_CLASS[countdown.urgency]}`}
      >
        <span className="text-sm font-medium">
          {expired ? 'This quote has expired' : 'Price locked for'}
        </span>
        {!expired ? (
          <span className="font-mono text-lg font-bold tabular-nums" aria-hidden="true">
            {countdown.formatted}
          </span>
        ) : null}
      </div>

      // Announced at thresholds only; a live region updating every second would read the
      // clock aloud continuously and make the page unusable with a screen reader.
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {expired || serverSaysExpired ? (
        <Alert tone="error" title="Your quote has expired">
          <p>
            Prices are held for 15 minutes. Please recalculate your premium to continue — your
            answers will be ready to reuse.
          </p>
          <Link
            href={`/?name=${encodeURIComponent(quote.applicantName)}&age=${quote.age}&pec=${quote.hasPreExistingConditions ? 'yes' : 'no'}`}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-danger-600 px-4 font-semibold text-white transition hover:bg-danger-700"
          >
            Recalculate my premium
          </Link>
        </Alert>
      ) : null}

      {state.status === 'error' && !serverSaysExpired ? (
        <Alert tone="error" title={declined ? 'Payment declined' : "We couldn't take your payment"}>
          {state.message}
          {declined ? <p className="mt-1">Please try a different payment method.</p> : null}
        </Alert>
      ) : null}

      <div
        className="mb-6 rounded-xl border p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <PremiumBreakdown breakdown={quote.breakdown} />
      </div>

      <form action={formAction}>
        <input type="hidden" name="quoteId" value={quote.id} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <fieldset className="mb-6" disabled={expired}>
          <legend className="mb-3 text-sm font-semibold">Choose a payment method</legend>

          <div className="space-y-2">
            {PAYMENT_METHODS.map((method, index) => (
              <label
                key={method.token}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                style={{ borderColor: 'var(--border)' }}
              >
                <input
                  type="radio"
                  name="paymentToken"
                  value={method.token}
                  defaultChecked={index === 0}
                  className="h-4 w-4 accent-[oklch(0.54_0.13_195)]"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{method.label}</span>
                  <span className="block text-xs opacity-70">{method.caption}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        // Three independent layers against a double charge: this disabled flag (beaten by
        // Enter before hydration), the stable idempotency key, and the DB unique constraints.
        <SubmitButton
          pending={isPending}
          disabled={expired || !idempotencyKey}
          pendingLabel="Processing payment…"
        >
          Pay <Money amount={quote.breakdown.totalPremium} /> and get covered
        </SubmitButton>

        {expired ? (
          <p className="mt-3 text-center text-xs text-danger-700">
            Payment is disabled because this quote has expired.
          </p>
        ) : (
          <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            You will not be charged twice, even if you submit more than once.
          </p>
        )}
      </form>
    </>
  );
}

function useThresholdAnnouncement(minutes: number, expired: boolean): string {
  const [message, setMessage] = useState('');
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const announce = (key: string, text: string): void => {
      if (!announced.current.has(key)) {
        announced.current.add(key);
        setMessage(text);
      }
    };

    if (expired) {
      announce('expired', 'Your quote has expired. Please recalculate your premium.');
    } else if (minutes < 1) {
      announce('one', 'Less than one minute remaining on your quote.');
    } else if (minutes < 5) {
      announce('five', 'Five minutes remaining on your quote.');
    }
  }, [minutes, expired]);

  return message;
}
