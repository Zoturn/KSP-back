# Tasks

> Build order is dependency-driven: shared primitives, then persistence, then the API surface,
> then the guards that stop it rotting. Every task ships its own tests — see `testing.md`.
> Read `LEARNING/02-nestjs-fundamentals.md` first if the DI vocabulary below is unfamiliar.

## 1. Shared building blocks

- [x] 1.1 Install `dataloader` and confirm `npm ls dataloader` reports a single version and
      `npm audit` reports 0 vulnerabilities. Verify `npm run build` is still clean with the
      dependency present but unwired.
      **`dataloader@2.2.3`**, single version, 0 vulnerabilities, build clean.
      **Gap in this task as written:** it listed only `dataloader`, but `PageInput`'s
      `@Min`/`@Max` need **`class-validator`** and the `ValidationPipe` needs
      **`class-transformer`** — neither was a declared dependency (both were present only as
      transitive deps of `@nestjs/common`, which is not something to rely on). Installed
      explicitly: `class-validator@0.15.1`, `class-transformer@0.5.1`, deduped, 0
      vulnerabilities.
- [x] 1.2 Create `src/common/graphql/page-input.ts` (`PageInput` with `page` and `limit`,
      `@Min(1)`, `@Max(100)`, sensible defaults) and `src/common/graphql/paginated.ts` (the
      `Paginated<T>()` factory from design Decision #4, memoised per type). Unit-test that the
      factory returns the **same class** when called twice with the same `T` — calling it twice
      unmemoised registers two types with one name and schema generation fails, which is the
      failure this test exists to catch.
      Done, 8 tests. The memoisation test asserts **identity** (`toBe`), not structural
      equality — two separately built classes would be structurally identical and the test
      would pass while the duplicate-type bug remained. `PageInput` is validated by running
      `class-validator` rather than by inspecting decorators, so the rules are proven to fire.
- [x] 1.3 Create `CommonModule` exporting a request-scoped `DataLoaderService` with no loaders
      yet (added in 5.1). Verify with a unit test that `module.get()` **throws** for it and
      `await module.resolve()` succeeds — that asymmetry is the practical face of `Scope.REQUEST`
      and will explain later test failures (`nestjs.md`, provider scope).
      Done, 4 tests. **One of them was initially passing for the wrong reason, and was
      rewritten.** The "is exported" test first imported `CommonModule` into the testing module
      and resolved the service directly — which passes with or without the `exports` line,
      because `TestingModule.get`/`resolve` are non-strict and search the whole container.
      Proved that by deleting `exports` and watching it stay green. It now goes through a real
      `Consumer` provider in a separate `ConsumerModule`, and re-verified the honest way:
      without `exports` it fails with `Nest can't resolve dependencies of the Consumer (?)`,
      the exact boot failure the line prevents.

## 2. Entities and the migration

- [ ] 2.1 Write `src/catalog/entities/{category,product,product-image}.entity.ts` exactly per
      design's schema table: UUID PKs via `@PrimaryGeneratedColumn('uuid')`, `citext` slugs,
      `price_cents integer` + `currency char(3)`, `timestamptz` via
      `@CreateDateColumn`/`@UpdateDateColumn`, self-referencing nullable `parent_id` on
      `Category` (adjacency list — **not** `@Tree`, see Decision #1). No `@ObjectType()` anywhere
      in these files. Verify `npm run build` compiles.
- [ ] 2.2 Generate the migration with `npm run migration:generate -- src/database/migrations/AddCatalogTables`
      (note the `--`; see README). **Read the generated SQL**, then hand-add what the differ
      omits: `CHECK (price_cents >= 0)`, the partial index
      `(created_at DESC, id DESC) WHERE is_published`, and FK indexes on `categories.parent_id`,
      `products.category_id`, `product_images.(product_id, position)`. Confirm the `ON DELETE`
      rules match design exactly — `RESTRICT`, `SET NULL`, `CASCADE` respectively.
- [ ] 2.3 Verification: `npm run migration:run`, then inspect the live schema with `psql` and
      confirm every constraint and index above actually exists (the point is to check the
      database, not the migration file). Then `npm run migration:revert` and confirm all three
      tables are gone, and re-run. A migration that cannot be reverted is found now, not later.

## 3. Models and mappers

- [ ] 3.1 Write `src/catalog/models/{category,product,product-image}.model.ts` — `@ObjectType()`
      classes with explicit type thunks (`@Field(() => Int)` for `priceCents`, `@Field(() => ID)`
      for ids). Include `categoryId` and `productId` as **plain properties with no `@Field()`**
      (Decision #6). Nullability per Decision #7: `Product.category` nullable, `Product.images`
      a non-nullable list.
- [ ] 3.2 Write `src/catalog/catalog.mapper.ts` as pure functions plus
      `catalog.mapper.spec.ts`. Test that the FK properties survive mapping — a mapper that drops
      `categoryId` makes every field resolver receive `undefined`, which presents as a loader bug
      and is the single most likely mistake in this change.

## 4. Service layer

- [ ] 4.1 Write `CatalogService` with **one private query builder that applies
      `is_published = true`** (Decision #2), used by every read. Implement
      `findProducts(page, filter)` returning items plus total, ordered by
      `(created_at DESC, id DESC)` (Decision #3), and `findProductById(id)`. Unit-test with a mocked repository via `getRepositoryToken`:
      assert the published predicate is applied on **both** paths, and that ordering includes the
      id tiebreaker.
- [ ] 4.2 Add `findCategoryTree()` and `findCategoryBySlug(slug)` to `CatalogService`, with unit
      tests covering a found and an unknown slug (the latter returns null, not a throw — the
      spec's absent-result scenario).

## 5. Resolvers and DataLoaders

- [ ] 5.1 Implement the three loaders in `DataLoaderService`:
      `productImagesByProductId`, `categoryById`, `categoryChildrenByParentId`. Unit-test each
      batch function directly for the two rules that corrupt data silently (Decision #5): output
      length and order must match the input keys, and a key with no row must map to `null`.
      Deliberately feed keys in a different order from what the database returns, and include a
      key that matches nothing — a naive `WHERE id IN (...)` implementation passes a happy-path
      test and fails both of these.
- [ ] 5.2 Write `ProductResolver`: `products` and `product` queries, plus `@ResolveField()` for
      `images` and `category`, **both going through loaders** — never the repository. Unit tests
      assert delegation and that each field resolver calls its loader (use `module.resolve()`,
      not `module.get()`; this resolver is request-scoped by bubbling).
- [ ] 5.3 Write `CategoryResolver`: `categories` and `category(slug)` queries plus a `children`
      field resolver through its loader. Same test shape as 5.2.
- [ ] 5.4 Wire `CatalogModule` (imports `TypeOrmModule.forFeature` + `CommonModule`; exports
      `CatalogService`) and register it in `AppModule`. Verify the app boots and
      `{ products(page:{limit:5}) { totalCount } }` answers in GraphiQL.

## 6. Contract and end-to-end behaviour

- [ ] 6.1 Regenerate and commit `schema.gql`; confirm `npm run schema:check` exits 0 and the
      existing `test/schema-drift.e2e-spec.ts` passes. Remember `src/schema.generate.ts` keeps a
      **hand-maintained `RESOLVERS` list** — add the two new resolvers to it, or `schema:check`
      will pass while the drift test fails (this is the blind spot task 6.1 of the previous
      change proved is real).
- [ ] 6.2 Write `test/catalog.e2e-spec.ts` covering the spec's scenarios against a real database:
      a default page; `limit` over the maximum rejected as a validation error; two consecutive
      pages neither repeating nor skipping a product (seed rows sharing a `created_at` to make
      the tiebreaker matter); a page past the end returning empty with a correct total;
      unpublished products absent from the list **and** unfetchable by id; an unknown id
      returning null with no error; images in position order; a product with no images returning
      `[]`. Assert `errors` is undefined on every success path.
- [ ] 6.3 Write the category e2e cases: the tree exposes top-level categories with reachable
      children, lookup by slug, unknown slug returns null. Include the spec's resilience scenario
      — one product whose category fails to resolve must not empty the list.
- [ ] 6.4 Write the **N+1 regression guard** (Decision #8) in `test/catalog-n-plus-one.e2e-spec.ts`:
      seed ~20 published products with images and categories, spy on the DataSource's `query`,
      request all of them with both relations, and assert a bounded query count. Comment the
      bound with what each query is for, so raising it later requires justifying the new one.
      Verify it genuinely guards by temporarily bypassing a loader and confirming it fails.

## 7. Verification and documentation

- [ ] 7.1 Full verification on a **fresh database**: destroy the volume, `up -d`,
      `migration:run`, then `npm test`, `npm run test:e2e`, `npm run schema:check`,
      `npm run lint`, `npm run build` — all clean. Confirm the e2e suites still pass with the
      Postgres container **stopped** for the hermetic specs, proving the DB-dependent ones are
      the only ones that need it.
- [ ] 7.2 Confirm every scenario in `specs/product-catalog/spec.md` maps to a passing test, the
      same audit as the previous change's task 6.3. Note any gap explicitly rather than assuming
      coverage.
- [ ] 7.3 Write `LEARNING/03-typeorm-and-dataloader.md` at the depth of the existing notes:
      entities vs models and why they are separate classes; how a migration is generated, read
      and corrected by hand; the N+1 problem demonstrated with real query counts before and
      after; DataLoader's batching and the two rules that silently corrupt data; and why loaders
      must be request-scoped. Update `CLAUDE.md`'s `Category` description, which still says
      closure-table (Decision #1).
