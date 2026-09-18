## 1. Project scaffold and tooling

- [x] 1.1 Run `nest new` (or manual scaffold) into `ksp-backend`, TypeScript, npm. Verify
      `npm run start:dev` boots the default Nest app and `npm test` runs the default spec.
      **Done via `@nestjs/cli@11.0.24`** (not `@latest`/12.x — see note below) scaffolded into
      an isolated temp dir, then merged in, keeping our existing `README.md`. Verified: unit
      tests 1/1 passed, `npm run start:dev` compiled and booted, and `curl localhost:3000/`
      returned 200.
      Also found and fixed 4 high-severity multer DoS CVEs (CVSS 7.5) surfaced by `npm install`
      via an `overrides` pin to `multer@^2.4.0` — unrelated to the Nest version choice, fixable
      without it. `npm audit` → 0 vulnerabilities.
- [x] 1.2 Install pinned dependencies exactly as specified in `proposal.md`'s Impact section
      (`@nestjs/config`, `joi`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/graphql@13.4.5`,
      `@nestjs/apollo@13.4.5`, `@apollo/server@^5.5.1`, `@as-integrations/express5`,
      `graphql@^16.11.0`, `@nestjs/terminus`). Verify `npm ls graphql` reports `16.x`, not `17.x`.
      **Verified: `graphql@16.14.2`**, deduped to one copy across the whole tree. `npm audit`
      → 0 vulnerabilities. `npm run build` still clean with the new deps present but unwired.

> **Note on `typeorm` (discovered during 1.2, not anticipated in design.md/proposal.md):**
> npm resolved `typeorm@1.1.1` — TypeORM shipped a real `1.0` major (verified legitimate:
> same GitHub org, same maintainers as the well-known `0.3.x` line, which is now tagged
> `legacy`). Investigated rather than assumed safe, the same way as the Nest 12 finding in
> 1.1: fetched TypeORM's own upgrade guide. Verdict — **kept `1.1.1`**, no pin-back needed:
>
> - No peer-dependency conflict (unlike Nest 12). `@nestjs/typeorm@12.0.1` (well past the
>   documented `v11.0.1+` minimum for v1 compat) declares `typeorm: "^0.3.0 || ^1.0.0-dev"`.
> - Every removed API (`Connection`, the global `createConnection`/`getRepository` helpers,
>   `TYPEORM_*` env vars) was something our design never planned to use — `design.md`
>   Decision #3 already specified `DataSource`, and `nestjs.md` already specified
>   `@InjectRepository` DI over TypeORM's own deprecated repository helpers.
> - `@Entity`/`@Column`/relation decorators, `@Tree`, and the migration CLI are unaffected.
> - **One behavioral nuance to remember from Phase 4 onward, not a blocker now:**
>   `nullable: false` on `@ManyToOne`/owning `@OneToOne` now generates an INNER JOIN instead
>   of a LEFT JOIN.

- [x] 1.3 Enable `emitDecoratorMetadata` and `experimentalDecorators` in `tsconfig.json`
      (required for both TypeORM and `@nestjs/graphql` code-first). Verify `npm run build` succeeds.
      **Already true in the Nest 11 scaffold's generated `tsconfig.json`** — no edit needed.
      Verified: `npm run build` → clean, `dist/` produced with no errors.

> **Note on the CLI version pin (discovered during 1.1, not anticipated in design.md):**
> `@nestjs/cli@latest` today scaffolds **NestJS 12** with native ESM (`"type": "module"`) and
> Vitest/oxlint. Verified via npm that `@nestjs/graphql@13.4.5`'s peerDependencies require
> `@nestjs/core@^11.0.1` — **not** 12.x — so that combination would break on install. Also
> verified NestJS 11 is actively maintained in parallel (`11.2.5` patch shipped the same day as
> `12.0.3`; 12.0.0 itself is under a month old at time of writing), so pinning to it is not
> "using an outdated version," it's using what our already-verified GraphQL/Apollo stack
> requires. Scaffolded with `@nestjs/cli@11.0.24` instead, which correctly produced Nest 11 +
> CommonJS + Jest — matching `testing.md`, `design.md`, and every version pin already in
> `proposal.md`, with zero rule changes needed.

- [x] 1.4 Install and configure Prettier (`npm i -D prettier`) so the already-committed
      `.claude/hooks/prettier-check.mjs` stops no-op'ing. Verify: edit a file with bad
      formatting via Claude Code and confirm the hook reports the failure.
      **Already present** in the Nest 11 scaffold's `devDependencies`. Verified directly:
      appended malformed code to `src/app.service.ts`, confirmed the hook reported
      `Prettier check FAILED`, then restored the file to a clean diff.
- [x] 1.5 Add `scripts/git-hooks/pre-commit` implementing Decision #8 (self-healing
      `schema.gql` regeneration on staged resolver/model/input changes; non-blocking warning
      on staged `*.entity.ts` changes with no staged migration file). Wire it via a `prepare`
      npm script running `git config core.hooksPath scripts/git-hooks`. Verify: run
      `npm install` and confirm `git config core.hooksPath` reports `scripts/git-hooks`.
      **Verified with real commits on a throwaway branch** (deleted after), all five paths:
      entity without migration → warns, commit proceeds; entity with migration → silent;
      resolver staged before `schema:generate` exists (true until task 4.4) → graceful no-op;
      a failing `schema:generate` → **commit genuinely blocked** (confirmed HEAD unchanged);
      a succeeding one → `schema.gql` regenerated and automatically included in the commit.
      `npm install` → `git config core.hooksPath` → `scripts/git-hooks`, confirmed.

## 2. Configuration layer

- [x] 2.1 Create `src/config/env.validation.ts` with a Joi schema covering every variable in
      `.env.example` (`NODE_ENV` enum, `PORT`, `POSTGRES_*`, `JWT_*` — required even though
      unused until Phase 5, so the schema doesn't need revisiting then). Write a unit test
      that asserts validation throws on a missing `POSTGRES_PORT` and on a non-numeric one.
      Also enforces a rule `.env.example` only stated as a comment: the two JWT secrets must
      differ (`Joi.ref` + `.invalid`). Excludes `PGADMIN_*` deliberately — Docker Compose
      reads those directly, this process never does. 7 tests, all passing.
- [x] 2.2 Create `src/config/configuration.ts` using `registerAs` to namespace config
      (`database`, `jwt`, `app`). Write a unit test asserting `configuration()` returns the
      expected shape given a known `process.env`. 3 tests, all passing (a 4th, redundant
      "coerces PORT to a number" test was removed during the `/simplify` pass — the shape
      assertion already covers it via `toEqual`).

> **Note on `@nestjs/config` (discovered during 2.2, not anticipated in design.md):**
> Jest failed with `Must use import to load ES Module` the moment a spec imported anything
> from `configuration.ts`, which itself imports `@nestjs/config`. Investigated rather than
> patched blindly: `@nestjs/config@12.0.0` (the only version `npm install` resolves — its
> version history jumps straight from `4.0.4` to `12.0.0`, no 11.x line ever existed) ships
> `"type": "module"` in its own `package.json`. **This is not a wrong-version problem like
> the Nest 12 or TypeORM findings** — its peerDependencies explicitly declare
> `"@nestjs/common": "^11.0.0 || ^12.0.0"`, meaning the NestJS team deliberately built this
> release to support both majors at once; the version-number jump aligned it with the rest
> of the ecosystem, it wasn't gated behind Nest 12. The real issue is narrower: Jest's
> default `transformIgnorePatterns` skips all of `node_modules`, so it tried to `require()`
> raw ESM as CommonJS. Fixed with the standard carve-out —
> `"transformIgnorePatterns": ["../node_modules/(?!(@nestjs/config)/)"]` (path is relative
> to `rootDir: "src"`) — so ts-jest transforms this one package too. Full suite (12 tests)
> and `npm run build` both verified clean afterward.

- [x] 2.3 Wire `ConfigModule.forRoot({ isGlobal: true, validationSchema, load: [configuration] })`
      in `AppModule`. Verify: temporarily blank a required `.env` value, confirm
      `npm run start:dev` fails at boot with a readable Joi error naming the missing variable,
      then restore it.
      `load: [appConfig, databaseConfig, jwtConfig]` — the three namespaced factories from
      2.2, since `configuration.ts` exports three registerAs calls rather than one combined
      function. **Verified both halves for real, not just read the code:** blanked
      `POSTGRES_PORT` in `.env` → boot failed immediately with
      `Config validation error: POSTGRES_PORT: "POSTGRES_PORT" must be a number` (before
      "Nest application successfully started" ever logs); restored `.env` → boot succeeded,
      `curl localhost:3000/` → 200. `.env` is gitignored, so none of this touched git history.

## 3. Database connection and first migration

- [x] 3.1 Create `src/database/database.module.ts` with
      `TypeOrmModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory })`
      per `design.md` Decision #1/#3. Verify `npm run start:dev` logs a successful DB connection
      (with Docker Postgres already running from Phase 0).
      `autoLoadEntities: true` instead of a hand-maintained entity list or glob — avoids the
      classic dev-vs-compiled-dist path mismatch; picks up `TypeOrmModule.forFeature([...])`
      registrations automatically starting Phase 4. No `migrations` array here deliberately —
      this module only connects; only the CLI (`data-source.ts`) ever runs migrations, and
      only when a human explicitly invokes it, per `database.md`'s migrations-only rule.

> **Real incident hit while verifying this task, not a hypothetical:** the first boot attempt
> failed with `password authentication failed for user "ksp_user"`, even though
> `docker compose ps` showed `ksp-postgres` as `healthy` and the exact same password worked
> via `docker compose exec postgres psql ...`. Diagnosed rather than guessed: a **native
> Windows PostgreSQL 14 service** (pre-existing on this machine, unrelated to this project)
> was listening on host port 5432 and winning it — Docker's healthcheck runs _inside_ the
> container, so it never notices a host-side collision. `psql` via `docker compose exec`
> reaches the container directly (bypassing the host network entirely), which is why it
> worked while the Windows-native Node process — hitting `localhost:5432` — silently reached
> the wrong Postgres instance instead. Confirmed via `Get-NetTCPConnection -LocalPort 5432` +
> `Get-CimInstance Win32_Process`, then a Windows Service check. Fixed by moving **only this
> machine's local `.env`** to `POSTGRES_PORT=5434` (verified free first — 5433 turned out to
> be transiently held by Docker's own WSL2 relay from a failed intermediate attempt) and
> recreating the container; `.env.example`'s documented default stays `5432` since this
> conflict is machine-specific, not a fact about the project. Data volume (`ksp_pgdata`)
> confirmed intact throughout — only the container was recreated, never the volume. Verified
> the actual fix by re-running `npm run start:dev` and seeing `TypeOrmCoreModule dependencies
initialized` (which only ever logs after `DataSource.initialize()` genuinely succeeds), not
> just by re-reading the code. Documented in full in `LEARNING/00-docker.md` §8 and
> `README.md`'s troubleshooting table, since "healthcheck says healthy but the host still
> can't really reach it" is a real, non-obvious Docker/Windows interaction worth knowing.

> **Second, unrelated incident hit during this task's final verification pass:**
> `npm run test:e2e` — which had genuinely passed at the end of task group 2 — broke again the
> moment `database.module.ts` started importing `@nestjs/typeorm`. Same category as the
> `@nestjs/config` ESM finding from task 2.2, but this one took real digging: the package's
> `dist/index.js` used plain `import`/`export` (mechanically convertible), so the same
> `transformIgnorePatterns` allowlist fix seemed like it should be enough — but even after
> adding it correctly to **both** jest configs (learning from the exact mistake code-review
> caught last time), the error persisted. Root cause turned out to be two-layered:
> (1) our `tsconfig.json`'s `"module": "nodenext"` makes ts-jest emit ESM for any file whose
> _containing package_ declares `"type": "module"` — being "allowed through" isn't the same as
> being "converted"; needed an explicit `module: "CommonJS"` override in ts-jest's transform
> config. (2) One specific nested file
> (`@nestjs/typeorm/dist/common/typeorm-compat.js`) uses `createRequire(import.meta.url)` —
> genuinely unconvertible, since `import.meta` has no CommonJS equivalent at all. Tested and
> rejected the blanket "transform everything" approach
> (`transformIgnorePatterns: []`) — confirmed it does NOT fix the `import.meta` case either,
> only makes every run ~30s slower for no benefit. Real fix: a `moduleNameMapper` stub
> (`test/mocks/typeorm-compat.stub.js`) that faithfully reproduces the real file's behavior
> for our actual TypeORM version (both `Connection` and `AbstractRepository` are already
> removed in 1.x, so the stub exports `undefined` for both directly — not a generic mock, the
> literal value the real file already computes for us). Full writeup, including the exact
> configs, in `.claude/rules/nestjs.md`'s "recurring gotcha" section — now split into two
> named failure modes since they need genuinely different fixes. Verified: `npm test` (11/11),
> `npm run test:e2e` (1/1, was 0/1 before the fix), `npm run build`, `npm audit` (0
> vulnerabilities), and a real boot with `curl localhost:3000/` → 200 — all re-checked
> afterward, not assumed clean because the config edits "looked right."

- [x] 3.2 Create `src/database/data-source.ts` as a standalone `DataSource` for the TypeORM
      CLI, reading `.env` via `dotenv`, sharing connection values with 3.1. Add
      `migration:generate`, `migration:run`, `migration:revert` npm scripts pointed at it.
      Verify `npm run migration:run -- --dry-run` (or equivalent) resolves without error.
      **Correction to this task's own wording:** `migration:run` has no `--dry-run`/`--dr`
      flag — that flag exists only on `migration:generate` (checked `typeorm-ts-node-commonjs
