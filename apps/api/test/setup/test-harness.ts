import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  IDEMPOTENCY_KEY_HEADER,
  SERVICE_TOKEN_HEADER,
  type MedicalDeclarationResponse,
  type MedicalDisclosures,
  type QuoteResponse,
} from '@careshield/contracts';

import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/common/domain-exception.filter';
import { DRIZZLE, PG_POOL, type Database } from '../../src/db/database.module';
import { quotes } from '../../src/db/schema';

export const TEST_SERVICE_TOKEN = 'test-service-token-0123456789';

export interface TestHarness {
  app: INestApplication;
  db: Database;
  container?: StartedPostgreSqlContainer;

  api(): request.Agent;
  anonymousApi(): request.Agent;

  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  paymentLatencyMs?: number;
  quoteTtlMinutes?: number;
}

// Real PostgreSQL rather than a mock: transaction rollback, FOR UPDATE contention and
// ON CONFLICT blocking are database behaviours, and a suite that faked them away would
// be worse than none.
export async function createHarness(options: HarnessOptions = {}): Promise<TestHarness> {
  // Honours an external database so CI service containers — or a machine with no
  // container runtime — can run the same suite.
  const externalUrl = process.env.TEST_DATABASE_URL;

  const container = externalUrl
    ? undefined
    : await new PostgreSqlContainer('postgres:17-alpine')
        .withDatabase('careshield_test')
        .withUsername('careshield')
        .withPassword('careshield')
        .start();

  const databaseUrl = externalUrl ?? container!.getConnectionUri();

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.SERVICE_TOKEN = TEST_SERVICE_TOKEN;
  process.env.QUOTE_TTL_MINUTES = String(options.quoteTtlMinutes ?? 15);
  process.env.MOCK_PAYMENT_LATENCY_MS = String(options.paymentLatencyMs ?? 0);

  const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(migrationPool), {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
    });
  } finally {
    await migrationPool.end();
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();

  const db = app.get<Database>(DRIZZLE);
  const server = app.getHttpServer() as App;

  return {
    app,
    db,
    container,

    api: () => request.agent(server).set(SERVICE_TOKEN_HEADER, TEST_SERVICE_TOKEN),
    anonymousApi: () => request.agent(server),

    async reset(): Promise<void> {
      await db.execute(
        sql`TRUNCATE TABLE payments, policies, medical_declarations, quotes RESTART IDENTITY CASCADE`,
      );
      await db.execute(sql`ALTER SEQUENCE policy_number_seq RESTART WITH 1`);
    },

    async close(): Promise<void> {
      const pool = app.get<Pool>(PG_POOL);
      await app.close();
      await pool.end().catch(() => undefined);
      await container?.stop();
    },
  };
}

export const HEALTHY_DISCLOSURES: MedicalDisclosures = {
  heightCm: 175,
  weightKg: 70,
  isSmoker: false,
  consumesAlcohol: false,
  hasDiabetes: false,
  hasHypertension: false,
  hasCardiacHistory: false,
  hasCancerHistory: false,
  hospitalisedLast12Months: false,
  currentMedications: [],
};

export const newIdempotencyKey = (): string => randomUUID();

export const withIdempotencyKey = (
  req: request.Test,
  key: string,
): request.Test => req.set(IDEMPOTENCY_KEY_HEADER, key);

export async function createQuote(
  harness: TestHarness,
  overrides: Partial<{ applicantName: string; age: number; hasPreExistingConditions: boolean }> = {},
): Promise<QuoteResponse> {
  const response = await harness
    .api()
    .post('/api/v1/insurance/quote')
    .send({
      applicantName: 'Asha Raghunathan',
      age: 30,
      hasPreExistingConditions: false,
      ...overrides,
    })
    .expect(201);

  return response.body as QuoteResponse;
}

export async function declareHealthy(
  harness: TestHarness,
  quoteId: string,
  disclosures: Partial<MedicalDisclosures> = {},
): Promise<MedicalDeclarationResponse> {
  const response = await harness
    .api()
    .post(`/api/v1/insurance/quote/${quoteId}/medical-declaration`)
    .send({
      disclosures: { ...HEALTHY_DISCLOSURES, ...disclosures },
      declarationAccepted: true,
    })
    .expect(200);

  return response.body as MedicalDeclarationResponse;
}

export async function createPayableQuote(
  harness: TestHarness,
  overrides: Parameters<typeof createQuote>[1] = {},
): Promise<QuoteResponse> {
  const quote = await createQuote(harness, overrides);
  await declareHealthy(harness, quote.id);
  return quote;
}

// Both timestamps move: a CHECK constraint refuses a row whose expiry precedes its
// creation, so this ages the quote rather than making an impossible one.
export async function expireQuote(
  harness: TestHarness,
  quoteId: string,
  minutesAgo = 20,
): Promise<void> {
  await harness.db.execute(sql`
    UPDATE ${quotes}
       SET created_at = now() - make_interval(mins => ${minutesAgo}),
           expires_at = now() - make_interval(mins => ${minutesAgo - 15})
     WHERE id = ${quoteId}::uuid
  `);
}

export async function countRows(harness: TestHarness, table: string): Promise<number> {
  const result = await harness.db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM ${sql.identifier(table)}`,
  );
  const rows = (result as unknown as { rows: { count: string }[] }).rows;
  return Number(rows[0]?.count ?? 0);
}

export async function getQuoteStatus(harness: TestHarness, quoteId: string): Promise<string> {
  const result = await harness.db.execute<{ status: string }>(
    sql`SELECT status FROM quotes WHERE id = ${quoteId}::uuid`,
  );
  const rows = (result as unknown as { rows: { status: string }[] }).rows;
  const status = rows[0]?.status;
  if (!status) throw new Error(`Quote ${quoteId} not found`);
  return status;
}
