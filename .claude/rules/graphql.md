---
paths:
  - "ksp-backend/src/**/*.resolver.ts"
  - "src/**/*.resolver.ts"
  - "ksp-backend/src/**/models/**/*.ts"
  - "src/**/models/**/*.ts"
  - "ksp-backend/src/**/inputs/**/*.ts"
  - "src/**/inputs/**/*.ts"
  - "ksp-backend/src/**/*.model.ts"
  - "src/**/*.model.ts"
  - "ksp-backend/src/**/*.input.ts"
  - "src/**/*.input.ts"
  - "ksp-backend/src/common/graphql/**/*.ts"
  - "src/common/graphql/**/*.ts"
  - "ksp-backend/src/common/dataloader/**/*.ts"
  - "src/common/dataloader/**/*.ts"
  - "ksp-backend/src/main.ts"
  - "src/main.ts"
  - "ksp-backend/schema.gql"
  - "schema.gql"
---

# GraphQL conventions (ksp-backend)

**This API is GraphQL-only.** REST was dropped; there is no Swagger, no `@ApiTags`, no
`@ApiProperty`, no URI versioning, and no HTTP status codes as an error channel.
The only REST routes that survive are `/api/health` and `/api/uploads/*` (binary transfer).

`schema.gql` is the **cross-repo contract** — `ksp-frontend` generates its entire client from
it. Committed and kept current.

## Code-first: TypeScript is the source of truth
Never hand-write SDL. Decorated classes generate the schema via `autoSchemaFile`.

- `emitDecoratorMetadata` + `experimentalDecorators` are mandatory in `tsconfig.json`.
- **Always pass an explicit type thunk where TypeScript erases the type**:
  `@Field(() => Int)` (a bare `number` is ambiguous — `Int` or `Float`?),
  `@Field(() => [String])` (metadata says only `Array`), `@Field(() => ID)`.
- **Enums must be registered** with `registerEnumType(Role, { name: 'Role' })` or schema
  generation throws `Cannot determine a GraphQL output type`.
- `sortSchema: true` — without it `schema.gql` churns on every class reorder.

## The four type kinds
| Decorator | Purpose |
|---|---|
| `@ObjectType()` | data going **out** (`Product`, `User`) |
| `@InputType()` | data coming **in** (`CreateProductInput`) |
| `@ArgsType()` | a bag of flattened top-level args — use sparingly |
| `@Resolver()` | class owning root fields + field resolvers |

**Hard language rule:** an `@InputType()` can never be an output type and an `@ObjectType()`
can never be an argument. They are separate universes — hence separate `inputs/` and `models/`
folders.

## Entity ≠ model. Keep them separate.
**The TypeORM entity must NOT be decorated with `@ObjectType()`.** Most tutorials fuse them;
that is wrong here because:
1. The schema is a published cross-repo contract — a DB refactor must not become a breaking
   API change.
2. Derived/API-only fields (`inStock`, `primaryImageUrl`) have nowhere to live on a fused class.
3. Safety by construction beats safety by remembering not to add a decorator.
4. `Category`'s self-reference would advertise infinite recursion.

Map with a pure function in `<feature>.mapper.ts`.

**Critical subtlety:** the model must carry foreign keys as **plain, non-`@Field()`
properties** (e.g. `categoryId`). Field resolvers receive the model via `@Parent()` and need
the FK to call a loader. These are invisible in the schema but essential — get this wrong and
every field resolver receives `undefined`.

## DataLoader is mandatory for every relation field
A `@ResolveField()` runs **once per parent object**. Twenty products with `images` and
`category` = 41 queries. Nested category children multiply without bound.

**Every `@ResolveField()` that touches the database MUST go through a DataLoader.** Never call
a repository directly from a field resolver.

Two rules that cause silent data corruption when broken:
1. The batch function **must return an array of the same length as the keys, in the same
   order.** `WHERE id IN (...)` returns arbitrary order and omits misses — always re-map via
   a `Map` keyed by id.
