---
paths:
  - "ksp-backend/src/**/*.ts"
  - "src/**/*.ts"
  - "ksp-backend/nest-cli.json"
  - "nest-cli.json"
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
request-scoped provider becomes request-scoped itself, and so does anything injecting *that*.
Consequence for tests: `module.get()` throws for request-scoped providers — use
`await module.resolve()` instead.

## Mapped types
`PartialType` / `PickType` / `OmitType` must be imported from **`@nestjs/graphql`**.
Importing them from `@nestjs/swagger` or `@nestjs/mapped-types` silently drops GraphQL
metadata and produces a broken schema.

## Async config
Modules needing config use the `forRootAsync`/`registerAsync` + `useFactory` +
`inject: [ConfigService]` pattern, never top-level `process.env` reads.

## Teaching requirement
This is a learning project. When introducing a NestJS concept for the first time
(decorator, lifecycle hook, guard, interceptor, custom provider), **explain what it does and
why it's used here**, and capture durable concepts in `ksp-backend/LEARNING/`.
Pair every component with tests — see the testing rule.
