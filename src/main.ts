import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix and (from Phase 5) global pipes/filters live in app.setup.ts so the e2e
  // tests can apply the exact same configuration — see that file for why that matters.
  configureApp(app);

  // Read PORT through ConfigService, not process.env directly — per nestjs.md, and so the
  // value has already passed env.validation.ts's Joi check (a real number, not "" or "abc")
  // before we ever try to bind to it.
  const configService = app.get(ConfigService);
  const { port } = configService.getOrThrow<AppConfig>('app');

  await app.listen(port);
}
// `void` marks the floating promise as deliberate: nothing can await the top-level bootstrap,
// and an unhandled rejection here should crash the process loudly rather than be swallowed.
void bootstrap();
