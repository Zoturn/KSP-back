# Design

## Context

See `proposal.md` — Why. The database currently holds one migration (extensions only) and the
schema exposes one field. Everything here is the first of its kind in this codebase, so the
decisions below set patterns that Phases 5–6 will copy rather than revisit.

Binding constraints, already settled and not reopened here: UUID primary keys via
`gen_random_uuid()`, money as integer minor units, `timestamptz`, migrations-only with
`synchronize: false`, entities never decorated as GraphQL types, DataLoader mandatory for
relation field resolvers, offset/limit paging. See `database.md`, `graphql.md`, `nestjs.md`.

## Goals / Non-Goals

**Goals (design level)**

- Establish the feature-module shape every later domain module copies.
- Make the N+1 problem structurally hard to reintroduce, not merely documented.
- Keep the published/unpublished boundary in one place, so Phase 5 can add an admin view
  without auditing every query.

**Non-goals (design level)** — beyond `proposal.md`'s scope list:

- No caching layer. Correctness first; the N+1 guard is about query count, not latency.
- No database views or stored procedures.
- No seed/fixture framework. Tests create the rows they need.

## Decisions

### Decision 1: Adjacency list for the category tree — NOT a closure table

**This contradicts `CLAUDE.md`, which describes `Category` as a closure-table tree.** Flagging it
loudly rather than quietly changing it.

`Category` gets a self-referencing nullable `parent_id`. No second table, and no TypeORM
`@Tree('closure-table')`.

**Why:**

1. **Closure tables buy one thing: O(1) "all descendants at any depth".** Nothing in
   `product-catalog/spec.md` needs that. The tree requirement is "render navigation from the top
   level downward", which is level-by-level traversal — precisely what an adjacency list does
   best.
2. **`@Tree` does not compose with DataLoader.** Tree operations go through `TreeRepository`
   (`findTrees`, `findDescendants`), which issues its own queries per call. Our field resolvers
   must batch through a loader keyed on `parentId`, and an adjacency list makes
   `WHERE parent_id IN (...)` the natural batch query. Bolting a loader onto a `TreeRepository`
   means fighting both.
3. **TypeORM manages closure rows at runtime**, which sits awkwardly with a migrations-only rule
   that exists precisely so schema changes are reviewable. The closure table would be the one
   piece of the schema the ORM maintains behind our back.
4. **The thing we would lose is recoverable.** When "products in this category _and all its
   subcategories_" is needed — likely, in a later phase — Postgres answers it with a
   `WITH RECURSIVE` CTE. For a catalogue tree that is realistically 2–4 levels deep, that is fast
   and adds no write-path complexity.

**Alternative considered — materialised path** (`path text` like `/electronics/audio/`): makes
descendant queries a `LIKE 'prefix%'` index scan and is genuinely elegant for reads, but every
node move rewrites a subtree, and it invites string parsing in application code. Rejected as
premature for a read-only phase.

**Trade-off accepted:** a deep tree would cost one batched query per level. With a shallow
catalogue that is a handful of queries, and each level is still batched, so cost grows with
_depth_ rather than with _node count_ — which is the property that matters.

### Decision 2: `is_published boolean` as the visibility flag, enforced in the service layer

The spec is unusually strict here: an unpublished product must be unreachable _even by direct
id lookup_, and must not reveal its own existence.

Rather than remembering `WHERE is_published = true` at each call site, **every read path goes
through a single private query builder in `CatalogService` that applies the predicate**. A direct
`repository.findOne({ where: { id } })` anywhere in the catalogue module is a review failure.

Phase 5's admin view then becomes an explicit, auditable second path rather than the removal of a
filter someone forgot to add.

`published_at timestamptz` was considered and rejected for now: it implies scheduled publishing,
which nothing asks for, and "published" would become `published_at <= now()`, a predicate that
is easy to get subtly wrong and awkward to index.

### Decision 3: Deterministic ordering with an id tiebreaker

`spec.md` requires that consecutive pages neither repeat nor skip a product. Offset paging gives
that guarantee **only if the sort is total**. `ORDER BY created_at DESC` is not total — rows
sharing a timestamp may order arbitrarily between queries, so a row can appear on both pages.

Every paginated query therefore sorts by `(created_at DESC, id DESC)`. The id is unique, so the
order is total and stable. This is cheap to get right now and produces a flaky, hard-to-diagnose
bug if skipped.

### Decision 4: `Paginated<T>()` as a generic object-type factory

