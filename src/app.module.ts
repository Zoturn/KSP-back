import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig, databaseConfig, jwtConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    // isGlobal: true means every other module can inject ConfigService without importing
    // ConfigModule itself — see nestjs.md: "A provider can only be injected by another
    // module if the owning module exports it." isGlobal is @nestjs/config's own escape
    // hatch from that rule, appropriate here because ConfigService is needed almost
    // everywhere (DatabaseModule, GraphQLModule, and eventually AuthModule all read config).
    //
    // validationSchema runs FIRST, against the raw process.env, before `load` runs at all.
    // If it throws, Nest never finishes bootstrapping — see env.validation.ts for why that
    // matters. Only once validation passes do the `load` factories run, each wrapping a
    // validated slice of process.env into a typed, namespaced object (configuration.ts).
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    // Boot order matters: DatabaseModule comes after ConfigModule because its
    // TypeOrmModule.forRootAsync factory (database.module.ts) injects ConfigService — see
    // design.md Decision #1. GraphQLModule joins this list in Phase 2, HealthModule after it.
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
