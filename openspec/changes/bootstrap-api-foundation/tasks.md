## 1. Project scaffold and tooling

- [ ] 1.1 Run `nest new` (or manual scaffold) into `ksp-backend`, TypeScript, npm. Verify
      `npm run start:dev` boots the default Nest app and `npm test` runs the default spec.
- [ ] 1.2 Install pinned dependencies exactly as specified in `proposal.md`'s Impact section
      (`@nestjs/config`, `joi`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/graphql@13.4.5`,
      `@nestjs/apollo@13.4.5`, `@apollo/server@^5.5.1`, `@as-integrations/express5`,
      `graphql@^16.11.0`, `@nestjs/terminus`). Verify `npm ls graphql` reports `16.x`, not `17.x`.
- [ ] 1.3 Enable `emitDecoratorMetadata` and `experimentalDecorators` in `tsconfig.json`
      (required for both TypeORM and `@nestjs/graphql` code-first). Verify `npm run build` succeeds.
- [ ] 1.4 Install and configure Prettier (`npm i -D prettier`) so the already-committed
      `.claude/hooks/prettier-check.mjs` stops no-op'ing. Verify: edit a file with bad
      formatting via Claude Code and confirm the hook reports the failure.
- [ ] 1.5 Add `scripts/git-hooks/pre-commit` implementing Decision #8 (self-healing
      `schema.gql` regeneration on staged resolver/model/input changes; non-blocking warning
      on staged `*.entity.ts` changes with no staged migration file). Wire it via a `prepare`
      npm script running `git config core.hooksPath scripts/git-hooks`. Verify: run
      `npm install` and confirm `git config core.hooksPath` reports `scripts/git-hooks`.

## 2. Configuration layer

- [ ] 2.1 Create `src/config/env.validation.ts` with a Joi schema covering every variable in
      `.env.example` (`NODE_ENV` enum, `PORT`, `POSTGRES_*`, `JWT_*` — required even though
      unused until Phase 5, so the schema doesn't need revisiting then). Write a unit test
      that asserts validation throws on a missing `POSTGRES_PORT` and on a non-numeric one.
- [ ] 2.2 Create `src/config/configuration.ts` using `registerAs` to namespace config
      (`database`, `jwt`, `app`). Write a unit test asserting `configuration()` returns the
      expected shape given a known `process.env`.
- [ ] 2.3 Wire `ConfigModule.forRoot({ isGlobal: true, validationSchema, load: [configuration] })`
      in `AppModule`. Verify: temporarily blank a required `.env` value, confirm
      `npm run start:dev` fails at boot with a readable Joi error naming the missing variable,
      then restore it.

## 3. Database connection and first migration

- [ ] 3.1 Create `src/database/database.module.ts` with
      `TypeOrmModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory })`
      per `design.md` Decision #1/#3. Verify `npm run start:dev` logs a successful DB connection
      (with Docker Postgres already running from Phase 0).
- [ ] 3.2 Create `src/database/data-source.ts` as a standalone `DataSource` for the TypeORM
      CLI, reading `.env` via `dotenv`, sharing connection values with 3.1. Add
      `migration:generate`, `migration:run`, `migration:revert` npm scripts pointed at it.
      Verify `npm run migration:run -- --dry-run` (or equivalent) resolves without error.
- [ ] 3.3 Generate the first migration (`npm run migration:generate -- --name=AddExtensions`),
      then hand-add the two `CREATE EXTENSION IF NOT EXISTS pgcrypto;` /
      `CREATE EXTENSION IF NOT EXISTS citext;` statements per `design.md` Decision #4 — the
      differ has nothing to diff yet. **Read the generated file before running it** (project
      rule). Verify: `npm run migration:run` against the Docker database succeeds, and
      `docker compose exec postgres psql -U ksp_user -d ksp_ecommerce -c "\dx"` lists both
      extensions.
- [ ] 3.4 Verify `npm run migration:revert` cleanly drops both extensions, then re-run
      `migration:run` to leave the database in the applied state.

## 4. GraphQL bootstrap

- [ ] 4.1 Wire `GraphQLModule.forRootAsync<ApolloDriverConfig>` in `AppModule` exactly per
      `design.md` Decision #5 (`ApolloDriver`, `autoSchemaFile` at repo root, `sortSchema: true`,
      `graphiql` gated on `NODE_ENV`, explicit `context` factory). Verify `npm run start:dev`
      boots without error and creates `schema.gql`.
- [ ] 4.2 Add a minimal `AppResolver` with `apiStatus: String!` returning a static string, per
      `specs/graphql-api/spec.md` "A minimal query proves the schema is live". Write a unit
      test for the resolver (no mocks needed — it has no dependencies) and confirm it returns
      the expected value.
- [ ] 4.3 Verify manually: open `http://localhost:3000/graphql`, confirm GraphiQL loads, run
      `{ apiStatus }` and confirm a successful `data` response with no `errors`.
