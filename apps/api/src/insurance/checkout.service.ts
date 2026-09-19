import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { toMinor, type PolicyResponse } from '@careshield/contracts';

import {
  PaymentDeclinedException,
  PolicyNotFoundException,
  QuoteExpiredException,
  QuoteNotFoundException,
  UnderwritingDeclinedException,
} from '../common/domain.exceptions';
import { DRIZZLE, type Database } from '../db/database.module';
import { medicalDeclarations, policies, quotes } from '../db/schema';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment.provider';
import { assertTransition } from './quote-state-machine';
import { QuotesService, serverNow } from './quotes.service';
import type { CheckoutDto } from './dto';

// replayed=true surfaces as 200 + Idempotency-Replayed, which makes the dedupe
// guarantee observable to the client rather than merely asserted.
export interface CheckoutResult {
  policy: PolicyResponse;
  replayed: boolean;
}

type CheckoutOutcome =
  | { kind: 'ISSUED'; response: PolicyResponse }
  | { kind: 'REPLAYED'; response: PolicyResponse }
  | { kind: 'DECLINED'; code: string; message: string };

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly idempotency: IdempotencyService,
    private readonly quotes: QuotesService,
  ) {}

  // One transaction: lock the quote, reserve the key, check expiry, guard the FSM,
  // charge, then transition and issue. Any throw rolls back all of it — no policy, no
  // state change, no orphaned payment row.
  //
  // Caveat: the provider call sits inside the transaction because Task 4.1 asks for
  // exactly that. Production splits this into a three-phase saga — see README.
  async checkout(dto: CheckoutDto, idempotencyKey: string): Promise<CheckoutResult> {
    const requestHash = this.idempotency.hashRequest({
      quoteId: dto.quoteId,
      paymentToken: dto.paymentToken,
    });

    const outcome = await this.db.transaction(async (tx): Promise<CheckoutOutcome> => {
      // Lock before the guards, not after: two requests would otherwise both read
      // MEDICAL_DECLARED, both pass, and both charge.
      const quote = await this.quotes.lockQuote(tx, dto.quoteId);
      if (!quote) {
        throw new QuoteNotFoundException(dto.quoteId);
      }

      // Before the expiry gate: a policy issued 20 minutes ago sits on a quote that is now
      // past expires_at, and a retry must still replay it rather than get a 410.
      const reservation = await this.idempotency.reserve(tx, {
        key: idempotencyKey,
        quoteId: quote.id,
        requestHash,
        // Charged from the locked row, never from the request body.
        amount: quote.totalPremium,
      });

      if (reservation.kind === 'REPLAY') {
        return { kind: 'REPLAYED', response: reservation.response as PolicyResponse };
      }

      const now = await serverNow(tx);
      // The authoritative expiry check — the browser countdown is only UX. Throwing also
      // frees the reserved key, which is right: no charge was attempted.
      if (quote.expiresAt <= now) {
        throw new QuoteExpiredException(quote.id, quote.expiresAt);
      }

      assertTransition(quote.status, 'PREMIUM_PAID');

      const [declaration] = await tx
        .select()
        .from(medicalDeclarations)
        .where(eq(medicalDeclarations.quoteId, quote.id))
        .limit(1);

      if (!declaration || declaration.decision !== 'ACCEPTED') {
        throw new UnderwritingDeclinedException(
          declaration?.reasons ?? ['No medical declaration has been submitted for this quote.'],
        );
      }

      const charge = await this.payments.charge({
        amountMinor: toMinor(quote.totalPremium),
        currency: 'INR',
        token: dto.paymentToken,
        idempotencyKey,
        reference: quote.id,
      });

      // A decline is a decision, not a failure: nothing needs rolling back and the attempt
      // is worth auditing, so the row commits and the 402 is raised after the transaction.
      if (charge.outcome === 'DECLINED') {
        await this.idempotency.markFailed(tx, idempotencyKey, charge.code, charge.message);
        return { kind: 'DECLINED', code: charge.code, message: charge.message };
      }

      assertTransition(quote.status, 'PREMIUM_PAID');
      await tx
        .update(quotes)
        .set({ status: 'PREMIUM_PAID', updatedAt: now, version: quote.version + 1 })
        .where(eq(quotes.id, quote.id));

      const [policy] = await tx
        .insert(policies)
        .values({
          quoteId: quote.id,
          // Generated in-statement by the sequence, so two concurrent issuances cannot collide.
          policyNumber: sql`'CSM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('policy_number_seq')::text, 6, '0')`,
          premiumPaid: quote.totalPremium,
          paymentReference: charge.providerReference,
          effectiveFrom: sql`current_date`,
          effectiveTo: sql`current_date + interval '1 year'`,
        })
        .returning();

      if (!policy) {
        throw new Error('Policy insert returned no row');
      }

      assertTransition('PREMIUM_PAID', 'POLICY_ISSUED');
      await tx
        .update(quotes)
        .set({ status: 'POLICY_ISSUED', updatedAt: now, version: quote.version + 2 })
        .where(eq(quotes.id, quote.id));

      const response: PolicyResponse = {
        policyId: policy.id,
        policyNumber: policy.policyNumber,
        quoteId: quote.id,
        status: 'POLICY_ISSUED',
        premiumPaid: policy.premiumPaid,
        paymentReference: policy.paymentReference,
        issuedAt: policy.issuedAt.toISOString(),
        effectiveFrom: policy.effectiveFrom,
        effectiveTo: policy.effectiveTo,
      };

      await this.idempotency.markSucceeded(
        tx,
        idempotencyKey,
        charge.providerReference,
        response,
      );

      this.logger.log(`policy ${policy.policyNumber} issued for quote ${quote.id}`);
      return { kind: 'ISSUED', response };
    });

    if (outcome.kind === 'DECLINED') {
      throw new PaymentDeclinedException(outcome.message, outcome.code);
    }

    return { policy: outcome.response, replayed: outcome.kind === 'REPLAYED' };
  }

  async getPolicy(policyId: string): Promise<PolicyResponse> {
    const [found] = await this.db
      .select({ policy: policies, status: quotes.status })
      .from(policies)
      .innerJoin(quotes, eq(quotes.id, policies.quoteId))
      .where(eq(policies.id, policyId))
      .limit(1);

    if (!found) {
      throw new PolicyNotFoundException(policyId);
    }

    return {
      policyId: found.policy.id,
      policyNumber: found.policy.policyNumber,
      quoteId: found.policy.quoteId,
      status: found.status,
      premiumPaid: found.policy.premiumPaid,
      paymentReference: found.policy.paymentReference,
      issuedAt: found.policy.issuedAt.toISOString(),
      effectiveFrom: found.policy.effectiveFrom,
      effectiveTo: found.policy.effectiveTo,
    };
  }

  // Housekeeping only, never called in a request path where the write would be rolled
  // back. No read depends on it: isExpired is always derived from the timestamps.
  async expireStaleQuotes(): Promise<number> {
    const updated = await this.db
      .update(quotes)
      .set({ status: 'EXPIRED', updatedAt: new Date() })
      .where(
        and(
          inArray(quotes.status, ['QUOTE_GENERATED', 'MEDICAL_DECLARED']),
          lte(quotes.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: quotes.id });

    if (updated.length > 0) {
      this.logger.log(`expired ${updated.length} stale quote(s)`);
    }
    return updated.length;
  }
}
