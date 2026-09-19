import { Module } from '@nestjs/common';

import { IdempotencyService } from '../idempotency/idempotency.service';
import { MockPaymentClient } from '../payments/mock-payment.client';
import { PAYMENT_PROVIDER } from '../payments/payment.provider';
import { PricingService } from '../pricing/pricing.service';
import { UnderwritingService } from '../underwriting/underwriting.service';
import { CheckoutService } from './checkout.service';
import { InsuranceController } from './insurance.controller';
import { QuotesService } from './quotes.service';

@Module({
  controllers: [InsuranceController],
  providers: [
    QuotesService,
    CheckoutService,
    PricingService,
    UnderwritingService,
    IdempotencyService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: MockPaymentClient,
    },
  ],
  exports: [QuotesService, CheckoutService],
})
export class InsuranceModule {}
