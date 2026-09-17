---
paths:
  - 'ksp-backend/src/**/*.ts'
  - 'src/**/*.ts'
  - 'ksp-backend/nest-cli.json'
  - 'nest-cli.json'
---

# NestJS conventions (ksp-backend)

## Module & DI

- A provider can only be injected by another module if the owning module **`exports`** it.
  This is the #1 source of "Nest can't resolve dependencies" errors — check `exports` first.
- Register anything global **once**, in `AppModule`, using the `APP_*` DI tokens
  (`APP_PIPE`, `APP_FILTER`, `APP_INTERCEPTOR`, `APP_GUARD`) — preferred over
  `app.useGlobal*()` whenever the provider needs injected dependencies (`Reflector`, `ConfigService`).
- Multiple `APP_GUARD` providers run in the order they appear in `providers`.
  `JwtAuthGuard` must come before `RolesGuard`.

## Layering

- **Thin controllers**: routing, status codes, Swagger decorators. No business logic.
- **Fat services**: all business rules live here. Services are what unit tests target.
- **Repositories** (TypeORM) handle persistence. Inject with `@InjectRepository(Entity)`.
- Never read `process.env` directly outside `config/` — inject `ConfigService`.

## File layout per feature module

This API is **GraphQL-only** — resolvers replace controllers. See `graphql.md`.

```
<feature>/
  <feature>.module.ts
  <feature>.resolver.ts         <-- NOT a controller
  <feature>.resolver.spec.ts
  <feature>.service.ts
  <feature>.service.spec.ts     <-- unit test lives beside the source
  <feature>.mapper.ts           <-- entity -> model, pure functions
  entities/                     <-- @Entity()     persistence shape
  models/                       <-- @ObjectType() API shape (output)
  inputs/                       <-- @InputType()  API shape (input)
```

The only controllers left in the app are `health/health.controller.ts` and
`uploads/uploads.controller.ts` (binary transfer). Everything else is a resolver.

`dto/` does not exist here — it splits into `inputs/` and `models/`, because GraphQL forbids
using an input type as an output type.

## Errors

Throw Nest's built-in HTTP exceptions from services (`NotFoundException`,
`ForbiddenException`, `ConflictException`, `BadRequestException`) — the global filter
translates them into GraphQL errors with an `extensions.code`. Don't throw bare `Error`.
Services stay transport-agnostic; only the filter knows about GraphQL.

## Provider scope

`Scope.REQUEST` (used by the DataLoader service) **bubbles**: anything injecting a
request-scoped provider becomes request-scoped itself, and so does anything injecting _that_.
Consequence for tests: `module.get()` throws for request-scoped providers — use
`await module.resolve()` instead.

## Mapped types

`PartialType` / `PickType` / `OmitType` must be imported from **`@nestjs/graphql`**.
Importing them from `@nestjs/swagger` or `@nestjs/mapped-types` silently drops GraphQL
metadata and produces a broken schema.

## Async config

Modules needing config use the `forRootAsync`/`registerAsync` + `useFactory` +
`inject: [ConfigService]` pattern, never top-level `process.env` reads.

## A recurring gotcha: `@nestjs/*` packages shipping ESM ahead of the framework

We've hit this three times now (the CLI's default scaffold moving to Nest 12 + full ESM;
`@nestjs/config@12.0.0` and `@nestjs/typeorm@12.0.1` both shipping `"type": "module"` while
still declaring peer-support for Nest 11). Individual packages in the ecosystem are migrating
to ESM on their own schedule, independent of whether the _framework itself_ has moved — expect
more of these. **There are two genuinely different failure modes hiding behind the identical
error message** — diagnose which one you have before picking a fix.

**Always start here:** check the failing package's own `peerDependencies`
(`npm view <pkg> peerDependencies`) to confirm it's a deliberate dual-support release and not
actually a wrong-major-version problem like the Nest 12 CLI scaffold was (that needs pinning
to an older major, not any of the fixes below).

### Failure mode A — plain `import`/`export` keywords (mechanically convertible)

**Symptom:** `Must use import to load ES Module` naming a file that just uses ordinary
`import { X } from 'y'` / `export const Z` syntax.

