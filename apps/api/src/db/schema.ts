import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ELIGIBILITY_DECISIONS,
  PAYMENT_STATUSES,
  PREMIUM_RULES,
  QUOTE_STATUSES,
  type MedicalDisclosures,
} from '@careshield/contracts';

// Native Postgres enums, so the database itself rejects an invalid status at INSERT.
// Values come from the shared contracts package and cannot drift from the TS union.
export const quoteStatusEnum = pgEnum('quote_status', QUOTE_STATUSES);
export const eligibilityDecisionEnum = pgEnum('eligibility_decision', ELIGIBILITY_DECISIONS);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);

// A sequence, not SELECT MAX: concurrent issuances cannot collide. nextval is
// non-transactional, so a rolled-back checkout leaves a gap — correct for an ID series.
export const policyNumberSeq = pgSequence('policy_number_seq', {
  startWith: 1,
  increment: 1,
});

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    applicantName: text('applicant_name').notNull(),
    age: integer('age').notNull(),
    hasPreExistingConditions: boolean('has_pre_existing_conditions').notNull(),

    // NUMERIC(10,2), never float. Drizzle returns these as strings, which is what stops
    // the driver coercing an exact decimal into a lossy number.
    basePremium: numeric('base_premium', { precision: 10, scale: 2 }).notNull(),
    ageLoading: numeric('age_loading', { precision: 10, scale: 2 }).notNull(),
    conditionLoading: numeric('condition_loading', { precision: 10, scale: 2 }).notNull(),
    totalPremium: numeric('total_premium', { precision: 10, scale: 2 }).notNull(),

    status: quoteStatusEnum('status').notNull().default('QUOTE_GENERATED'),

    // timestamptz throughout — one unambiguous instant regardless of server timezone.
    // expires_at is written by Postgres (now() + interval), never by Node.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Optimistic-lock counter. Checkout takes a pessimistic FOR UPDATE instead; this
    // covers any future read-modify-write path that cannot lock.
    version: integer('version').notNull().default(0),
  },
  (t) => [
    index('quotes_status_expires_at_idx').on(t.status, t.expiresAt),

    // Also enforced by the DTOs. Belt and braces: a bug in a future service or a manual
    // psql session cannot put an unsellable row in the table.
    check('quotes_age_range_chk', sql`${t.age} BETWEEN ${sql.raw(String(PREMIUM_RULES.MIN_AGE))} AND ${sql.raw(String(PREMIUM_RULES.MAX_AGE))}`),
    check('quotes_premiums_non_negative_chk', sql`${t.basePremium} >= 0 AND ${t.ageLoading} >= 0 AND ${t.conditionLoading} >= 0 AND ${t.totalPremium} >= 0`),
    check('quotes_total_is_sum_chk', sql`${t.totalPremium} = ${t.basePremium} + ${t.ageLoading} + ${t.conditionLoading}`),
    check('quotes_expiry_after_creation_chk', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const medicalDeclarations = pgTable(
  'medical_declarations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    quoteId: uuid('quote_id')
      .notNull()
      .unique()
      .references(() => quotes.id, { onDelete: 'cascade' }),

    // Stored verbatim: this is the evidence the underwriting decision was based on, and
    // must stay reproducible after the rules change.
    disclosures: jsonb('disclosures').$type<MedicalDisclosures>().notNull(),

    decision: eligibilityDecisionEnum('decision').notNull(),

    reasons: text('reasons').array().notNull().default(sql`ARRAY[]::text[]`),

    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('medical_declarations_decision_idx').on(t.decision)],
);

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    quoteId: uuid('quote_id')
      .notNull()
      .unique()
      .references(() => quotes.id, { onDelete: 'restrict' }),

    // UNIQUE(quote_id) above is the last line of defence against double-issuance: even if
    // every application guard were bypassed, Postgres refuses a second policy per quote.
    policyNumber: text('policy_number').notNull().unique(),

    premiumPaid: numeric('premium_paid', { precision: 10, scale: 2 }).notNull(),
    paymentReference: text('payment_reference').notNull(),

    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to').notNull(),
  },
  (t) => [check('policies_cover_period_chk', sql`${t.effectiveTo} > ${t.effectiveFrom}`)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // UNIQUE is the entire idempotency mechanism — one INSERT ... ON CONFLICT decides
    // which caller is allowed to charge, with no check-then-act window.
    idempotencyKey: text('idempotency_key').notNull().unique(),

    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),

    // Tells an honest retry apart from the same key reused with a different body.
    requestHash: text('request_hash').notNull(),

    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),

    providerReference: text('provider_reference'),
    failureCode: text('failure_code'),

    // Replayed verbatim to duplicates; recomputing risks returning something subtly
    // different from what the original caller saw.
    responseSnapshot: jsonb('response_snapshot'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('payments_quote_id_idx').on(t.quoteId),
    index('payments_status_created_at_idx').on(t.status, t.createdAt),
    check('payments_amount_non_negative_chk', sql`${t.amount} >= 0`),
  ],
);

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  medicalDeclaration: one(medicalDeclarations, {
    fields: [quotes.id],
    references: [medicalDeclarations.quoteId],
  }),
  policy: one(policies, {
    fields: [quotes.id],
    references: [policies.quoteId],
  }),
  payments: many(payments),
}));

export const medicalDeclarationsRelations = relations(medicalDeclarations, ({ one }) => ({
  quote: one(quotes, { fields: [medicalDeclarations.quoteId], references: [quotes.id] }),
}));

export const policiesRelations = relations(policies, ({ one }) => ({
  quote: one(quotes, { fields: [policies.quoteId], references: [quotes.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  quote: one(quotes, { fields: [payments.quoteId], references: [quotes.id] }),
}));

export type QuoteRow = typeof quotes.$inferSelect;
export type NewQuoteRow = typeof quotes.$inferInsert;
export type MedicalDeclarationRow = typeof medicalDeclarations.$inferSelect;
export type PolicyRow = typeof policies.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export const schema = {
  quotes,
  medicalDeclarations,
  policies,
  payments,
  quotesRelations,
  medicalDeclarationsRelations,
  policiesRelations,
  paymentsRelations,
};
