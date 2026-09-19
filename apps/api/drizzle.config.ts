import './src/config/load-env';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are GENERATED as SQL and committed to the repo, rather than
 * applied with `db:push`. A reviewer can read exactly what DDL runs, and the
 * `NUMERIC(10,2)` columns are visible in plain SQL instead of being implied by
 * TypeScript.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://careshield:careshield@localhost:5432/careshield',
  },
  strict: true,
  verbose: true,
});
