import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  fromMinor,
  toMinor,
  type MedicalDeclarationResponse,
  type QuoteResponse,
} from '@careshield/contracts';

import { APP_CONFIG, type AppConfig } from '../config/env.config';
import { QuoteExpiredException, QuoteNotFoundException } from '../common/domain.exceptions';
import { DRIZZLE, type Database, type Transaction } from '../db/database.module';
import { medicalDeclarations, policies, quotes, type QuoteRow } from '../db/schema';
import { PricingService } from '../pricing/pricing.service';
import { UnderwritingService } from '../underwriting/underwriting.service';
import type { CreateQuoteDto, MedicalDeclarationDto } from './dto';
import { assertTransition } from './quote-state-machine';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly pricing: PricingService,
    private readonly underwriting: UnderwritingService,
  ) {}

  async createQuote(dto: CreateQuoteDto): Promise<QuoteResponse> {
    const breakdown = this.pricing.calculate({
      age: dto.age,
      hasPreExistingConditions: dto.hasPreExistingConditions,
    });

    const [row] = await this.db
      .insert(quotes)
      .values({
        applicantName: dto.applicantName,
        age: dto.age,
        hasPreExistingConditions: dto.hasPreExistingConditions,
        ...this.pricing.toPersistable(breakdown),
        status: 'QUOTE_GENERATED',

        // Computed by Postgres, not Node. Expiry is later checked against SQL now(); minting
        // it from a second clock lets the two disagree by whatever the skew is.
        expiresAt: sql`now() + make_interval(mins => ${this.config.quoteTtlMinutes})`,
      })
      .returning();

    if (!row) {
      throw new Error('Quote insert returned no row');
    }

    this.logger.log(
      `quote ${row.id} generated: age=${dto.age} pec=${dto.hasPreExistingConditions} total=${row.totalPremium}`,
    );

    return this.toQuoteResponse(row, row.createdAt, null, null);
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    const [found] = await this.db
      .select({
        quote: quotes,
        declaration: medicalDeclarations,
        policy: policies,
        serverTime: sql<string>`now()`,
      })
      .from(quotes)
      .leftJoin(medicalDeclarations, eq(medicalDeclarations.quoteId, quotes.id))
      .leftJoin(policies, eq(policies.quoteId, quotes.id))
      .where(eq(quotes.id, quoteId))
      .limit(1);

    if (!found) {
      throw new QuoteNotFoundException(quoteId);
    }

    return this.toQuoteResponse(
      found.quote,
      new Date(found.serverTime),
      found.declaration,
      found.policy?.id ?? null,
    );
  }

  // Underwriting decides whether to offer cover, never what it costs — the quote stays
  // price-locked. A decline returns 200 with the decision: it is a business outcome,
  // not an exceptional condition.
  async submitDeclaration(
    quoteId: string,
    dto: MedicalDeclarationDto,
  ): Promise<MedicalDeclarationResponse> {
    const outcome = await this.db.transaction(async (tx) => {
      const quote = await this.lockQuote(tx, quoteId);
      if (!quote) {
        throw new QuoteNotFoundException(quoteId);
      }

      const now = await serverNow(tx);

      if (quote.expiresAt <= now) {
        throw new QuoteExpiredException(quote.id, quote.expiresAt);
      }

      assertTransition(quote.status, 'MEDICAL_DECLARED');

      const evaluation = this.underwriting.evaluate(dto.disclosures);

      await tx.insert(medicalDeclarations).values({
        quoteId: quote.id,
        disclosures: dto.disclosures,
        decision: evaluation.decision,
        reasons: evaluation.reasons,
      });

      const nextStatus = evaluation.decision === 'ACCEPTED' ? 'MEDICAL_DECLARED' : 'DECLINED';
      assertTransition(quote.status, nextStatus);

      const [updated] = await tx
        .update(quotes)
        .set({ status: nextStatus, updatedAt: now, version: quote.version + 1 })
        .where(eq(quotes.id, quote.id))
        .returning();

      this.logger.log(`quote ${quote.id} underwriting → ${evaluation.decision}`);

      return { quote: updated ?? quote, evaluation, now };
    });

    return {
      quoteId,
      decision: outcome.evaluation.decision,
      reasons: outcome.evaluation.reasons,
      status: outcome.quote.status,
      totalPremium: outcome.quote.totalPremium,
      expiresAt: outcome.quote.expiresAt.toISOString(),
      serverTime: outcome.now.toISOString(),
    };
  }

  // SELECT ... FOR UPDATE serialises concurrent operations on one quote. READ COMMITTED
  // plus this lock avoids the retry loop SERIALIZABLE would need for 40001.
  async lockQuote(tx: Transaction, quoteId: string): Promise<QuoteRow | undefined> {
    const [row] = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .for('update')
      .limit(1);

    return row;
  }

  toQuoteResponse(
    row: QuoteRow,
    serverTime: Date,
    declaration: { decision: string; reasons: string[] } | null,
    policyId: string | null,
  ): QuoteResponse {
    // Round-tripped to assert the stored strings really are exact 2dp decimals, so a
    // malformed value fails here rather than in a customer's browser.
    const money = (value: string): string => fromMinor(toMinor(value));

    return {
      id: row.id,
      applicantName: row.applicantName,
      age: row.age,
      hasPreExistingConditions: row.hasPreExistingConditions,
      status: row.status,
      breakdown: {
        basePremium: money(row.basePremium),
        ageLoading: money(row.ageLoading),
        conditionLoading: money(row.conditionLoading),
        totalPremium: money(row.totalPremium),
      },
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      serverTime: serverTime.toISOString(),
      isExpired: row.expiresAt <= serverTime,
      eligibility: declaration
        ? {
            decision: declaration.decision as MedicalDeclarationResponse['decision'],
            reasons: declaration.reasons,
          }
        : null,
      policyId,
    };
  }
}

export async function serverNow(tx: Transaction | Database): Promise<Date> {
  const result = await tx.execute<{ now: string }>(sql`SELECT now() AS now`);
  const rows = (result as unknown as { rows: { now: string }[] }).rows;
  const value = rows[0]?.now;
  if (!value) throw new Error('Could not read server time');
  return new Date(value);
}
