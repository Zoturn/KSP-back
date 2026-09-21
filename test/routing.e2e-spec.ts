import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';
import { createStubDataSource } from './stub-data-source';

/**
 * Guards `src/app.setup.ts`'s central claim: `setGlobalPrefix('api')` prefixes the REST routes
 * but does **not** move `/graphql`, because `@nestjs/graphql` registers its route through the
 * Apollo driver rather than Nest's HTTP router.
 *
 * WHY THIS DESERVES ITS OWN SPEC
 * -------------------------------
 * That claim is asserted in a code comment and recorded in `tasks.md` as a verified correction
 * to the task's original wording (which called for an `exclude` option that turned out to be
 * unnecessary) — but it was only ever proven by hand with curl. Nothing re-proved it per run.
 *
 * The failure it guards against is silent and total: add an `exclude`, change the driver, or
 * move the prefix, and the **entire GraphQL API relocates**. The health spec would still pass,
 * because it only exercises the prefixed half. So would every unit test, because `AppResolver`
 * is tested by direct invocation and never over HTTP.
 *
 * The database is stubbed out: routing has nothing to do with Postgres, and a routing spec that
 * fails because Docker is stopped is a spec that gets ignored.
 */
/**
 * Supertest types `res.body` as `any`; naming the shape keeps the assertions type-checked
 * (and a typo'd property a compile error rather than a silent `undefined`).
 */
interface GraphQLResponse {
  data?: { apiStatus?: string };
  errors?: unknown[];
}

describe('GraphQL endpoint and global prefix routing (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ dataSource: createStubDataSource() });
  });

  afterAll(async () => {
    await app?.close();
  });

  const apiStatusQuery = { query: '{ apiStatus }' };

  it('serves GraphQL at /graphql, unprefixed', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send(apiStatusQuery);

    const body = res.body as GraphQLResponse;

    expect(res.status).toBe(200);
    // `.expect(200)` alone would pass against a broken resolver — GraphQL reports
    // execution failures inside a 200. See testing.md.
    expect(body.errors).toBeUndefined();
    expect(body.data?.apiStatus).toBe('ok');
  });

  it('serves the interactive schema explorer outside production', async () => {
    // graphql-api spec, "Developer opens the interactive explorer". GraphiQL is enabled by
    // `graphiql: !isProduction` in app.module.ts, and Jest sets NODE_ENV=test, so it should
    // be on here. Asserted over HTTP rather than by reading the config, because the config
    // being right and the UI actually being served are different claims.
    //
    // It answers the SAME path as the API — a browser GET with an HTML Accept header gets
    // the explorer, a POST gets query execution — which is why this belongs with routing.
    const res = await request(app.getHttpServer())
      .get('/graphql')
      .set('Accept', 'text/html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('does not serve GraphQL under the /api prefix', async () => {
    // The half that proves the prefix never applied, rather than merely that /graphql
    // happens to also work.
    const res = await request(app.getHttpServer())
      .post('/api/graphql')
      .send(apiStatusQuery);

    expect(res.status).toBe(404);
  });

  it('serves the health check under the /api prefix', async () => {
    // Asserts only that the route EXISTS at the prefixed path — the health contract itself
    // (200 vs 503, the indicator payload) belongs to health.e2e-spec.ts. Duplicating the
    // 200 here would give that contract two owners and no canonical one.
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).not.toBe(404);
  });

  it('rejects a document that fails schema validation with a 400', async () => {
    // graphql-api spec, "A document that fails parse or validation is rejected by the
    // transport". This pins the correction made in 6.3: the spec used to claim EVERY
    // syntactically valid request gets a 200. It does not — validation failures are a
    // transport-level rejection, and only execution-phase failures ride inside a 200.
    //
    // Worth a test precisely because it is counter-intuitive and was written down wrong in
    // four places. Execution-phase (200 + errors) cannot be tested yet: no resolver in the
    // app can fail. Phase 5's auth guards are the first that can, and testing.md already
    // requires those tests to assert on extensions.code rather than status.
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ fieldThatDoesNotExist }' });
    const body = res.body as GraphQLResponse;

    expect(res.status).toBe(400);
    expect(body.errors).toBeDefined();
  });

  it('serves nothing at the root', async () => {
    // The scaffold's AppController ("Hello World!") was deleted in task group 5; the prefix
    // had relocated it to /api, which made an unused route look like a real one.
    await request(app.getHttpServer()).get('/').expect(404);
    await request(app.getHttpServer()).get('/api').expect(404);
  });
});
