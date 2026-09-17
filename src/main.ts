import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Read PORT through ConfigService, not process.env directly — per nestjs.md, and so the
  // value has already passed env.validation.ts's Joi check (a real number, not "" or "abc")
  // before we ever try to bind to it.
  const configService = app.get(ConfigService);
  const { port } = configService.getOrThrow<AppConfig>('app');

  await app.listen(port);
}
bootstrap();
