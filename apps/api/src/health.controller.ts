import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from './db/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: string; database: string; time: string }> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'up', time: new Date().toISOString() };
    } catch {
      return { status: 'degraded', database: 'down', time: new Date().toISOString() };
    }
  }
}
