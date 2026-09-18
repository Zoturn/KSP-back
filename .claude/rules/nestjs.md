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

## `@nestjs/*` packages that ship ESM — solved, but know why

Several `@nestjs/*` packages ship native ESM while the framework itself is still CommonJS:
`@nestjs/config@12`, `@nestjs/typeorm@12`, and `@nestjs/terminus@12` all declare
`"type": "module"` with peer ranges of `^11.0.0 || ^12.0.0` — deliberate dual-support
releases, not wrong-major mistakes. Expect more of them.

Under Jest this used to break every suite that imported them, and the workarounds were
substantial: a `transformIgnorePatterns` allowlist, a ts-jest `module: CommonJS` override,
and hand-written stubs for files using `import.meta` (which no transform can convert).

**All of that is deleted.** Jest 30 loads ESM natively via `require(esm)`, gated on two
conditions that must BOTH hold:

| Condition                       | Where it's pinned                                                          |
| ------------------------------- | -------------------------------------------------------------------------- |
| Node **>= 24.9**                | `engines` in `package.json`, plus `.nvmrc`                                 |
| **`--experimental-vm-modules`** | package.json's `"jest"` script, which every other test script delegates to |

The second is the non-obvious half and the reason this looks broken if you only do the first:
Jest tests `vm.SourceTextModule.prototype.hasAsyncGraph`, and **without the flag
`vm.SourceTextModule` is `undefined` entirely** — so the check reads false on Node 26 just as
it does on Node 22. Upgrading Node alone changes nothing.

**If `Must use import to load ES Module` ever comes back, check these in order:**

1. `node -v` — is it >= 24.9? nvm-windows switches a machine-wide symlink, so an `nvm use 22`
   for some unrelated project silently takes this repo's tests with it. `nvm use 24` restores
   it; `.nvmrc` records the intent.
2. Is the command going through `npm run test` / `test:e2e`? Invoking `npx jest` directly
   bypasses the flag and reproduces the old error exactly.

Only if both are satisfied is it a genuinely new problem. Do **not** reintroduce
`transformIgnorePatterns` or a stub as a reflex — that trades one line of config for a mock
that silently goes stale, which is what we just spent this effort removing.

**A note on how this was diagnosed, because the shortcut failed:** the error message names
`transformIgnorePatterns` as the fix, and for `@nestjs/config` it genuinely was. Following
that advice for `@nestjs/terminus` produced an allowlist entry that changed nothing, because
terminus's real blocker was three files using `import.meta` — a different failure with an
identical message. Reading the failing file beat trusting the error text.

## Teaching requirement

This is a learning project. When introducing a NestJS concept for the first time
(decorator, lifecycle hook, guard, interceptor, custom provider), **explain what it does and
why it's used here**, and capture durable concepts in `ksp-backend/LEARNING/`.
Pair every component with tests — see the testing rule.