migration:run --help` directly rather than assume). Verified instead by actually running
      `npm run migration:run` for real — safe with zero pending migrations. It connected to
      the real (corrected-port) database, created TypeORM's own `migrations` tracking table
      (the expected first-run side effect), and correctly reported "No migrations are
      pending."

> **Post-commit `/simplify` pass on tasks 3.1/3.2 (4 parallel review agents: reuse,
> simplification, efficiency, altitude):** reuse and efficiency found nothing; simplification
> and altitude both independently flagged the same real issue — `package.json` and
> `test/jest-e2e.json` had accumulated a byte-identical, hand-duplicated ts-jest override
> block, the exact failure mode `nestjs.md` had just finished documenting as something we'd
> already been burned by once. Fixed by extracting the shared pieces into `jest.shared.js`,
> consumed by two new standalone configs (`jest.config.js`, `test/jest-e2e.config.js`) that
> replace the old inline `package.json` `"jest"` key and `test/jest-e2e.json` — a future
> ESM-shipping package is now a one-line edit in one place, not two hand-synced copies.
> Altitude also caught a second, sharper issue: the `typeorm-compat.stub.js` comment claimed
> the project was "pinned to `typeorm@^1.1.1`" — a caret range, not a pin, so a routine
> `npm install` could silently move past the version the stub's assumption depends on with no
> alarm. Fixed with a genuine drift-detector
> (`src/database/typeorm-version-assumptions.spec.ts`) asserting the installed majors still
> match what was verified — **proved it actually fails on a mismatch** (temporarily changed
> the expected prefix to `'99.'`, confirmed a real failure, reverted) rather than assuming a
> plausible-looking assertion works. Verified afterward: `npm test` (13/13, up from 11 with
> the new guard test), `npm run test:e2e` (1/1), `npm run build`, `npm audit`
> (0 vulnerabilities).

- [x] 3.3 Generate the first migration (`npm run migration:generate -- --name=AddExtensions`),
      then hand-add the two `CREATE EXTENSION IF NOT EXISTS pgcrypto;` /
      `CREATE EXTENSION IF NOT EXISTS citext;` statements per `design.md` Decision #4 — the
      differ has nothing to diff yet. **Read the generated file before running it** (project
      rule). Verify: `npm run migration:run` against the Docker database succeeds, and
      `docker compose exec postgres psql -U ksp_user -d ksp_ecommerce -c "\dx"` lists both
      extensions.
      **Two corrections to this task's own wording, both verified rather than assumed:**
      (1) `migration:generate` does NOT produce an empty migration when there's nothing to
      diff — it refuses outright, naming `migration:create` as the right command. `design.md`
      Decision #4 has been corrected accordingly; used `migration:create` (added as a new npm
      script — it needs no `-d` flag, since scaffolding a file requires no DB connection).
      (2) The CLI takes a **positional path**, not `--name=X` (checked `--help` first).
      Read the scaffolded file before writing into it, per the project rule. `down()`
      deliberately uses plain `DROP EXTENSION IF EXISTS`, **never `CASCADE`** — CASCADE would
      silently destroy dependent objects (future `citext` columns, `gen_random_uuid()`
      defaults), turning a routine rollback into data loss; without it Postgres refuses and
      tells you a later migration must be reverted first, which is the behaviour we want.
      Verified beyond the task's bar: captured the extension list **before** running (only
      `plpgsql`, so the migration genuinely did the work rather than silently no-op'ing on
      pre-existing extensions), then after (`citext` 1.6, `pgcrypto` 1.3), plus the
      `migrations` bookkeeping row. Also proved both extensions actually _function_, not just
      appear in `\dx`: `gen_random_uuid()` returns a real UUID, and
      `'Foo@Example.com'::citext = 'foo@example.com'::citext` → `t` while the same comparison
      as plain `text` → `f` — a direct demonstration of why `users.email` needs `citext`.
- [x] 3.4 Verify `npm run migration:revert` cleanly drops both extensions, then re-run
      `migration:run` to leave the database in the applied state.
      Full round trip verified: revert dropped both extensions (back to `plpgsql` only) **and**
      removed the `migrations` row (count 0); re-running re-applied both and restored the
      bookkeeping row. Database left in the applied state. Worth noting the migration log
      shows `START TRANSACTION` / `COMMIT` around both directions — TypeORM runs migrations
      transactionally by default, so a mid-migration failure rolls back atomically including
      the bookkeeping write. Doing this rollback test **now**, while nothing yet depends on
      the extensions, is deliberate: once entities exist, `DROP EXTENSION` without CASCADE
      will correctly refuse.

## 4. GraphQL bootstrap

- [x] 4.1 Wire `GraphQLModule.forRootAsync<ApolloDriverConfig>` in `AppModule` exactly per
      `design.md` Decision #5 (`ApolloDriver`, `autoSchemaFile` at repo root, `sortSchema: true`,
      `graphiql` gated on `NODE_ENV`, explicit `context` factory). Verify `npm run start:dev`
      boots without error and creates `schema.gql`.
      Reads `nodeEnv` off the typed `app` namespace via `getOrThrow<AppConfig>('app')` rather
      than `config.get('NODE_ENV')`, matching how `main.ts` reads the port. `introspection` is
      gated alongside `graphiql`. Build confirmed both are valid `ApolloDriverConfig` options.

> **Ordering constraint this task list didn't anticipate (found by running it):** 4.1's stated
> verification — "boots without error and creates `schema.gql`" — **cannot pass before 4.2
> exists.** A GraphQL schema is invalid without at least one root query, so with zero
> resolvers the boot dies at `GraphQLError: Query root type must be provided.` and no
> `schema.gql` is written. Demonstrated deliberately rather than worked around, since it's a
> genuinely useful constraint to understand: until real feature resolvers arrive in Phase 4,
> `apiStatus` is what makes the schema generatable at all. 4.1 and 4.2 are effectively one
> unit of work.

- [x] 4.2 Add a minimal `AppResolver` with `apiStatus: String!` returning a static string, per
      `specs/graphql-api/spec.md` "A minimal query proves the schema is live". Write a unit
      test for the resolver (no mocks needed — it has no dependencies) and confirm it returns
      the expected value.
      Registered in `AppModule`'s `providers` — a `@Resolver()` is an ordinary provider, and
      Nest discovers it no other way. Emitted SDL is `apiStatus: String!` with the
      `description` option carried through as a GraphQL docstring. 1 test, passing (14 total).
- [x] 4.3 Verify manually: open `http://localhost:3000/graphql`, confirm GraphiQL loads, run
      `{ apiStatus }` and confirm a successful `data` response with no `errors`.
      GraphiQL HTML confirmed served for a browser-style `Accept: text/html` request;
      `POST /graphql {"query":"{ apiStatus }"}` → `{"data":{"apiStatus":"ok"}}` with no
      `errors` key, exactly as `specs/graphql-api/spec.md` requires.

