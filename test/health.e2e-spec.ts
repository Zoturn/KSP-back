import { INestApplication } from '@nestjs/common';
import { HealthCheckResult } from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';
import { createStubDataSource } from './stub-data-source';

/**
 * e2e coverage for the one REST route in a GraphQL-only API (`src/health/health.controller.ts`
 * explains why it is REST at all).
 *
 * `HealthCheckResult` is imported rather than hand-declared. Supertest types `res.body` as
 * `any`, so naming the shape is what keeps these assertions type-checked — but writing out a
 * local copy of it was worse than no types: Terminus's own `status` union includes `degraded`,
 * which a hand-copy silently omits, and its `HealthIndicatorResult` is the whole keyed map
 * rather than one entry, so a local interface of the same name would have quietly meant
 * something different from the library's.
 */
describe('Health endpoint (e2e)', () => {
  describe('with the database reachable', () => {
    let app: INestApplication<App>;

    /**
     * The one suite that deliberately talks to real Postgres, so it needs
     * `docker compose up -d` first — verifying an actual connection is the entire point of a
     * database health check, and stubbing it here would leave nothing tested.
     */
    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('reports 200 with a passing database check', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      const body = res.body as HealthCheckResult;

      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.details.database.status).toBe('up');
      // Terminus reports failures in `error`, not by omitting them from `details` — an empty
      // object here is the assertion that nothing failed.
      expect(body.error).toEqual({});
    });

    it('requires no Authorization header', async () => {
      // Asserted explicitly because Phase 5 introduces a global JwtAuthGuard that will cover
      // REST routes too. On the day this endpoint stops being reachable without a token, a
      // probe starts reporting the service as down — this test fails first and names why.
      // The @Public() decorator arriving in Phase 5 is what keeps it passing.
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .unset('Authorization');

      expect(res.status).toBe(200);
    });
  });

  describe('with the database unreachable', () => {
    let app: INestApplication<App>;

    /**
     * WHY THE CONNECTION IS FAKED RATHER THAN THE CONTAINER STOPPED (task 5.3 asked for a
     * choice between the two, documented here)
     *
     * Stopping the Postgres container mid-suite was rejected: it mutates machine-wide state
     * from inside a test, races with the suite above if Jest parallelises, needs the Docker
     * CLI on PATH, takes seconds per toggle, and leaves the developer's database stopped if
     * the process dies before cleanup. Unreliable exactly where reliability matters.
     *
     * Overriding the `DataSource` provider is hermetic and still tests real code. Everything
     * above the socket runs genuinely: the real `TypeOrmHealthIndicator` resolves the
     * DataSource through `ModuleRef`, the real `pingDb` dispatches on `options.type` and
     * issues `SELECT 1`, the real `HealthCheckService` aggregates the failure, and Terminus's
     * real error mapping produces the status code. Only the driver's socket is replaced —
     * which is precisely the layer "database unreachable" means.
     */
    beforeAll(async () => {
      app = await createTestApp({
        dataSource: createStubDataSource({
          // node-postgres surfaces a refused connection as a rejected query, not as a thrown
          // constructor — so this reproduces an unreachable server faithfully.
          query: jest
            .fn()
            .mockRejectedValue(
              new Error('connect ECONNREFUSED 127.0.0.1:5434'),
            ),
        }),
      });
    });

    afterAll(async () => {
      await app?.close();
    });

    it('reports 503 Service Unavailable', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      const body = res.body as HealthCheckResult;

      // The specific code matters, not merely "non-2xx": 503 is what load balancers and
      // Kubernetes probes interpret as "pull this instance out of rotation". A 500 would
      // read as an application bug instead of a dependency being down.
      expect(res.status).toBe(503);
      expect(body.status).toBe('error');
      expect(body.error?.database?.status).toBe('down');
    });
  });
});
