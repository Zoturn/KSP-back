# Bootstrap API Foundation

**Build-order phase: 1–2** (project init + config + database connection; GraphQL bootstrap + health)

## Why

The repository has infrastructure (PostgreSQL in Docker) but no application. Nothing can be
built, run, or verified until a NestJS service exists that boots, validates its configuration,
connects to the database, and proves it.

Two consumers need this immediately:

- **Developers** need a way to answer "is the service up, and can it reach the database?"
  without reading logs. A misconfigured connection string should fail loudly at startup, not
  silently at the first query.
- **`ksp-frontend`** generates its entire typed client from this service's GraphQL schema.
  Until `schema.gql` is emitted and committed, the frontend repository cannot start at all.

This change delivers the smallest genuinely verifiable thing: a running GraphQL API with a
committed schema contract and a health endpoint backed by a live database connection.

## What Changes

- Scaffold the NestJS application (`src/`, `test/`, TypeScript config, Jest config).
- Add a configuration layer that loads `.env` and **validates it at startup**, failing fast
  with a readable error when a variable is missing or malformed.
- Add a database layer wiring TypeORM to PostgreSQL asynchronously from validated config,
  plus a standalone `data-source.ts` for the migration CLI.
- Add the **first migration**, creating the `pgcrypto` and `citext` extensions that every
  later entity depends on (`gen_random_uuid()`, case-insensitive email).
- Wire **GraphQL code-first** (`GraphQLModule.forRootAsync` + `ApolloDriver`) with a first
  trivial query, GraphiQL served in development, and an explicit `context` factory.
- **Emit and commit `schema.gql`** — the cross-repo contract artifact — plus a script that
  regenerates it without booting Postgres.
- Expose a **REST health endpoint** reporting service liveness and database connectivity.

No breaking changes — there is nothing yet to break.

## Capabilities

### New Capabilities

- `service-health`: Observable liveness and readiness of the service, including whether it can
  currently reach PostgreSQL. Consumed by developers, container orchestrators, and uptime checks.
- `graphql-api`: A single GraphQL endpoint with a published, machine-readable schema that
  downstream clients generate typed code from.

### Modified Capabilities

None — this is the first change in the project.

## Non-goals

Explicitly deferred to keep this change reviewable:

- **No domain entities.** No `User`, `Product`, `Category`, or any other table. This change
  creates only the two extensions; entity tables arrive with their own phases.
- **No authentication.** No JWT, Passport, guards, or roles (phase 5). Everything in this
  change is public by design.
- **No global pipes, filters, or interceptors** (phase 3). Validation and error mapping are a
  deliberate separate step so each can be explained on its own.
- **No DataLoader** (phase 6) — there are no relations to batch yet.
- **No GraphQL security limits** (phase 10) — depth, complexity, and alias limiting are
  designed for but not enforced here.
- **No business queries or mutations.** Nothing beyond a smoke-test field and health.
- **No containerisation of the API itself.** It runs natively for fast hot-reload.

## Impact

**New dependencies**
`@nestjs/config` + `joi`; `@nestjs/typeorm` + `typeorm` + `pg`; `@nestjs/graphql@13.4.5` +
`@nestjs/apollo@13.4.5` + `@apollo/server@^5` + `@as-integrations/express5` +
`graphql@^16.11.0` (pinned — `graphql@17` is incompatible); `@nestjs/terminus`.

> **Version constraint:** NestJS 11 ships Express 5, and `@nestjs/apollo@13.2.0+` requires
> Apollo Server 5. Apollo Server 4 would pin us to `@nestjs/apollo@13.1.0` permanently and
> mismatch the Express version. Apollo Server 5 is required, not optional.

**New surface area**
`POST /graphql` (the entire API), GraphiQL at `/graphql` in development, `GET /api/health`,
and a generated + committed `schema.gql`.

**Downstream**
Unblocks `ksp-frontend` entirely — its `graphql-codegen` run depends on `schema.gql` existing.
Also establishes the configuration and migration workflow every later phase builds on.

**Data modeling rules**
No deviations. The migration only creates extensions; no columns or tables are defined, so the
money, UUID, and timestamp rules are not yet exercised. TypeORM `synchronize` stays disabled
from the very first commit — schema is created exclusively through migrations.

**Architectural note**
Health is deliberately REST, not GraphQL. Probes read HTTP status codes, and GraphQL always
returns 200 — a health check whose transport cannot express failure is not a health check.
It must also live *below* the layer it reports on, so it can report a failed GraphQL bootstrap.

**Risk**
Low and self-contained. The main failure mode is environment drift (wrong credentials or port),
which this change deliberately surfaces at startup via config validation rather than at runtime.