> **Correction to our own rules, found while verifying 4.3.** `graphql.md` and `testing.md`
> both said GraphQL "returns HTTP 200 for essentially every outcome." Testing an invalid query
> against the real server showed that's too broad: `{ fieldThatDoesNotExist }` returns **400**
> (`extensions.code: GRAPHQL_VALIDATION_FAILED`), not 200. The precise rule is
> **execution-phase** failures (resolver threw, guard rejected — everything auth-related)
> → 200 + `errors`; **parse/validation-phase** failures (malformed or schema-invalid
> documents) → 400 + `errors`. This matters directly for Phase 5: auth assertions stay at 200,
> so the existing guidance holds, but the blanket phrasing would have justified a wrong test
> eventually. Both rule files corrected with a table. Also visible in that response:
> `extensions.stacktrace`, present because `NODE_ENV !== 'production'` — exactly the
> disclosure `graphql.md`'s Security section says Phase 10's `formatError` must redact.

- [x] 4.4 Create `src/schema.generate.ts` per `design.md` Decision #6 (minimal Nest context,
      `GraphQLModule` only, no `DatabaseModule`). Add `schema:generate` and `schema:check`
      (`schema:generate` + `git diff --exit-code schema.gql`) npm scripts. Verify: stop the
      Docker database, run `npm run schema:generate`, and confirm it succeeds and produces an
      identical `schema.gql` to the one from 4.1.
      Uses `GraphQLSchemaBuilderModule` + `GraphQLSchemaFactory` (NestJS's own minimal module
      for this), and imports `GRAPHQL_SDL_FILE_HEADER` from `@nestjs/graphql` rather than
      hardcoding the header — checked it's publicly exported, so byte-identity survives any
      future change to it upstream. **Verified with `docker compose stop postgres`:** the
      script ran clean with no database, and the output was byte-identical to the
      app-generated file (same md5 `ba72df29…`, `diff` empty). Also verified `schema:check`
      in **both** directions rather than only the passing one: added a temporary extra field
      to `AppResolver`, confirmed it detected the drift and exited **1**; reverted, confirmed
      exit 0. (First measurement of that exit code was wrong — piping through `tail` meant
      `$?` captured `tail`'s status, not the check's. Re-ran unpiped to get the real value.)
      One maintenance cost stated plainly in the file: `RESOLVERS` is a hand-maintained list,
      since this script never builds the app's module graph. Task 6.1's schema-drift e2e test
      and the pre-commit hook both cover that gap.

