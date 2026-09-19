export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface ChargeRequest {
  amountMinor: number;
  currency: 'INR';
  token: string;
  idempotencyKey: string;
  reference: string;
}

export type ChargeResult =
  | { outcome: 'APPROVED'; providerReference: string }
  | { outcome: 'DECLINED'; code: string; message: string };

// Resolves when the provider reached a decision, throws when it did not. That split is
// why a decline is 402 (try another card) and a failure is 502 (retry this one).
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

// The token prefix selects the outcome, so every branch — including rollback — can be
// demonstrated by hand in the UI, not just asserted in a test.
export const MOCK_TOKENS = {
  SUCCESS: 'tok_success',
  DECLINE: 'tok_decline',
  ERROR: 'tok_error',
  TIMEOUT: 'tok_timeout',
} as const;
