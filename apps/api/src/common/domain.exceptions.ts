import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode, type QuoteStatus } from '@careshield/contracts';

// Stable machine-readable codes alongside the status: the frontend switches on them to
// choose between 'recalculate', 'try another card' and a generic failure, and several
// of these share a status code.
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export class QuoteNotFoundException extends DomainException {
  constructor(quoteId: string) {
    super(ERROR_CODES.QUOTE_NOT_FOUND, `No quote found with id ${quoteId}`, HttpStatus.NOT_FOUND);
  }
}

// 410, not 404 or 400: the quote existed and the request was fine — its validity
// window simply passed, which is what prompts the recalculate flow.
export class QuoteExpiredException extends DomainException {
  constructor(quoteId: string, expiredAt: Date) {
    super(
      ERROR_CODES.QUOTE_EXPIRED,
      'This quote has expired. Please recalculate your premium.',
      HttpStatus.GONE,
      { quoteId, expiredAt: expiredAt.toISOString() },
    );
  }
}

export class InvalidStateTransitionException extends DomainException {
  constructor(from: QuoteStatus, to: QuoteStatus) {
    super(
      ERROR_CODES.INVALID_STATE_TRANSITION,
      `A quote in state ${from} cannot move to ${to}.`,
      HttpStatus.CONFLICT,
      { from, to },
    );
  }
}

export class UnderwritingDeclinedException extends DomainException {
  constructor(reasons: string[]) {
    super(
      ERROR_CODES.UNDERWRITING_DECLINED,
      'This application cannot be accepted for instant cover.',
      HttpStatus.FORBIDDEN,
      { reasons },
    );
  }
}

export class PaymentDeclinedException extends DomainException {
  constructor(reason: string, providerCode?: string) {
    super(ERROR_CODES.PAYMENT_DECLINED, reason, HttpStatus.PAYMENT_REQUIRED, { providerCode });
  }
}

export class PaymentProviderException extends DomainException {
  constructor(reason: string) {
    super(ERROR_CODES.PAYMENT_PROVIDER_ERROR, reason, HttpStatus.BAD_GATEWAY);
  }
}

export class IdempotencyKeyRequiredException extends DomainException {
  constructor() {
    super(
      ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      'An Idempotency-Key header is required for this endpoint.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      'This Idempotency-Key was already used for a request with a different body.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class IdempotentRequestInFlightException extends DomainException {
  constructor() {
    super(
      ERROR_CODES.IDEMPOTENT_REQUEST_IN_FLIGHT,
      'A request with this Idempotency-Key is still being processed. Retry shortly.',
      HttpStatus.CONFLICT,
    );
  }
}

export class PolicyNotFoundException extends DomainException {
  constructor(policyId: string) {
    super(
      ERROR_CODES.POLICY_NOT_FOUND,
      `No policy found with id ${policyId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}
