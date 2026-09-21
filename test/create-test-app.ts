import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createStubDataSource } from './stub-data-source';

/**
 * The one supported way an e2e spec builds an application.
 *
 * WHY A FACTORY RATHER THAN A DOCUMENTED RECIPE
 * -----------------------------------------------
 * `src/app.setup.ts` exists because `createNestApplication()` does not run `bootstrap()`, so
 * a spec that forgets `configureApp` tests `/health` while production serves `/api/health` —
 * green, and proving nothing. Extracting `configureApp` removed the *duplication* but left
 * the *convention*: every spec still had to remember to call it. Three specs did; the fourth
 * is the one that would not have.
 *
 * Routing this through a factory closes that: there is no assembly step left to skip, and
 * anything a future boot needs (a test database name, `enableShutdownHooks`, the
 * `GraphQLSchemaHost` grab that task 6.1's schema-drift guard wants) is added once here
 * rather than in every spec.
 */
export interface CreateTestAppOptions {
  /**
   * Replaces TypeORM's `DataSource` with a stub, so the app boots without Postgres running.
   *
   * Omit it for a spec that genuinely exercises the database (the health check's happy path
   * is the only real case — stubbing the database in a database health check tests nothing).
   * Pass `createStubDataSource(...)` for everything else, including specs that simply have
   * nothing to do with the database and shouldn't fail when Docker is stopped.
   */
  dataSource?: ReturnType<typeof createStubDataSource>;
}

export async function createTestApp({
  dataSource,
}: CreateTestAppOptions = {}): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (dataSource) {
    builder.overrideProvider(getDataSourceToken()).useValue(dataSource);
  }

  const moduleFixture: TestingModule = await builder.compile();

  // `configureApp` is generic, so the concrete `INestApplication<App>` survives — no cast.
  const app = configureApp(
    moduleFixture.createNestApplication<INestApplication<App>>(),
  );
  await app.init();

  return app;
}
