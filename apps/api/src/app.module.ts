import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ServiceTokenGuard } from './common/service-token.guard';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health.controller';
import { InsuranceModule } from './insurance/insurance.module';

@Module({
  imports: [DatabaseModule, InsuranceModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ServiceTokenGuard }],
})
export class AppModule {}
