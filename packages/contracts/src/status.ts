// EXPIRED and DECLINED extend the brief's four: the happy path alone has nowhere to
// put a quote that timed out or an applicant who failed underwriting.
export const QUOTE_STATUSES = [
  'QUOTE_GENERATED',
  'MEDICAL_DECLARED',
  'PREMIUM_PAID',
  'POLICY_ISSUED',
  'EXPIRED',
  'DECLINED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// Typed Record<QuoteStatus, ...> so adding a state without deciding where it may go
// is a compile error rather than a production surprise.
export const ALLOWED_TRANSITIONS: Readonly<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  QUOTE_GENERATED: ['MEDICAL_DECLARED', 'DECLINED', 'EXPIRED'],
  MEDICAL_DECLARED: ['PREMIUM_PAID', 'EXPIRED'],
  PREMIUM_PAID: ['POLICY_ISSUED'],
  POLICY_ISSUED: [],
  EXPIRED: [],
  DECLINED: [],
} as const;

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: QuoteStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export const ELIGIBILITY_DECISIONS = ['ACCEPTED', 'DECLINED', 'REFERRED'] as const;
export type EligibilityDecision = (typeof ELIGIBILITY_DECISIONS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
