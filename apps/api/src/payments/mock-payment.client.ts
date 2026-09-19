import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { APP_CONFIG, type AppConfig } from '../config/env.config';
import { PaymentProviderException } from '../common/domain.exceptions';
import { MOCK_TOKENS, type ChargeRequest, type ChargeResult, type PaymentProvider } from './payment.provider';

const PROVIDER_TIMEOUT_MS = 5_000;

@Injectable()
export class MockPaymentClient implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentClient.name);

  // Stands in for provider-side dedupe: real PSPs return the same charge for a repeated
  // key, which is what makes the guarantee hold end-to-end.
  private readonly ledger = new Map<string, ChargeResult>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const replayed = this.ledger.get(request.idempotencyKey);
    if (replayed) {
      this.logger.log(`charge replayed for key ${request.idempotencyKey}`);
      return replayed;
    }

    await this.simulateLatency(request.token);

    const result = this.decide(request);
    this.ledger.set(request.idempotencyKey, result);

    this.logger.log(
      `charge ${result.outcome} amount=${request.amountMinor} ref=${request.reference}`,
    );
    return result;
  }

  private decide(request: ChargeRequest): ChargeResult {
    if (request.amountMinor <= 0) {
      throw new PaymentProviderException('Refusing to charge a non-positive amount.');
    }

    if (request.token.startsWith(MOCK_TOKENS.DECLINE)) {
      return {
        outcome: 'DECLINED',
        code: 'insufficient_funds',
        message: 'Your bank declined this payment (insufficient funds).',
      };
    }

    if (request.token.startsWith(MOCK_TOKENS.ERROR)) {
      throw new PaymentProviderException('The payment provider is unavailable.');
    }

    if (request.token.startsWith(MOCK_TOKENS.SUCCESS)) {
      return { outcome: 'APPROVED', providerReference: `pay_${randomUUID()}` };
    }

    throw new PaymentProviderException(
      `Unrecognised payment token. Use one of: ${Object.values(MOCK_TOKENS).join(', ')}`,
    );
  }

  // Configurable latency makes the double-click and concurrency races reproducible
  // instead of theoretical.
  private async simulateLatency(token: string): Promise<void> {
    if (token.startsWith(MOCK_TOKENS.TIMEOUT)) {
      await delay(PROVIDER_TIMEOUT_MS);
      throw new PaymentProviderException('The payment provider timed out.');
    }

    if (this.config.mockPaymentLatencyMs > 0) {
      await delay(this.config.mockPaymentLatencyMs);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
