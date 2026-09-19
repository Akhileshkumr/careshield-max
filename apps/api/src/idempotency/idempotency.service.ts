import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  IdempotencyKeyReusedException,
  IdempotentRequestInFlightException,
  PaymentDeclinedException,
} from '../common/domain.exceptions';
import { payments } from '../db/schema';
import type { Transaction } from '../db/database.module';

export interface ReserveParams {
  key: string;
  quoteId: string;
  requestHash: string;
  amount: string;
}

export type Reservation =
  | { kind: 'RESERVED'; paymentId: string }
  | { kind: 'REPLAY'; response: unknown };

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  // Canonicalised before hashing, so a retry that serialises its JSON keys in a
  // different order is not mistaken for reuse of the key.
  hashRequest(body: unknown): string {
    return createHash('sha256').update(canonicalise(body)).digest('hex');
  }

  // INSERT ... ON CONFLICT DO NOTHING RETURNING id is the whole strategy: whoever gets
  // a row back owns the attempt. A SELECT-then-INSERT would leave a window in which two
  // callers both conclude the key is free and both charge.
  //
  // It BLOCKS on an uncommitted conflicting row rather than returning immediately, so
  // concurrent duplicates wake once the winner commits, re-read, and replay its response.
  //
  // Must be the first statement in the checkout transaction, so the claim and the work
  // it guards commit or abort together.
  async reserve(tx: Transaction, params: ReserveParams): Promise<Reservation> {
    const inserted = await tx
      .insert(payments)
      .values({
        idempotencyKey: params.key,
        quoteId: params.quoteId,
        requestHash: params.requestHash,
        amount: params.amount,
        status: 'PENDING',
      })
      .onConflictDoNothing({ target: payments.idempotencyKey })
      .returning({ id: payments.id });

    const row = inserted[0];
    if (row) {
      return { kind: 'RESERVED', paymentId: row.id };
    }

    const [existing] = await tx
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, params.key))
      .limit(1);

    if (!existing) {
      throw new IdempotentRequestInFlightException();
    }

    // Same key, different body: replaying answers a question that was not asked, and
    // executing defeats the guarantee. Refuse loudly — this is a client bug.
    if (existing.requestHash !== params.requestHash) {
      this.logger.warn(`Idempotency-Key ${params.key} reused with a different body`);
      throw new IdempotencyKeyReusedException();
    }

    switch (existing.status) {
      case 'SUCCEEDED':
        this.logger.log(`replaying stored response for key ${params.key}`);
        return { kind: 'REPLAY', response: existing.responseSnapshot };

      case 'FAILED':
        throw new PaymentDeclinedException(
          readFailureMessage(existing.responseSnapshot),
          existing.failureCode ?? undefined,
        );

      // Near-unreachable while reservation and settlement commit together; kept because it
      // becomes load-bearing under the saga design in the README.
      case 'PENDING':
        throw new IdempotentRequestInFlightException();
    }
  }

  async markSucceeded(
    tx: Transaction,
    key: string,
    providerReference: string,
    response: unknown,
  ): Promise<void> {
    await tx
      .update(payments)
      .set({
        status: 'SUCCEEDED',
        providerReference,
        responseSnapshot: response as object,
        completedAt: new Date(),
      })
      .where(eq(payments.idempotencyKey, key));
  }

  // Decline path only. A provider error reaches no decision, so it rolls the whole
  // transaction back and leaves the key free for a safe retry.
  async markFailed(tx: Transaction, key: string, code: string, message: string): Promise<void> {
    await tx
      .update(payments)
      .set({
        status: 'FAILED',
        failureCode: code,
        responseSnapshot: { code, message },
        completedAt: new Date(),
      })
      .where(eq(payments.idempotencyKey, key));
  }
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`);
  return `{${entries.join(',')}}`;
}

function readFailureMessage(snapshot: unknown): string {
  if (snapshot && typeof snapshot === 'object' && 'message' in snapshot) {
    const message = (snapshot as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'This payment was declined.';
}
