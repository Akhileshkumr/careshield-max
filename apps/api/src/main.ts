import 'dotenv/config';
import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/env.config';
import { DomainExceptionFilter } from './common/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);

  // No enableCors(): only the Next.js server calls this API, server-side, so a browser
  // cannot reach it cross-origin at all.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // A typo'd field name is a 400, not a quote priced as though the applicant were healthy.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        // Off, so "50" and "false" are rejected instead of silently coerced into a priced quote.
        enableImplicitConversion: false,
      },
    }),
  );

  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`CareShield Max API listening on http://localhost:${config.port}`);
  logger.log(`Quote lock: ${config.quoteTtlMinutes} minute(s)`);
  logger.log(`Service token auth: ${config.serviceToken ? 'enabled' : 'disabled'}`);
}

void bootstrap();
