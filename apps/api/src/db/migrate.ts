import '../config/load-env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'node:path';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://careshield:careshield@localhost:5432/careshield';

  const pool = new Pool({ connectionString, max: 1 });

  try {
    console.log(`→ migrating ${redact(connectionString)}`);
    await migrate(drizzle(pool), {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
    });
    console.log('✔ migrations applied');
  } finally {
    await pool.end();
  }
}

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
}

main().catch((error: unknown) => {
  console.error('✖ migration failed:', error);
  process.exit(1);
});