## 5. Health endpoint

- [x] 5.1 Add `@nestjs/terminus`'s `TerminusModule` to a new `HealthModule`, importing
      `DatabaseModule`. Implement `GET /api/health` using `TypeOrmHealthIndicator.pingCheck`
      per `design.md` Decision #7. Set the app's global prefix to `api` in `main.ts`, excluding
      `/graphql` from it (per Decision #7's note that GraphQL stays unprefixed).
      **Two corrections to this task's own wording, both found by testing rather than assuming:** 1. **`HealthModule` must NOT import `DatabaseModule`.** `TypeOrmModule.forRootAsync`
      registers `TypeOrmCoreModule`, which is `@Global()` — the `DataSource` is injectable
      application-wide, so `TypeOrmHealthIndicator` resolves with `imports: [TerminusModule]`
      alone. Importing `DatabaseModule` would be redundant noise implying a dependency that
      isn't real. 2. **Excluding `/graphql` from the prefix is unnecessary.** `@nestjs/graphql` registers
      its route through the Apollo driver, not Nest's HTTP router, so `setGlobalPrefix` never
      sees it. No `exclude` option needed. Verified three ways against the running app: - boot log: `HealthController {/api/health}` **and** `Mapped {/graphql, POST}` - `GET /api/health` → **200** `{"status":"ok","info":{"database":{"status":"up",…}}}` - `POST /graphql` → **200** `{"data":{"apiStatus":"ok"}}`, while
      `POST /api/graphql` → **404** (proving the prefix genuinely did not apply)
- [x] 5.2 Write an e2e test (`test/health.e2e-spec.ts`) asserting: (a) with the database up,
      `GET /api/health` returns 200 with a passing database check; (b) the endpoint requires no
      Authorization header. Verify the test passes with `npm run test:e2e`.
- [x] 5.3 Write an e2e test asserting `GET /api/health` returns a non-2xx status when the
      database is unreachable (stop the Docker container for this one test, or point the health
      indicator at a bad connection in the test setup — choose whichever is more reliable in
      CI-less local test runs, and document the choice in the test file). Verify it passes.
      **Chose overriding the `DataSource` provider over stopping the container** (rationale in
      the spec file): hermetic, no Docker CLI dependency, no machine-wide state mutated from
      inside a test, and it still runs the real indicator, the real `SELECT 1` dispatch, the
      real `HealthCheckService`, and Terminus's real error mapping — only the socket is faked.
      Asserts **503** specifically rather than merely "non-2xx", because 503 is what tells a
      load balancer to pull the instance while a 500 would read as an application bug.
      **3/3 e2e tests pass.**

> **Two findings during 5.2/5.3 that changed more than this task group.**
>
> **(a) The e2e harness didn't mirror `main.ts`, and would have produced a lying test.**
> An e2e spec builds its app with `createNestApplication()`, which runs the module graph but
> never calls `bootstrap()` — so `setGlobalPrefix('api')` did not exist in tests. A health spec
> would have had to hit `/health` to go green while production serves `/api/health`: a passing
> test proving nothing about the deployed route. Fixed at the root rather than by hardcoding
> the path in the spec — bootstrap configuration moved into `src/app.setup.ts`'s
> `configureApp(app)`, called by both `main.ts` and every e2e spec. Phase 5's global
> `ValidationPipe` and GraphQL exception filter now land there once and the tests inherit them,
> which is exactly what `testing.md` already required ("apply the same global
> pipes/filters/interceptors as `main.ts` — otherwise error codes differ and the tests lie").
>
> **(b) The whole Jest/ESM workaround stack is deleted.** `@nestjs/terminus@12` ships ESM like
> `@nestjs/config` and `@nestjs/typeorm` before it, but allowlisting it in
> `transformIgnorePatterns` changed nothing: three of its files use `import.meta`
> (`health-check.decorator.js`, `utils/checkPackage.util.js`, and `microservice/grpc.health.js`,
> which the root barrel pulls in unconditionally), which no transform can convert. That meant
> three more hand-written stubs — tripling the mock surface for one health endpoint.
>
> Took the other branch instead, **with the user's agreement since it changes their
> environment**: Node 22.22.1 → **24.11.1** (already installed under nvm; nothing downloaded),
> which lets Jest 30 `require()` ESM natively. Deleted: the `transformIgnorePatterns`
> allowlist, the ts-jest `module: CommonJS` override, `test/mocks/typeorm-compat.stub.js`, and
> `src/database/typeorm-version-assumptions.spec.ts` (the drift guard that existed only to
> protect that stub — hence unit tests dropping 13 → 11).
>
> **The trap, which cost the most time here:** Jest's gate is
> `vm.SourceTextModule.prototype.hasAsyncGraph`, and `vm.SourceTextModule` only exists under
> **`--experimental-vm-modules`**. Upgrading Node alone accomplishes nothing — the check reads
> false either way, with the identical error message, which reads as "the upgrade didn't work."
> The flag now lives in one place: package.json's `"jest"` script, which `test`, `test:watch`,
> `test:cov` and `test:e2e` all delegate to. Node is pinned by `engines` + `.nvmrc`.
> `.claude/rules/nestjs.md`'s ESM section was rewritten from a how-to-work-around guide into a
> how-to-diagnose-a-regression one.

- [x] 5.4 (unplanned, arising from 5.1) Delete the Nest scaffold's vestigial
      `AppController`/`AppService` and their specs. Nothing referenced them — `AppResolver` is
      independent — and `nestjs.md` already stated the only controllers in this app are health
      and (later) uploads. `setGlobalPrefix('api')` had just relocated their dead "Hello World!"
      route from `/` to `/api`, which made keeping it actively misleading. Verified on a real
      `start:prod` boot: the app now maps exactly two routes, `{/api/health, GET}` and
      `{/graphql, POST}`; `/` and `/api` both 404; `npm run schema:check` still exits 0
      (confirming they contributed nothing to the GraphQL contract).

## 6. Cross-cutting verification

- [ ] 6.1 Write `test/schema-drift.e2e-spec.ts` per `LEARNING/01-graphql.md` §10: load the
      running schema via `GraphQLSchemaHost`, print it sorted, and assert it matches the
      committed `schema.gql` byte-for-byte. Verify it passes on a clean build and would fail if
      `schema.gql` were manually edited (test this by hand once, then revert the edit).
- [ ] 6.2 Run the full verification sequence end-to-end on a **fresh** `docker compose down -v` + `up -d` + `migration:run` + `start:dev` to confirm `README.md`'s "Getting started"
      steps are accurate as written. Fix the README if any step was wrong or missing.
- [ ] 6.3 Confirm every spec scenario in `specs/service-health/spec.md` and
      `specs/graphql-api/spec.md` has a corresponding passing test or manual verification
      performed in tasks 4-5 above. Note any gap and add a task to close it before proceeding.

## 7. Learning documentation

- [ ] 7.1 Write `LEARNING/02-nestjs-fundamentals.md` covering: modules, providers, and
      dependency injection; the `forRoot` vs `forRootAsync` distinction and why config-dependent
      modules need the latter; what `@Injectable()` actually does; the DI container at a level
      of depth matching `00-docker.md` and `01-graphql.md`. Write it to be read _before_ section
      2-3 implementation, so future readers of this change can learn from it in the intended order.
- [ ] 7.2 Update `README.md`'s "Getting started" section if task 6.2 surfaced any corrections.