GraphQL has no generics, so a paginated wrapper per type would be copy-paste. `@nestjs/graphql`'s
answer is a function returning a class decorated `@ObjectType({ isAbstract: true })`, which the
schema builder materialises per instantiation (`ProductPage`, and later `OrderPage`).

The **NestJS/GraphQL concepts this introduces** — worth understanding before writing it:
`isAbstract: true` means "do not emit this class itself as a schema type"; the returned subclass
is what gets emitted. Memoising the factory per type matters, because calling it twice for the
same `T` would register two types with the same name and schema generation fails.

`PageInput` carries `page` and `limit` with `@Max(100)` — an unbounded `limit` is a denial-of-
service vector (`graphql.md`), and `@Max` is what makes the spec's "page size is bounded"
scenario a 400-level validation failure rather than a slow query.

### Decision 5: One request-scoped `DataLoaderService`, loaders created per request

A single `@Injectable({ scope: Scope.REQUEST })` provider exposes one loader per relation:
`productImagesByProductId`, `categoryById`, `categoryChildrenByParentId`.

**Request scope is a correctness requirement, not a performance tuning knob.** A singleton loader
caches across users and requests; in Phase 5, when a product's visibility can depend on the
caller, that is a data-leak bug. Establishing request scope now means the later change is safe by
construction.

Two batch-function rules that cause silent data corruption when broken, restated because they are
the easiest thing to get wrong: the function must return an array **the same length as the keys,
in the same order** (`WHERE id IN (...)` returns neither), and a missing key must map to `null`,
never `undefined` or a shorter array.

**Consequence to expect:** request scope **bubbles**. Any resolver injecting this service becomes
request-scoped, and its unit tests need `await module.resolve()` rather than `module.get()`. This
will be the first place in the project that bites.

### Decision 6: Models carry foreign keys as non-`@Field` properties

`ProductModel` has `categoryId: string` **without** `@Field()`. A field resolver receives the
model via `@Parent()`, and needs the FK to call a loader. Omit it and every field resolver gets
`undefined` — a failure that looks like a loader bug and is not.

The mapper is a pure function in `catalog.mapper.ts`: entity in, model out, no I/O, trivially
unit-testable without a database.

### Decision 7: Relation fields are nullable; the list is not

`Product.category` is `@Field(() => CategoryModel, { nullable: true })`. `spec.md` requires that
one unresolvable category not empty the whole response — and under GraphQL's null-propagation
rules, an error in a **non-nullable** field propagates up to the nearest nullable ancestor,
which for a product list means nulling the entire list.

`Product.images` is a non-nullable list of non-nullable items (`[ProductImage!]!`): "no images" is
an empty array, not null, which is what the spec's empty-collection scenario requires.

### Decision 8: The N+1 guard is a test, not a convention

A new field resolver that bypasses its loader changes nothing observable — the response is
identical and the tests pass. It is invisible until production. So an e2e test spies on the
DataSource's `query` and asserts a bounded count for a full page of products with images and
categories.

This directly encodes `spec.md`'s "read cost does not grow with the number of results", which is
why that requirement is written in terms of query count: it is the only externally checkable form
of the property.

## Module dependency impact

```
AppModule
  └── CatalogModule                     (new)
        ├── imports: TypeOrmModule.forFeature([Category, Product, ProductImage])
        │            CommonModule       (new — provides DataLoaderService)
        ├── providers: CatalogService, ProductResolver, CategoryResolver
        └── exports:   CatalogService   (Phase 6's cart/orders will need product lookups)
```

`CommonModule` exports `DataLoaderService`. Per `nestjs.md`, a provider is injectable outside its
module **only if exported** — the single most common DI error, and both new modules depend on
getting it right. `ConfigModule` and the TypeORM connection need no import: both are global.

## Schema changes and migration intent

One migration. Columns, types and constraints:

**`categories`**

| Column       | Type          | Constraints                                              |
| ------------ | ------------- | -------------------------------------------------------- |
| `id`         | `uuid`        | PK, `DEFAULT gen_random_uuid()`                          |
| `name`       | `text`        | `NOT NULL`                                               |
| `slug`       | `citext`      | `NOT NULL`, `UNIQUE` — case-insensitive, it is a URL key |
| `parent_id`  | `uuid`        | `NULL`, FK → `categories(id)` `ON DELETE RESTRICT`       |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()`                                 |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`                                 |

