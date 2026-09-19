import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SERVICE_TOKEN_HEADER } from '@careshield/contracts';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { APP_CONFIG, type AppConfig } from '../config/env.config';

@Injectable()
// The browser never calls this API directly; the Next.js server holds the token in a
// server-only env var. Skipped when SERVICE_TOKEN is unset so curl and tests work.
export class ServiceTokenGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.serviceToken) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (request.path === '/health') {
      return true;
    }

    const raw = request.headers[SERVICE_TOKEN_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;

    if (!provided || !safeEqual(provided, this.config.serviceToken)) {
      throw new UnauthorizedException('Invalid or missing service token.');
    }
    return true;
  }
}

// Constant-time, so the token cannot be recovered a byte at a time.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
