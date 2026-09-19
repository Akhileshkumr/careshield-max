import { z } from 'zod';
import { PREMIUM_RULES } from './premium';
import { ELIGIBILITY_DECISIONS, QUOTE_STATUSES } from './status';

export const moneyStringSchema = z
  .string()
  .regex(/^\d+\.\d{2}$/, 'Expected a 2-decimal-place amount string like "15000.00"');

export const createQuoteRequestSchema = z.object({
  applicantName: z.string().trim().min(2).max(100),
  age: z.number().int().min(PREMIUM_RULES.MIN_AGE).max(PREMIUM_RULES.MAX_AGE),
  hasPreExistingConditions: z.boolean(),
});

export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;

export const premiumBreakdownSchema = z.object({
  basePremium: moneyStringSchema,
  ageLoading: moneyStringSchema,
  conditionLoading: moneyStringSchema,
  totalPremium: moneyStringSchema,
});

export const quoteResponseSchema = z.object({
  id: z.uuid(),
  applicantName: z.string(),
  age: z.number().int(),
  hasPreExistingConditions: z.boolean(),
  status: z.enum(QUOTE_STATUSES),
  breakdown: premiumBreakdownSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),

  serverTime: z.iso.datetime(),

  isExpired: z.boolean(),

  eligibility: z
    .object({
      decision: z.enum(ELIGIBILITY_DECISIONS),
      reasons: z.array(z.string()),
    })
    .nullable(),

  policyId: z.uuid().nullable(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

// Structured, not free text: an instant decision must be a deterministic function of
// its inputs to be defensible when a customer disputes it.
export const medicalDisclosuresSchema = z.object({
  heightCm: z.number().int().min(50).max(272),
  weightKg: z.number().int().min(20).max(500),
  isSmoker: z.boolean(),
  consumesAlcohol: z.boolean(),
  hasDiabetes: z.boolean(),
  hasHypertension: z.boolean(),
  hasCardiacHistory: z.boolean(),
  hasCancerHistory: z.boolean(),
  hospitalisedLast12Months: z.boolean(),
  currentMedications: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

export type MedicalDisclosures = z.infer<typeof medicalDisclosuresSchema>;

export const medicalDeclarationRequestSchema = z.object({
  disclosures: medicalDisclosuresSchema,
  declarationAccepted: z.literal(true),
});

export type MedicalDeclarationRequest = z.infer<typeof medicalDeclarationRequestSchema>;

export const medicalDeclarationResponseSchema = z.object({
  quoteId: z.uuid(),
  decision: z.enum(ELIGIBILITY_DECISIONS),
  reasons: z.array(z.string()),
  status: z.enum(QUOTE_STATUSES),
  totalPremium: moneyStringSchema,
  expiresAt: z.iso.datetime(),
  serverTime: z.iso.datetime(),
});

export type MedicalDeclarationResponse = z.infer<typeof medicalDeclarationResponseSchema>;

export const checkoutRequestSchema = z.object({
  quoteId: z.uuid(),
  paymentToken: z.string().trim().min(3).max(200),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const policyResponseSchema = z.object({
  policyId: z.uuid(),
  policyNumber: z.string(),
  quoteId: z.uuid(),
  status: z.enum(QUOTE_STATUSES),
  premiumPaid: moneyStringSchema,
  paymentReference: z.string(),
  issuedAt: z.iso.datetime(),
  effectiveFrom: z.string(),
  effectiveTo: z.string(),
});

export type PolicyResponse = z.infer<typeof policyResponseSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  QUOTE_NOT_FOUND: 'QUOTE_NOT_FOUND',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  UNDERWRITING_DECLINED: 'UNDERWRITING_DECLINED',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENT_REQUEST_IN_FLIGHT: 'IDEMPOTENT_REQUEST_IN_FLIGHT',
  POLICY_NOT_FOUND: 'POLICY_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'idempotency-replayed';
export const SERVICE_TOKEN_HEADER = 'x-service-token';