- [ ] 4.4 Create `src/schema.generate.ts` per `design.md` Decision #6 (minimal Nest context,
      `GraphQLModule` only, no `DatabaseModule`). Add `schema:generate` and `schema:check`
      (`schema:generate` + `git diff --exit-code schema.gql`) npm scripts. Verify: stop the
      Docker database, run `npm run schema:generate`, and confirm it succeeds and produces an
      identical `schema.gql` to the one from 4.1.

## 5. Health endpoint

- [ ] 5.1 Add `@nestjs/terminus`'s `TerminusModule` to a new `HealthModule`, importing
      `DatabaseModule`. Implement `GET /api/health` using `TypeOrmHealthIndicator.pingCheck`
      per `design.md` Decision #7. Set the app's global prefix to `api` in `main.ts`, excluding
      `/graphql` from it (per Decision #7's note that GraphQL stays unprefixed).
- [ ] 5.2 Write an e2e test (`test/health.e2e-spec.ts`) asserting: (a) with the database up,
      `GET /api/health` returns 200 with a passing database check; (b) the endpoint requires no
      Authorization header. Verify the test passes with `npm run test:e2e`.
- [ ] 5.3 Write an e2e test asserting `GET /api/health` returns a non-2xx status when the
      database is unreachable (stop the Docker container for this one test, or point the health
      indicator at a bad connection in the test setup — choose whichever is more reliable in
      CI-less local test runs, and document the choice in the test file). Verify it passes.

## 6. Cross-cutting verification

- [ ] 6.1 Write `test/schema-drift.e2e-spec.ts` per `LEARNING/01-graphql.md` §10: load the
      running schema via `GraphQLSchemaHost`, print it sorted, and assert it matches the
      committed `schema.gql` byte-for-byte. Verify it passes on a clean build and would fail if
      `schema.gql` were manually edited (test this by hand once, then revert the edit).
- [ ] 6.2 Run the full verification sequence end-to-end on a **fresh** `docker compose down -v`
      + `up -d` + `migration:run` + `start:dev` to confirm `README.md`'s "Getting started"
      steps are accurate as written. Fix the README if any step was wrong or missing.
- [ ] 6.3 Confirm every spec scenario in `specs/service-health/spec.md` and
      `specs/graphql-api/spec.md` has a corresponding passing test or manual verification
      performed in tasks 4-5 above. Note any gap and add a task to close it before proceeding.

## 7. Learning documentation

- [ ] 7.1 Write `LEARNING/02-nestjs-fundamentals.md` covering: modules, providers, and
      dependency injection; the `forRoot` vs `forRootAsync` distinction and why config-dependent
      modules need the latter; what `@Injectable()` actually does; the DI container at a level
      of depth matching `00-docker.md` and `01-graphql.md`. Write it to be read *before* section
      2-3 implementation, so future readers of this change can learn from it in the intended order.
- [ ] 7.2 Update `README.md`'s "Getting started" section if task 6.2 surfaced any corrections.
