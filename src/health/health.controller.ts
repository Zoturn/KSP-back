import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * `GET /api/health` — liveness plus database reachability.
 *
 * WHY THIS IS A CONTROLLER AND NOT A RESOLVER
 * ---------------------------------------------
 * This is one of only two REST routes that survive in a GraphQL-only API (the other being
 * `/api/uploads/*` for binary transfer), and that's deliberate, not an inconsistency — see
 * `design.md` Decision #7:
 *
 * 1. **The consumers don't speak GraphQL.** Docker `HEALTHCHECK`, Kubernetes probes, load
 *    balancers and uptime monitors do an HTTP GET and read a status code. None of them will
 *    POST a query document and parse an `errors` array.
 * 2. **GraphQL can't express failure in the transport.** Execution-phase failures return
 *    HTTP 200 with an `errors` array (see `graphql.md`) — a health check whose transport
 *    always says "fine" is not a health check.
 * 3. **Liveness must not depend on the thing it reports on.** If schema generation or the
 *    Apollo driver failed to start, a GraphQL health *query* couldn't answer — the endpoint
 *    wouldn't exist. This check lives below the layer it reports on.
 *
 * Terminus returns **200** when every indicator passes and **503 Service Unavailable** when
 * any fails, which is exactly the signal a probe needs.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /**
   * `@HealthCheck()` marks this for Terminus's own tooling (and keeps it out of the
   * OpenAPI-ish introspection Terminus does for its dashboards).
   *
   * `pingCheck` issues a real, trivial query against the TypeORM connection — it verifies
   * the database genuinely answers, not merely that a connection object exists. The 3s
   * timeout keeps a hung database from hanging the probe itself, which would turn a
   * "degraded" signal into a "no signal" one.
   *
   * No authentication: probes are unauthenticated by nature, and this exposes nothing beyond
   * up/down. When the global `JwtAuthGuard` arrives in Phase 5 it will cover REST routes too,
   * so this endpoint gains an explicit `@Public()` then.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
    ]);
  }
}
