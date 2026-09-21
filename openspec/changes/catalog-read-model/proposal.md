# Proposal

**Build-order phase: 4** (the first phase with a business domain; Phase 5 adds auth.)

## Why

The API currently serves one field, `apiStatus`, which proves the GraphQL layer is alive and
nothing else. `ksp-frontend` cannot be started against it because there is no product data to
render and no `schema.gql` worth generating a client from.

This change delivers the **browsable catalog** — the read half of an e-commerce storefront: list
products with paging, open one product, and navigate a category tree. That is the smallest slice
that makes the frontend buildable, and it is also where every genuinely hard idea in this stack
appears together for the first time: entity/model separation, the N+1 problem, tree modelling,
and money.

Doing it read-only is deliberate. Writes are the operations that need authorization, and
authorization arrives in Phase 5. Shipping unguarded mutations "temporarily" would mean
retrofitting guards onto an existing surface, which `graphql.md` identifies as exactly where
authorization mistakes happen, because reachability — not the root field — determines exposure.

## What Changes

- **Three entities, with migrations**: `Category` (self-referencing tree), `Product`,
  `ProductImage`. First real tables in the database; the only migration so far enabled
  extensions.
- **Three GraphQL object types and their mappers**: `CategoryModel`, `ProductModel`,
  `ProductImageModel`, each produced from its entity by a pure mapper function. Entities are
  never decorated with `@ObjectType()`.
- **Queries only**:
  - `products(page: PageInput, filter: ProductFilterInput)` → paginated list
  - `product(id: ID!)` → one product, nullable
  - `categories` → the category tree
  - `category(slug: String!)` → one category, nullable
- **Shared pagination contract**: a `PageInput` (`page`, `limit` with `@Max(100)`) and a
  `Paginated<T>()` generic object-type factory, both reusable by every later list query.
- **A DataLoader per relation**: `Product.images`, `Product.category`, `Category.children`,
  `Category.parent`. Request-scoped, mandatory — a field resolver that queries directly is a
  defect, not a slow path.
- **An N+1 regression test**, which is the only thing that stops the loaders silently rotting.
- `schema.gql` grows from one field to the full read surface, which is what makes the frontend's
  `graphql-codegen` meaningful.

No **BREAKING** changes: every addition is additive, and `apiStatus` stays.

## Non-goals

Explicitly out of scope, to keep this phase reviewable:

- **All mutations.** No create/update/delete for products or categories. Phase 5.
- **Authentication and authorization.** No `User`, no guards, no roles. Phase 5.
- **Cart and orders**, including `Cart`, `CartItem`, `Order`, `OrderItem`.
- **Search.** `filter` covers category and a published flag; full-text search is later.
- **Image upload.** `ProductImage` stores a URL. `/api/uploads/*` is a later phase.
- **Relay cursor connections.** Offset/limit is deliberate — see `graphql.md`.
- **`ProductVariant`, `Review`, `Coupon`, `Payment`** — already deferred in `CLAUDE.md`.

## Capabilities

### New Capabilities

- `product-catalog`: browsing published products and the category tree — paginated listing,
  single-product retrieval, category navigation, and the read-model guarantees that go with
  them (stable ordering, bounded page size, money expressed without loss).

### Modified Capabilities

None. The new queries are served by the endpoint `graphql-api` already specifies, and none of
its four requirements change: there is still exactly one endpoint, it is still introspectable in
development, `schema.gql` is still the published contract, and `apiStatus` still proves the
layer is live. This change adds fields to that surface rather than altering the rules governing
it, so no delta spec is warranted.

## Impact

**New code** under `src/catalog/` (per `nestjs.md`'s feature-module layout): module, two
resolvers, two services, mappers, `entities/`, `models/`, `inputs/`, plus `src/common/graphql/`
for the shared pagination types and `src/common/dataloader/` for the request-scoped loader
service.

**Database**: one migration creating `categories`, `products`, `product_images`, with FK indexes
(Postgres does not create them automatically — `database.md`), a `UNIQUE` slug per category, a
partial index for published products, and `CHECK (price_cents >= 0)`.

**Contract**: `schema.gql` changes substantially, which is the point — it is the artifact
`ksp-frontend` compiles against. The existing drift guard covers it.

**Dependencies**: adds `dataloader`. No framework version changes.

**Data-modelling rules**: no deviations. UUID primary keys via `gen_random_uuid()`, money as
`price_cents integer` + `currency char(3)`, `timestamptz` timestamps, migrations-only with
`synchronize: false`. One judgement call to settle in `design.md`: `CLAUDE.md` describes
`Category` as a **closure-table** tree, which TypeORM's `@Tree('closure-table')` implements by
managing a second table itself — worth re-examining against `database.md`'s migrations-only
rule before committing to it.
