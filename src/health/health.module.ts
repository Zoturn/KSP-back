import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Wires the one REST health route. See `health.controller.ts` for why it's REST at all.
 *
 * `TerminusModule` provides `HealthCheckService` and `TypeOrmHealthIndicator`. The indicator
 * needs TypeORM's `DataSource`, which it gets without this module importing `DatabaseModule`:
 * `TypeOrmModule.forRootAsync` (in `database.module.ts`) registers `TypeOrmCoreModule`, and
 * that module is `@Global()`, so the connection is injectable application-wide.
 *
 * Exports nothing — nothing else needs to inject health internals.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