`ON DELETE RESTRICT` on `parent_id`: deleting a category with children would orphan a subtree
silently. Index on `parent_id` — Postgres does **not** index foreign keys automatically, and this
one is the category-children loader's batch predicate, so it is on the hot path.

**`products`**

| Column         | Type          | Constraints                                        |
| -------------- | ------------- | -------------------------------------------------- |
| `id`           | `uuid`        | PK, `DEFAULT gen_random_uuid()`                    |
| `name`         | `text`        | `NOT NULL`                                         |
| `slug`         | `citext`      | `NOT NULL`, `UNIQUE`                               |
| `description`  | `text`        | `NULL`                                             |
| `price_cents`  | `integer`     | `NOT NULL`, `CHECK (price_cents >= 0)`             |
| `currency`     | `char(3)`     | `NOT NULL`                                         |
| `is_published` | `boolean`     | `NOT NULL DEFAULT false`                           |
| `category_id`  | `uuid`        | `NULL`, FK → `categories(id)` `ON DELETE SET NULL` |
| `created_at`   | `timestamptz` | `NOT NULL DEFAULT now()`                           |
| `updated_at`   | `timestamptz` | `NOT NULL DEFAULT now()`                           |

`category_id` is nullable with `ON DELETE SET NULL`: removing a category should not delete the
products in it. That is also why `Product.category` is nullable in the schema — the database
permits absence, so the contract must admit it.

Indexes: `category_id` (FK, and the list filter); and a **partial** index
`(created_at DESC, id DESC) WHERE is_published` — partial because every catalogue query carries
that predicate, so the index stays small and matches the sort from Decision 3 exactly.

**`product_images`**

| Column       | Type          | Constraints                                         |
| ------------ | ------------- | --------------------------------------------------- |
| `id`         | `uuid`        | PK, `DEFAULT gen_random_uuid()`                     |
| `product_id` | `uuid`        | `NOT NULL`, FK → `products(id)` `ON DELETE CASCADE` |
| `url`        | `text`        | `NOT NULL`                                          |
| `alt`        | `text`        | `NULL`                                              |
| `position`   | `smallint`    | `NOT NULL DEFAULT 0`                                |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()`                            |

`ON DELETE CASCADE` here and nowhere else in this migration: an image has no meaning without its
product, which is the genuine ownership case `database.md` reserves cascade for. Index on
`(product_id, position)` — it serves both the loader's batch lookup and the spec's defined
ordering.

**Migration authoring note:** `migration:generate` diffs entities against the live database, so it
will produce the tables — but the differ routinely omits `CHECK` constraints and partial indexes.
Those must be added by hand, and the generated SQL read before it is run. This is the first
migration where that actually matters.

## Risks / Trade-offs

- **Deep category trees cost one query per level** → Accepted (Decision 1). Each level is batched,
  so cost scales with depth, not node count. If a deep tree ever appears, a `WITH RECURSIVE` CTE
  replaces the per-level walk without a schema change.
- **Offset paging degrades on large offsets** (Postgres still scans and discards) → Accepted:
  bounded by `@Max(100)` and a catalogue that will not reach the depth where it hurts. Keyset
  paging is the escape hatch, and the id tiebreaker from Decision 3 is exactly what it needs.
- **Request-scoped providers instantiate per request** → Real cost, unavoidable: the alternative
  is a cache shared between users, which is a correctness bug.
- **The N+1 guard asserts a magic number** → It will need updating when a legitimate query is
  added, and someone may raise the bound instead of investigating. Mitigation: the assertion
  carries a comment saying that raising it requires justifying the extra query.
- **`citext` needs the extension** → Already installed by the `AddExtensions` migration; the
  version-pinning risk is covered there.

## Migration Plan

Additive only — new tables, no changes to existing ones, so no backfill and no downtime concern.

1. Write entities.
2. `migration:generate`, then **read the SQL** and hand-add the `CHECK` and partial index.
3. `migration:run` against the local database.
4. Roll back by `migration:revert` (drops the three tables). Safe while the tables hold no
   production data, which is the whole of this phase.

## Open Questions

- **Currency**: `char(3)` is fixed per product. Whether the shop is ever multi-currency changes
  nothing structurally here (the column already carries it per row) and can be answered when
  pricing rules exist.
- **Image storage**: `url text` assumes images live elsewhere. The `/api/uploads/*` phase decides
  whether that becomes a storage key instead. It does not affect this phase's contract.
