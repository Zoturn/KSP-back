import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/**
 * Terminus's response shape. Declared locally because Supertest types `res.body` as `any`,
 * and asserting straight off an `any` both trips `no-unsafe-member-access` and silently
 * tolerates a typo'd property name — `expect(res.body.inof.database)` would read `undefined`
 * and the assertion would fail for a reason that has nothing to do with the endpoint.
 */
interface HealthIndicatorResult {
  status: 'up' | 'down';
  message?: string;
  responseTime?: number;
}

interface HealthCheckResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info: Record<string, HealthIndicatorResult>;
  error: Record<string, HealthIndicatorResult>;
  details: Record<string, HealthIndicatorResult>;
}

/**
 * e2e coverage for the one REST route in a GraphQL-only API (`src/health/health.controller.ts`
 * explains why it is REST at all).
 *
 * Both suites build the app through `configureApp()` — the same function `main.ts` calls — so
 * they exercise `/api/health`, the path production actually serves. Hitting `/health` instead
 * would pass just as green and prove nothing; see `src/app.setup.ts`.
 */
describe('Health endpoint (e2e)', () => {
  describe('with the database reachable', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = configureApp(
        moduleFixture.createNestApplication(),
      ) as INestApplication<App>;
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    // This suite needs Postgres up (`docker compose up -d`) — it is a genuine integration
    // test of the real connection, which is the entire point of a database health check.
    it('reports 200 with a passing database check', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      const body = res.body as HealthCheckResponse;

      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.info.database.status).toBe('up');
      // Terminus reports failures in `error`, not by omitting them from `info` — an empty
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
     *
     * A rejecting `query` reproduces an unreachable server faithfully: `node-postgres`
     * surfaces a refused connection as a rejected query, not as a thrown constructor.
     */
    beforeAll(async () => {
      const unreachableDataSource = {
        // Drives the `switch` in TypeOrmHealthIndicator.pingDb — 'postgres' takes the
        // default branch and calls `query('SELECT 1')`, the path the real app uses.
        options: { type: 'postgres' },
        isInitialized: true,
        query: jest
          .fn()
          .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5434')),
        // TypeOrmCoreModule calls destroy() on shutdown; without it app.close() throws and
        // masks the real assertion result.
        destroy: jest.fn().mockResolvedValue(undefined),
      };

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        // Overriding the token also means TypeOrmModule never opens a real connection, so
        // this suite passes with Docker stopped entirely.
        .overrideProvider(getDataSourceToken())
        .useValue(unreachableDataSource)
        .compile();

      app = configureApp(
        moduleFixture.createNestApplication(),
      ) as INestApplication<App>;
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('reports 503 Service Unavailable', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      const body = res.body as HealthCheckResponse;

      // The specific code matters, not merely "non-2xx": 503 is what load balancers and
      // Kubernetes probes interpret as "pull this instance out of rotation". A 500 would
      // read as an application bug instead of a dependency being down.
      expect(res.status).toBe(503);
      expect(body.status).toBe('error');
      expect(body.error.database.status).toBe('down');
    });
  });
});
