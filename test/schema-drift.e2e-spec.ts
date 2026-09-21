import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { GRAPHQL_SDL_FILE_HEADER, GraphQLSchemaHost } from '@nestjs/graphql';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';
import { createStubDataSource } from './stub-data-source';

/**
 * Fails when the committed `schema.gql` no longer matches the schema the running app builds.
 *
 * WHY THIS IS THE MOST IMPORTANT TEST IN THE REPO RIGHT NOW
 * ----------------------------------------------------------
 * `schema.gql` is not a build artifact, it is the **cross-repo contract**: `ksp-frontend`
 * generates its entire typed client from it. Nothing else notices if it goes stale. Add a
 * field, forget to regenerate, and this repo's tests stay green while the frontend compiles a
 * client describing an API that no longer exists — a failure that surfaces in the other repo,
 * far from its cause.
 *
 * The pre-commit hook regenerates the file when a resolver is staged, and `npm run
 * schema:check` compares on demand. Both are opt-in paths that a `--no-verify` or a direct
 * push can skip. This runs in the suite, so it cannot be.
 *
 * HOW IT DIFFERS FROM `schema:check`
 * -----------------------------------
 * `schema:check` runs `schema.generate.ts`, which builds the schema from a HAND-MAINTAINED
 * resolver list, because it deliberately never constructs the module graph (that is what lets
 * it run without Postgres). This test reads the schema from `GraphQLSchemaHost` — the real
 * one, built by the real `AppModule` from whatever is actually registered. So it is the check
 * that catches a resolver added to `AppModule` but forgotten in `schema.generate.ts`'s
 * `RESOLVERS` array, which `schema:check` cannot see by construction.
 */
describe('Committed schema.gql (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // No database needed: the schema is built by reflection over decorators, not from the
    // data layer. Stubbing it means a stale schema is still caught when Docker is stopped.
    app = await createTestApp({ dataSource: createStubDataSource() });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('matches the schema the running application builds', async () => {
    const { schema } = app.get(GraphQLSchemaHost);

    // `GRAPHQL_SDL_FILE_HEADER` is the "DO NOT MODIFY" banner @nestjs/graphql writes above
    // generated SDL, and `schema.generate.ts` prepends the very same exported constant. It
    // has to be included here or the comparison fails on the banner alone — note that
    // testing.md's snippet omits it. Importing the constant rather than retyping the banner
    // keeps this test correct if @nestjs/graphql ever rewords it.
    //
    // `lexicographicSortSchema` mirrors `sortSchema: true` in app.module.ts; without it the
    // field order would depend on class declaration order and this test would flap.
    const live =
      GRAPHQL_SDL_FILE_HEADER + printSchema(lexicographicSortSchema(schema));

    // Resolved from this file, not `process.cwd()`, so the test does not depend on where the
    // runner was invoked from.
    const committed = await readFile(
      join(__dirname, '..', 'schema.gql'),
      'utf8',
    );

    // `.trim()` on both sides: the committed file has no trailing newline, and an editor
    // adding one should not be reported as a schema change.
    expect(live.trim()).toBe(committed.trim());
  });
});
