import 'server-only';

import {
  IDEMPOTENCY_KEY_HEADER,
  SERVICE_TOKEN_HEADER,
  apiErrorSchema,
  medicalDeclarationResponseSchema,
  policyResponseSchema,
  quoteResponseSchema,
  type ApiError,
  type CreateQuoteRequest,
  type MedicalDeclarationRequest,
  type MedicalDeclarationResponse,
  type PolicyResponse,
  type QuoteResponse,
} from '@careshield/contracts';
import type { ZodType } from 'zod';

// `server-only` above is load-bearing: a Client Component importing this file fails
// the build rather than shipping the API address and token to the browser. Neither var
// carries a NEXT_PUBLIC_ prefix, so Next cannot inline them either.
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? '';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  static isExpired(error: unknown): boolean {
    return error instanceof ApiClientError && error.code === 'QUOTE_EXPIRED';
  }
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

async function call<T>(schema: ZodType<T>, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (SERVICE_TOKEN) {
    headers[SERVICE_TOKEN_HEADER] = SERVICE_TOKEN;
  }
  if (options.idempotencyKey) {
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${options.path}`, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Never cache — a stale countdown or quote status is worse than none.
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiClientError(503, 'API_UNREACHABLE', 'The service is temporarily unavailable.', {
      cause: String(cause),
    });
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const error: ApiError = parsed.success
      ? parsed.data
      : {
          statusCode: response.status,
          code: 'UNKNOWN_ERROR',
          message: 'Something went wrong. Please try again.',
        };

    throw new ApiClientError(error.statusCode, error.code, error.message, error.details);
  }

  // Parse rather than cast, so contract drift fails loudly here instead of rendering
  // undefined in the UI.
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiClientError(
      502,
      'CONTRACT_MISMATCH',
      'The service returned an unexpected response.',
      result.error.issues,
    );
  }
  return result.data;
}

export function createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
  return call(quoteResponseSchema, {
    method: 'POST',
    path: '/api/v1/insurance/quote',
    body: request,
  });
}

export function getQuote(quoteId: string): Promise<QuoteResponse> {
  return call(quoteResponseSchema, {
    method: 'GET',
    path: `/api/v1/insurance/quote/${quoteId}`,
  });
}

export function submitDeclaration(
  quoteId: string,
  request: MedicalDeclarationRequest,
): Promise<MedicalDeclarationResponse> {
  return call(medicalDeclarationResponseSchema, {
    method: 'POST',
    path: `/api/v1/insurance/quote/${quoteId}/medical-declaration`,
    body: request,
  });
}

export function checkout(
  request: { quoteId: string; paymentToken: string },
  idempotencyKey: string,
): Promise<PolicyResponse> {
  return call(policyResponseSchema, {
    method: 'POST',
    path: '/api/v1/insurance/checkout',
    body: request,
    idempotencyKey,
  });
}

export function getPolicy(policyId: string): Promise<PolicyResponse> {
  return call(policyResponseSchema, {
    method: 'GET',
    path: `/api/v1/insurance/policy/${policyId}`,
  });
}
