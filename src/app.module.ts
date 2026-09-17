import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import type { AppConfig } from './config/configuration';
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
    // design.md Decision #1. HealthModule joins this list next.
    DatabaseModule,

    // The entire API surface. `forRootAsync` (not the static `forRoot`) for the same reason
    // DatabaseModule needs it: the config isn't knowable at import time, only once
    // ConfigService has been constructed and injected.
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { nodeEnv } = configService.getOrThrow<AppConfig>('app');
        const isProduction = nodeEnv === 'production';

        return {
          // CODE-FIRST: this is the output, not the input. Nest reflects over every
          // @ObjectType/@InputType/@Resolver in the app at boot and WRITES this file. We
          // never hand-edit it — see graphql.md. Kept at the repo root (not under src/) so
          // the dev-mode file watcher never sees it change and restart in a loop.
          autoSchemaFile: join(process.cwd(), 'schema.gql'),

          // Alphabetises types and fields in the emitted SDL. Without it, the committed
          // schema.gql churns every time a class is reordered, producing meaningless diffs
          // on a file that is a real cross-repo contract.
          sortSchema: true,

          // graphql-playground is discontinued; GraphiQL is its maintained replacement.
          // Both are dev-only — an introspectable UI in production is a needless disclosure
          // (see graphql.md's security section; enforced properly in Phase 10).
          playground: false,
          graphiql: !isProduction,
          introspection: !isProduction,

          // Whatever this returns becomes GqlExecutionContext.getContext(). Declared
          // explicitly even though it's close to the library default, because it is the
          // exact seam every guard and @CurrentUser() will read `req` from in Phase 5 —
          // leaving it implicit would make the auth chain much harder to follow.
          context: ({ req, res }: { req: unknown; res: unknown }) => ({
            req,
            res,
          }),
        };
      },
    }),
  ],
  controllers: [AppController],
  // AppResolver is registered as an ordinary provider — a @Resolver() is just an @Injectable()
  // that the GraphQL schema builder also reflects over. Nest doesn't discover resolvers by
  // filename or decorator alone; if it isn't listed here, it contributes nothing to the schema
  // and code-first generation fails with "Query root type must be provided."
  providers: [AppService, AppResolver],
})
export class AppModule {}
