import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '@careshield/contracts';
import type { Request } from 'express';

import { IdempotencyKeyRequiredException } from './domain.exceptions';

// A missing key is a 400: an endpoint that moves money must not silently run
// unprotected because a client forgot a header.
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const raw = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(raw) ? raw[0] : raw;

    if (!key || key.trim().length < 8) {
      throw new IdempotencyKeyRequiredException();
    }
    return key.trim();
  },
);
