---
paths:
  - "ksp-backend/**/*.spec.ts"
  - "**/*.spec.ts"
  - "ksp-backend/test/**/*.ts"
  - "test/**/*.ts"
---

# Testing & explanation (ksp-backend)

**Every component ships with tests AND an explanation.** Nothing is "done" without both.

## Discipline: tests-alongside + explain
1. Implement the component.
2. **Immediately** write its tests — never batch them for later.
3. Explain what was built and why; capture durable concepts in `LEARNING/NN-topic.md`.

Deliberately not strict TDD — the goal is a teaching rhythm where code and test are read together.

## Tools & location
| Layer | Tool | Location |
|---|---|---|
| Unit | **Jest** | `*.spec.ts` **beside** the file under test |
| e2e | **Jest + Supertest** | `test/*.e2e-spec.ts` |

## Unit tests
- Test **services** in isolation. **Never touch a real database.**
- Mock repositories via the TypeORM token:
  `{ provide: getRepositoryToken(Product), useValue: mockRepo }`.
- Assert **business logic and edge cases**, not the ORM: "checkout snapshots the price",
  "throws NotFoundException for a missing id", "rejects quantity <= 0".
- **Request-scoped providers need `await module.resolve(X)`, not `module.get(X)`.**
  Anything injecting `DataLoaderService` becomes request-scoped by bubbling, so most resolvers
  do. `module.get()` throws *"X is marked as a scoped provider"* — this is the #1 confusing
  test failure in this project.
- Resolvers are thin: assert **delegation and that field resolvers use a loader**, not logic.
- Guards and `@CurrentUser()` get their own specs with a mocked `ExecutionContext` whose
  `getContext()` returns `{ req: { user } }`.

## e2e tests (GraphQL)
- Boot the real app, then POST queries to `/graphql` with Supertest via the `test/graphql.helper.ts` wrapper.
- **Apply the same global pipes/filters/interceptors as `main.ts`** — otherwise error codes
  differ and the tests lie.
- Dedicated test database; run migrations first, clean between tests.

### GraphQL changes how you assert failures — read this twice
**GraphQL returns HTTP 200 for essentially every outcome, including auth failures.**

- A test that only does `.expect(200)` **passes against a completely broken resolver.**
  Every success test MUST also assert `expect(res.body.errors).toBeUndefined()`.
- Auth boundaries are asserted on the error code, **never on an HTTP status**:
  ```ts
  // unauthenticated (the old 401)
  expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  // customer hitting an admin mutation (the old 403)
  expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
  ```
  Writing `.expect(401)` — the REST habit — **fails against a correctly working server.**
- Always test both boundaries for protected operations.

## Two tests unique to GraphQL — both required
**Schema drift guard** (replaces the old OpenAPI contract check). Fails if someone changed the
schema and forgot to commit the regenerated `schema.gql`, which would silently break
`ksp-frontend`'s codegen:
```ts
const { schema } = app.get(GraphQLSchemaHost);
expect(printSchema(lexicographicSortSchema(schema)).trim())
  .toBe((await readFile('schema.gql', 'utf8')).trim());
```

**N+1 regression guard.** The only thing stopping DataLoader from silently rotting — a new
field resolver that bypasses a loader breaks nothing visibly, then melts production:
```ts
const spy = jest.spyOn(dataSource.driver as any, 'query');
await gql(app, `query { products(page:{limit:20}) { items { images { url } category { name } } } }`);
expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
```

## Naming
`describe('ProductsService')` → `describe('checkout')` → `it('snapshots the unit price at
purchase time')`. Test names state **behavior**, never implementation.