2. Return **`null`** for a missing key — never `undefined`, never a shorter array.

Loaders are `@Injectable({ scope: Scope.REQUEST })`. This is a **correctness requirement, not
an optimisation** — a singleton loader caches across users, which is a data-leak bug. Note
that request scope **bubbles**: a resolver injecting a loader becomes request-scoped too, so
its unit tests need `module.resolve()`, not `module.get()`.

## Pagination: offset/limit
Use the shared `PageInput` (`page`, `limit` with `@Max(100)` — an unbounded `limit` is an
attack) and the `Paginated<T>()` factory returning `{ items, totalCount, hasNextPage, page,
limit }`. Relay cursor connections are deliberately not used; they teach Relay, not GraphQL.

## Nullability decides the blast radius of a failure
When a **non-nullable** field errors, null propagates **upward** to the nearest nullable
ancestor — potentially nulling the whole response. So:
- Relation fields resolved by field resolvers → **nullable** (one bad category shouldn't nuke
  the product list).
- Reserve `!` for things that genuinely cannot be absent (`id`, `name`).
- `@Field({ nullable: true })` and `@IsOptional()` must **always** be paired — the schema and
  the validator must agree.

## Validation
`class-validator` on `@InputType()` classes, with the global `ValidationPipe`.
- `transform: true` is **required** — nested inputs arrive as plain objects, so
  `@ValidateNested()` silently does nothing without it plus `@Type(() => Child)`.
- `forbidNonWhitelisted` is pointless here — GraphQL rejects unknown input fields during
  validation, before the pipe runs.
- **Mapped types come from `@nestjs/graphql`**, never `@nestjs/swagger` (which would silently
  drop GraphQL metadata).
- `null` vs omitted are different: `{ categoryId: null }` means unlink; omitting it means
  leave alone. Distinguish `'categoryId' in input` from `input.categoryId != null`.

## Errors: HTTP 200 always
Transport success and application outcome are separate. Failures go in the `errors` array
with a machine-readable `extensions.code`; `data` and `errors` legitimately coexist.

- Keep throwing Nest exceptions from services; the global filter translates them.
- In a GraphQL exception filter you **`return` the error — you never write to a response.**
  Returning nothing swallows it into a silent `null`.
- The filter must branch on `host.getType()` because it also sees the REST health route.
- Codes: `BAD_USER_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `INTERNAL_SERVER_ERROR`.
- `formatError` is also required — parse/validation/complexity errors never reach a filter.

## Auth
Guards work, but must be told where the request lives — `AuthGuard`'s
`switchToHttp().getRequest()` returns `undefined` under GraphQL. Override:
```ts
getRequest(ctx: ExecutionContext) {
  return GqlExecutionContext.create(ctx).getContext().req;
}
```
Declare `context: ({ req, res }) => ({ req, res })` explicitly even though it's the default —
it is the seam every guard and `@CurrentUser()` depends on.

**Authorize by type reachability, not by root field.** If `User` is reachable via
`Order.user`, any client who can reach an order can reach a user. Put `@Roles()` on sensitive
`@ResolveField()`s too. A global guard does **not** protect introspection — that must be
disabled by config.

## No versioning
GraphQL is not versioned. Evolve additively: adding a field or nullable argument is always
safe; mark removals with `@Field({ deprecationReason: '...' })` first. `/graphql` never gets
a version segment.

## Security (enforced in phase 10, designed for from the start)
Depth limiting (`n: 8`), complexity analysis, alias limiting (`n: 15`), `csrfPrevention: true`,
`allowBatchedHttpRequests: false`, introspection + GraphiQL off in production.

**Alias batching is the one that bites:** a client can alias `login` 1,000 times in a single
operation. Depth limiting can't see it and `@nestjs/throttler` counts one HTTP request — so
rate-limit **inside `AuthService`, keyed on email + IP**, not per request.
