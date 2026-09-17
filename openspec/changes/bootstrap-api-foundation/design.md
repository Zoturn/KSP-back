## Context

Empty repository. See `proposal.md` for motivation and `specs/service-health/spec.md` +
`specs/graphql-api/spec.md` for the behavior contract. This document covers how those
requirements get built, and the NestJS/GraphQL concepts each piece teaches.

Fixed by earlier project-level decisions (`.claude/rules/`, `openspec/config.yaml`):
NestJS 11, TypeORM, PostgreSQL 16 in Docker, GraphQL code-first via `@nestjs/graphql` 13.4.5 +
`@nestjs/apollo` 13.4.5 + `@apollo/server` 5 + `@as-integrations/express5`, `graphql` pinned
`^16.11.0`. `synchronize` is never enabled — migrations only.

## Goals / Non-Goals

**Goals:** a booting NestJS app, validated config, a working TypeORM connection proven by a
migration, a GraphQL endpoint with one smoke-test query, a committed `schema.gql`, and a
REST health check backed by a real database ping.

**Non-Goals:** anything covered by `proposal.md`'s Non-goals section (no entities beyond
extensions, no auth, no global pipes/filters/interceptors, no DataLoader, no security limits).
Additionally, out of scope for *design* specifically: CI wiring for `schema:check` (the git
hook in Decision #8 covers local enforcement; a CI job is a Phase 10 concern), and any decision
about hosting (local Docker only).

## Decisions

### 1. Module layout: `ConfigModule` → `DatabaseModule` → `GraphQLModule`, in that boot order
**Decision:** `AppModule` imports `ConfigModule` first (global), then `DatabaseModule`, then
`GraphQLModule.forRootAsync`, then `HealthModule`.

**Why:** `DatabaseModule` and `GraphQLModule` both need `ConfigService` injected via
`useFactory` — this is the NestJS **async module** pattern (`forRootAsync` + `inject:
[ConfigService]`), and it's how `nestjs.md`'s rule "never read `process.env` outside
`config/`" is actually enforced, not just stated. `ConfigModule` must be importable by every
other module, which is why it's registered with `isGlobal: true` rather than re-imported
everywhere.

**Alternative considered:** reading `process.env` directly in `DatabaseModule`'s static
`forRoot`. Rejected — it can't fail fast with a readable Joi error, and it's the exact
anti-pattern the project rule exists to prevent.

**Concept taught:** dependency injection, the Module/Provider/`@Injectable` model, and the
difference between `forRoot` (static) and `forRootAsync` (needs injected config first).

### 2. Config validation: Joi schema, fail-fast at boot
**Decision:** `ConfigModule.forRoot({ isGlobal: true, validationSchema, load: [configuration] })`
where `validationSchema` is a Joi object requiring every variable in `.env.example` and
rejecting boot if one is missing or malformed (e.g. `POSTGRES_PORT` not a number).

**Why:** the alternative — an undefined env var quietly becoming `undefined` in a connection
string — fails at the *first query*, deep inside a resolver, with a confusing error. Failing
at boot with "POSTGRES_PORT is required" is the entire point of a config layer for a learner.

**Alternative considered:** `class-validator` on a config class instead of Joi. Both are valid
NestJS patterns; Joi is used here because `@nestjs/config`'s own docs lead with it and it needs
no extra decorator boilerplate for a flat env shape this size.

**Concept taught:** the `ConfigModule` validation pipeline, and "fail fast" as a design
principle distinct from "fail eventually with a worse error."

### 3. Database wiring: `TypeOrmModule.forRootAsync` + a standalone `data-source.ts`
**Decision:** Two separate TypeORM configuration surfaces that share the same values:
- `DatabaseModule` uses `TypeOrmModule.forRootAsync({ useFactory, inject: [ConfigService] })`
  for the running app.
- `src/database/data-source.ts` exports a plain `DataSource` instance (no Nest DI) for the
  TypeORM CLI (`migration:generate`, `migration:run`), which runs outside the Nest application
  context entirely.

**Why:** the TypeORM CLI is a separate Node process that never boots Nest's DI container, so it
cannot consume `ConfigService`. Both files read the same `.env` (via `dotenv` in
`data-source.ts`) so the two never drift, but they are necessarily two files — this is a
TypeORM constraint, not a choice.

**Concept taught:** the boundary between "code that runs inside Nest's DI container" and "code
that runs as a plain Node script" — the first time this distinction matters in the project.

### 4. First migration: extensions only, generated then hand-verified
**Decision:** `migration:generate` against zero entities produces an empty migration; the
`pgcrypto` and `citext` `CREATE EXTENSION` statements are added by hand into that generated
migration file (the differ has nothing to diff yet, since there are no entities).

Columns/types/constraints introduced by this migration: none. Only two SQL statements:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```
No table changes. Every future entity migration depends on this one having run first
(`gen_random_uuid()` and `citext` columns both require it).

**Why:** per `database.md`, extensions are created in a migration, never by manual `psql`, so a
fresh clone + `migration:run` produces an identical database with no undocumented setup step.

**Concept taught:** that a migration doesn't have to originate from an entity diff — it's
"one incremental, reviewable step in schema history," and infrastructure statements belong
there too.

### 5. GraphQL bootstrap: `ApolloDriver`, `autoSchemaFile` at repo root, explicit `context`
**Decision:**
```ts
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config) => ({
    autoSchemaFile: join(process.cwd(), 'schema.gql'),
    sortSchema: true,
    graphiql: config.get('NODE_ENV') !== 'production',
    playground: false,
    context: ({ req, res }) => ({ req, res }),
  }),
})
```
One trivial `@Resolver()` with an `apiStatus: String!` query proves the layer boots.

**Why each option, per `graphql.md`:** `sortSchema: true` keeps `schema.gql` diffs meaningful
(alphabetical, not decorator-declaration-order). `context` is declared explicitly even though
it's close to the library default, because every later guard and `@CurrentUser()` depends on
this exact seam — making it implicit would make the auth chapter (Phase 5) much harder to
explain. `playground: false` because graphql-playground is discontinued; `graphiql` is its
maintained replacement.

**Concept taught:** code-first schema generation — the schema is *derived from*, not
hand-written alongside, the TypeScript.

### 6. Schema export script independent of the database
**Decision:** `src/schema.generate.ts` boots only the pieces needed to reflect decorators into
a schema (a minimal Nest application context with `GraphQLModule`, no `DatabaseModule`), so
`npm run schema:generate` works with Postgres stopped. `schema:check` runs generation then
`git diff --exit-code schema.gql`.

**Why:** per `graphql.md`, `schema.gql` is the cross-repo contract. If generating it required a
live database, checking it in CI would need a database just to check a file — real, avoidable
coupling. It's also the load-bearing fact behind Decision #8: because generation has no side
effects and no external dependency, it's *safe* to run automatically on every commit.

**Concept taught:** that a Nest "application" doesn't have to mean "the whole app" — you can
boot a narrower module tree for a specific purpose.

### 7. Health stays REST, colocated with the one other REST concern (uploads, later)
**Decision:** `HealthModule` exposes `GET /api/health` via `@nestjs/terminus`, using
`TypeOrmHealthIndicator.pingCheck('database')`. It is unauthenticated (no auth guard exists
yet in this change — that arrives in Phase 5, where health gets an explicit `@Public()`).

**Why:** restated concretely from `graphql.md`/`LEARNING/01-graphql.md` — GraphQL always
returns HTTP 200, so a transport that can't express failure can't be a health check, and probes
that read status codes (Docker `HEALTHCHECK`, future k8s) can't speak GraphQL anyway.

**Module impact:** `HealthModule` imports `TerminusModule` and `DatabaseModule` (for the
injected `DataSource` the indicator pings), and is imported by `AppModule`. It exports
nothing — nothing else needs to inject health internals.

**Concept taught:** first `@Controller()` in a GraphQL-first app, and why it's a deliberate
exception rather than an inconsistency.

### 8. A real `pre-commit` git hook enforces schema freshness and warns on migration drift
**Decision:** a git `pre-commit` hook (plain shell, at `scripts/git-hooks/pre-commit`, wired in
via `git config core.hooksPath scripts/git-hooks` — set automatically by an npm `prepare`
script once `package.json` exists in Phase 1) does two things on every commit, staged or not,
by anyone or anything, including a merge commit and edits made outside Claude Code entirely:

1. **Schema — self-healing, not just checked.** If any staged file matches a resolver, model,
   or input path, run `npm run schema:generate` and `git add schema.gql` if it changed. Because
   Decision #6 made generation database-free and side-effect-free, this is safe to run
   unconditionally on every commit — the commit simply never lands with a stale schema.
2. **Migrations — warn, never auto-generate.** If any staged file matches `*.entity.ts` and no
   staged file is under `src/database/migrations/`, print a warning and let the commit proceed.
   It does **not** run `migration:generate` itself.

**Why the asymmetry:** these two risks are not equally safe to automate. Schema generation is a
pure, deterministic function of the source — running it automatically can only ever produce the
*correct* file. Migration generation requires a live database connection, requires a
human-chosen filename, and — per `database.md`'s explicit rule — its SQL must be **read before
it's run**; a hook that silently ran and committed a generated migration would violate that
rule at the exact moment it matters most (schema changes to a real database). So automation
stops at "remind," and the human step stays a human step.

**Why a git hook and not a Claude Code hook:** `.claude/hooks/` (already in this repo for
Prettier) only intercept tool calls Claude itself makes in a session — they do not fire for a
manual `git commit`, a `git merge`, or any edit made outside Claude Code. Enforcing "this holds
on every commit, from anyone" requires a real git hook. Claude Code's own Prettier hook and this
git hook are complementary, not redundant: Claude's hook gives fast in-session feedback while
editing; the git hook is the actual gate, evaluated once at commit time regardless of who or
what changed the files.

**Alternative considered:** Husky. Rejected for a learning project — it's a dependency wrapping
a mechanism (`core.hooksPath`) that's built into git and worth understanding directly. A raw
script also has a body a learner can read start to finish.

**Concept taught:** the boundary between what an in-session assistant hook can and cannot see,
versus a real git hook that runs regardless of tooling — and why "safe to automate" and "unsafe
to automate" get different treatments even when they look like the same kind of problem.

## Risks / Trade-offs

- **[Risk]** A learner edits an entity and forgets to generate a migration → schema drift goes
  unnoticed until a runtime column-not-found error. → **Mitigation:** Decision #8's pre-commit
  hook warns at commit time, before the change ever reaches `main`, catching it far earlier
  than a runtime error would. It intentionally does not auto-generate — see Decision #8's
  "why the asymmetry" for why that would be worse, not better.
- **[Risk]** `schema.gql` committed but stale (someone adds a resolver, forgets to regenerate)
  → frontend codegen silently targets an old contract. → **Mitigation:** Decision #8's
  pre-commit hook makes this structurally impossible for any commit made through git on this
  machine — it regenerates and re-stages the file automatically. The e2e schema-drift test
  (from `LEARNING/01-graphql.md` §10) remains as a second, CI-visible layer of defense for
  clones/environments where the hook wasn't installed.
- **[Risk]** `graphiql`/`introspection` gated only on `NODE_ENV` — if that var is ever unset in
  a real deployment, introspection stays on. → **Mitigation:** Joi validation in Decision #2
  makes `NODE_ENV` a required enum (`development | test | production`), so "unset" fails boot
  rather than silently defaulting to permissive.
- **[Trade-off]** Two TypeORM config surfaces (`DatabaseModule` + `data-source.ts`) instead of
  one. Accepted — this is inherent to how the TypeORM CLI works outside Nest's DI, not a choice
  this design could avoid.
- **[Trade-off]** The pre-commit hook only protects commits made *on a machine where it's
  installed* (via the `prepare` script, itself only run on `npm install`). A commit made
  through GitHub's web UI, for instance, bypasses it entirely. Accepted for a single-developer
  learning project; a CI-side `schema:check` job (Phase 10) would close that gap for a team.

## Migration Plan

No production deployment exists yet — this is the first change to a greenfield repo. Steps to
bring a fresh clone up:
1. `docker compose up -d` (from `LEARNING/00-docker.md`, already committed).
2. `npm install` — also runs the `prepare` script that wires up the pre-commit hook.
3. `npm run migration:run` — applies the extensions migration to an empty database.
4. `npm run start:dev` — boots config validation → DB connection → GraphQL → health.
5. Verify per the spec scenarios: `GET /api/health` returns 200 with a passing DB check;
   GraphiQL loads at `/graphql`; `apiStatus` query returns successfully.

**Rollback:** `npm run migration:revert` drops the two extensions (safe — nothing depends on
them yet). No other rollback surface exists; this change adds no persistent business data.

## Open Questions

None. Every ambiguity that would change the spec, approach, or task breakdown was resolved in
this document or in the standing project rules it cites.
