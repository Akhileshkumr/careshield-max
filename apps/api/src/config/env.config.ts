import { PREMIUM_RULES } from '@careshield/contracts';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  quoteTtlMinutes: number;
  serviceToken: string;
  mockPaymentLatencyMs: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env, then run `npm run db:up`.',
    );
  }

  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  const serviceToken = env.SERVICE_TOKEN ?? '';
  if (nodeEnv === 'production' && !serviceToken) {
    throw new Error('SERVICE_TOKEN must be set in production.');
  }

  return {
    nodeEnv,
    port: readInt(env.API_PORT, 3001, 'API_PORT'),
    databaseUrl,
    quoteTtlMinutes: readInt(
      env.QUOTE_TTL_MINUTES,
      PREMIUM_RULES.DEFAULT_TTL_MINUTES,
      'QUOTE_TTL_MINUTES',
    ),
    serviceToken,
    mockPaymentLatencyMs: readInt(env.MOCK_PAYMENT_LATENCY_MS, 0, 'MOCK_PAYMENT_LATENCY_MS'),
  };
}

function readInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}