**Fix, two parts, both required, both live in ONE place — `jest.shared.js`:**

The unit config (`jest.config.js`) and e2e config (`test/jest-e2e.config.js`) both `require()`
this file rather than each carrying their own copy. This exists specifically because the
duplicated-copy version already caused a real regression once (task group 2 fixed
`@nestjs/config`'s ESM issue in one config, `npm run test:e2e` broke silently because the other
never got the same fix — see `tasks.md` task 3.1/3.2). Add a new package name in
`jest.shared.js` and both configs pick it up automatically; there is nothing left to hand-sync.

1. Allowlist the package in `transformIgnorePatterns`. Current pattern:
   `"node_modules.(?!(@nestjs.config|@nestjs.typeorm).)"` — note the `.` instead of a literal
   `/` or `\`; Jest doubles backslashes when normalizing these patterns on Windows in a way
   that breaks a literal separator character, but a `.` wildcard is immune to it. Append
   `|@nestjs.whatever` inside the parentheses for a new package.
2. **Also required, not optional:** override ts-jest's own `module`/`moduleResolution` for the
   transform. Our `tsconfig.json` uses `"module": "nodenext"`, which makes TypeScript decide
   per-file whether to treat code as ESM based on the _containing package's_ `package.json` —
   so even once Jest allows the file through, ts-jest still emits ESM output for it unless
   told otherwise. `jest.shared.js`'s `transform` entry carries:
   ```json
   [
     "ts-jest",
     {
       "tsconfig": {
         "module": "CommonJS",
         "moduleResolution": "node",
         "resolvePackageJsonExports": false
       }
     }
   ]
   ```
   This overrides ts-jest's in-memory compilation only — `tsconfig.json` itself (and
   therefore `nest build`) keeps `nodenext`, which is correct for real compilation.

### Failure mode B — genuinely ESM-native syntax (not mechanically convertible)

**Symptom:** same error, but the file uses `import.meta` (commonly via
`createRequire(import.meta.url)`, a pattern for getting a working `require()` inside an ESM
module). **No transform configuration can fix this** — `import.meta` has no CommonJS
equivalent; it's not a keyword-rewrite problem, it's a runtime-semantics one. We hit this in
`@nestjs/typeorm/dist/common/typeorm-compat.js`.

**Fix:** a `moduleNameMapper` entry (in each config individually — the mapped path differs per
config's `<rootDir>`, so this one part can't move into `jest.shared.js`) redirecting the
specific file to a small local stub (`test/mocks/typeorm-compat.stub.js`) that reproduces its
real behavior for our actual dependency versions — not a generic mock, a faithful one. That
file's whole job is "resolve `Connection`/`AbstractRepository` from `typeorm` if present, else
`undefined`"; TypeORM 1.x already removed both, so the stub can just export `undefined` for
each directly, which is exactly what the real file computes for us today. Match pattern:
`"typeorm-compat(\\.js)?$"` → the stub path (careful: `<rootDir>` resolves relative to the
_config file's own location_, not the project root — `test/jest-e2e.config.js`'s `<rootDir>`
is the `test/` folder itself, not `..`).

Because `typeorm`/`@nestjs/typeorm` are caret-ranged, not exact-pinned, a future `npm install`
could silently move past the versions this stub's assumption depends on. A guard test
(`src/database/typeorm-version-assumptions.spec.ts`) asserts the installed majors still match
what was verified — fails loudly, by name, the moment that stops being true, instead of the
stub silently going stale.

**What we deliberately did NOT do:** set `transformIgnorePatterns: []` (transform all of
`node_modules` uniformly) as a blanket fix. Tested it — it doesn't solve failure mode B at all
(confirmed: identical error, just ~30s slower per run instead of ~1s) and pays a real
performance cost for nothing. Keep the targeted allowlist.

## Teaching requirement

This is a learning project. When introducing a NestJS concept for the first time
(decorator, lifecycle hook, guard, interceptor, custom provider), **explain what it does and
why it's used here**, and capture durable concepts in `ksp-backend/LEARNING/`.
Pair every component with tests — see the testing rule.
