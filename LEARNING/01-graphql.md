# 01 — GraphQL, from zero (and why we dropped REST)

> You know roughly what a REST API is. This note explains what GraphQL is, what problem it
> actually solves, how NestJS builds one from TypeScript decorators, and the traps that catch
> everyone. Read §1–§4 before writing any code; come back to §5–§9 as you hit them.

---

## 1. The problem GraphQL solves

Imagine the product grid on our shop. Each card needs: product name, price, one thumbnail, and
the category name for a breadcrumb.

With a REST API you have three options, and all three are bad:

1. **Make several calls.** `GET /products` → then `GET /products/:id/images` twenty times →
   then `GET /categories/:id` twenty times. That's 41 HTTP round trips to draw one screen.
2. **Eager-load everything.** Make `/products` always return images and category. Now the
   checkout page — which needs only names and prices — downloads every image record too.
   This is **over-fetching**.
3. **Invent query parameters.** `GET /products?include=images,category`. Ad-hoc, untyped,
   and it reinvents a query language badly.

The underlying issue: **the server decides the response shape, but the client knows what it
needs.** Every REST endpoint is a fixed guess about what some screen wants, and no guess fits
every screen.

**GraphQL inverts this.** There is one endpoint. The client sends a *query* describing exactly
the fields it wants, nested exactly how it wants them, and gets back precisely that shape:

```graphql
query ProductGrid {
  products(page: { limit: 20 }) {
    totalCount
    items {
      name
      priceCents
      images(first: 1) { url }     # the thumbnail
      category { name }            # the breadcrumb
    }
  }
}
```

One round trip. No over-fetching. Add a field to the card? Add a line to the query — **no
backend change at all**. That last property is the real payoff, and it's why we switched.

The trade: the client now controls how much work the server does. §6 and §9 are about putting
guard rails on that.

---

## 2. The mental model

| What you knew in REST | What replaces it in GraphQL |
|---|---|
| Many URLs (`/products`, `/products/:id`) | **One** URL: `POST /graphql` |
| HTTP verb picks the operation | `query` (read) or `mutation` (write) |
| `ProductsController` | `ProductsResolver` |
| `@Get()` handler | `@Query()` method |
| `@Post()` / `@Patch()` / `@Delete()` | `@Mutation()` method |
| `@Param()`, `@Query()`, `@Body()` | one decorator: `@Args()` |
| `CreateProductDto` | `@InputType() CreateProductInput` |
| `ProductResponseDto` | `@ObjectType() Product` |
| `GET /products/:id/images` | a **field resolver** on `Product` |
| `openapi.json` | `schema.gql` |
| HTTP status codes | `errors[].extensions.code` |
| `/api/v1` versioning | no versioning — evolve additively |
| Swagger UI at `/api/docs` | GraphiQL at `/graphql` |

Three things follow that surprise people:

- **Every request is a `POST`,** even reads. The query is in the request body.
- **Every response is `200 OK`,** including failures (§7).
- **There is no versioning.** Because clients name the fields they use, you add fields freely;
  nobody breaks. You only break someone by *removing* a field.

### The schema is the contract

GraphQL is strongly typed. The server publishes a **schema** describing every type and field.
That file (`schema.gql`) is committed to git and is exactly what `ksp-frontend` reads to
generate its typed client. Change the schema without committing it and the frontend generates
against a stale contract — which is why we have a test that fails on drift.

---

## 3. Code-first: TypeScript generates the schema

There are two ways to build a GraphQL server:

- **Schema-first** — hand-write the schema in GraphQL's own language (SDL), then generate
  TypeScript types from it. Two artifacts to keep in sync.
- **Code-first** — write TypeScript classes with decorators; the schema is *generated* from
  them. **One source of truth.** This is what we use.

We chose code-first because you're already learning NestJS decorators, and because a typo in a
field becomes a TypeScript error instead of a runtime surprise.

### The four decorators that matter

```ts
@ObjectType()   // data going OUT   — Product, User, Order
@InputType()    // data coming IN   — CreateProductInput
@ArgsType()     // a bag of loose arguments (we rarely use it)
@Resolver()     // the class that owns fields
```

**A hard rule of the GraphQL language that catches everyone:** an `@InputType` can *never* be
used as an output, and an `@ObjectType` can *never* be used as an argument. They are separate
universes. You cannot accept a `Product` as an argument — you accept a `CreateProductInput`.

That's exactly why our folders are `models/` (output) and `inputs/` (input), not one `dto/`.

### Why you must write `() => Int`

```ts
@Field(() => Int) priceCents: number;      // ✅
@Field() priceCents: number;               // ❌ ambiguous
```

TypeScript's types are erased at runtime. All the decorator can see is `Number` — and GraphQL
needs to know whether that's an `Int` or a `Float`. Same for arrays: metadata only says
`Array`, so you must write `@Field(() => [String])`.

The arrow-function form (a "thunk") exists so classes can reference each other before they're
defined.

### Enums need registering

```ts
export enum Role { CUSTOMER = 'customer', ADMIN = 'admin' }
registerEnumType(Role, { name: 'Role' });
```

Skip that line and schema generation dies with `Cannot determine a GraphQL output type for
Role`. Reflection cannot discover a TypeScript enum on its own.

---

## 4. Resolvers and field resolvers

A **resolver** is the GraphQL equivalent of a controller: a class holding the functions that
produce data.

```ts
@Resolver(() => ProductModel)
export class ProductsResolver {
  @Query(() => ProductPage, { name: 'products' })
  findAll(@Args('page', { nullable: true }) page?: PageInput) {
    return this.productsService.findAll(page);      // thin: delegate to the service
  }
}
```

### Field resolvers — the concept with no REST equivalent

This is the idea to slow down on.

A **field resolver** teaches GraphQL how to produce *one field* of *one type*, given its
parent object:

```ts
@ResolveField(() => [ProductImageModel], { nullable: true })
images(@Parent() product: ProductModel) {
  return this.loaders.imagesByProductId.load(product.id);
}
```

`@Parent()` is the product this field belongs to. The client never calls this directly —
**GraphQL calls it automatically, once per `Product` in the response**, but only if the query
actually selected `images`.

That is the magic *and* the danger. Read that sentence again: **once per product.** Twenty
products means twenty calls. §5 is entirely about that.

**Why the model carries hidden foreign keys.** Our `ProductModel` has a `categoryId` property
with *no* `@Field()` decorator. It's invisible in the schema, but the field resolver needs it
to look the category up. Forget to carry FKs through the mapper and every field resolver gets
`undefined` — a genuinely confusing bug.

### Why entities and models are separate classes

Most tutorials stack `@Entity()` and `@ObjectType()` on one class. We deliberately don't:

1. **The schema is a published contract.** If entity == schema, renaming a database column
   silently becomes a breaking API change that regenerates a broken frontend client.
2. **API-only fields have nowhere to live** — `inStock`, `primaryImageUrl` aren't columns.
3. **Safety by construction.** `passwordHash` can't leak from a class that doesn't have it —
   stronger than "we remembered not to add a decorator".
4. **`Category` points at itself**, so a fused class advertises infinite recursion.

The cost is a small pure mapper function per feature. Worth it.

---

## 5. The N+1 problem — the one that kills GraphQL APIs

### Watch it happen

```graphql
query { products(page: { limit: 20 }) { items { name images { url } category { name } } } }
```

1. The root resolver runs **once** → `SELECT * FROM products LIMIT 20`
2. GraphQL now holds 20 products and must resolve `images` → your field resolver runs **20 times**
3. Same for `category` → **20 more**

```sql
SELECT * FROM products LIMIT 20;                            -- 1
SELECT * FROM product_images WHERE product_id = 'aaa';      -- 2
SELECT * FROM product_images WHERE product_id = 'bbb';      -- 3
...                                                          -- 41
```

**41 queries for one request.** That's `1 + N + N` — hence *N+1*. And notice you fetch the
category "Laptops" fifteen separate times.

Now the nasty version, which any frontend developer can write innocently:

```graphql
query { categories { children { products { images { url } } } } }
```

10 categories × 5 children × 20 products = **thousands of queries from one request.**
Nobody attacked you. This is why §9 calls N+1 a *security* problem, not just a slow one.

### Why the obvious fixes fail

- *"Just eager-load with `relations: ['images']`."* Then you pay for images on **every**
  query, including ones that didn't ask — you've recreated REST's over-fetching. And it can't
  help nested paths like `Category.children.products`.
- *"Use a JOIN."* A join can't know what the client selected, and multiplies rows for
  one-to-many relations.

### DataLoader

DataLoader fixes it with two mechanisms:

- **Batching** — `.load(id)` doesn't query. It records the key and returns a promise. At the
  end of the current event-loop tick it calls your batch function **once** with all 20 keys,
  and you run a single `WHERE id IN (...)`.
- **Per-request caching** — loading the same key twice returns the same promise. Those fifteen
  "Laptops" lookups collapse into one.

**41 queries → 3.**

### Two rules you cannot break

**Rule 1 — return an array of the same length as the keys, in the same order.**
DataLoader matches results to callers *by position*. `WHERE id IN (...)` returns rows in
arbitrary order and silently omits missing ones. Return them raw and every product gets the
wrong category — **wrong data, no error**. Always re-map through a `Map`:

```ts
const rows = await repo.findBy({ id: In([...ids]) });
const byId = new Map(rows.map(r => [r.id, r]));
return ids.map(id => byId.get(id) ?? null);   // re-ordered, same length
```

**Rule 2 — return `null` for a missing key.** Never `undefined`, never a shorter array.

### Why loaders must be request-scoped

```ts
@Injectable({ scope: Scope.REQUEST })
export class DataLoaderService { ... }
```

**This is correctness, not optimisation.** DataLoader caches. A singleton would cache
`user:123` forever, so the next request gets stale data — and across different users that's a
data-leak bug. The loader must be born and die with the request.

Two consequences:

1. **Scope bubbles.** A resolver injecting a request-scoped provider becomes request-scoped
   itself, and so does anything injecting *that*.
2. **Tests change.** `module.get(ProductsResolver)` **throws** for a scoped provider — use
   `await module.resolve(ProductsResolver)`. This is the single most confusing test failure
   you'll hit.

### Do this once, by hand

In Phase 6, turn on TypeORM query logging, run the nested category query, and count the
queries. Then add the loader and count again. Watching 41 become 3 will teach you more than
this section did.

---

## 6. Errors: everything is HTTP 200

A single GraphQL request resolves dozens of fields through independent code paths. Some
succeed, some fail. **No single status code can describe that**, so GraphQL doesn't try:

- **HTTP status** = "did the transport work?" → almost always 200
- **`errors` array** = "what went wrong in the application?"

```jsonc
{
  "data":   { "products": { "items": [ { "id": "1", "category": null } ] } },
  "errors": [ { "message": "Category not found",
                "path": ["products","items",0,"category"],
                "extensions": { "code": "NOT_FOUND" } } ]
}
```

`data` and `errors` **coexist**. Partial success is normal, not exceptional.

**The testing consequence is severe:** a test asserting only `.expect(200)` **passes against a
completely broken resolver.** Every success test must also assert
`expect(res.body.errors).toBeUndefined()`. And auth failures are asserted as
`errors[0].extensions.code === 'UNAUTHENTICATED'` — writing `.expect(401)` out of REST habit
*fails against a correctly working server*.

### Null propagation — the non-obvious part

If a resolver for a **non-nullable** field (`Category!`) throws, GraphQL can't put `null`
there without violating its own schema. So the null **propagates upward** to the nearest
nullable ancestor. If every ancestor is non-null, **the whole response becomes `null`.**

So nullability is a blast-radius decision:

- `Product.category: Category!` → one missing category **nukes the entire product list**
- `Product.category: Category` → that one product shows `category: null`, everything else renders

**Rule: relation fields resolved by field resolvers should be nullable.** Reserve `!` for
things that genuinely cannot be absent (`id`, `name`).

---

## 7. Auth without routes

Passport's `AuthGuard` finds the request via `context.switchToHttp().getRequest()`.
**Under GraphQL that returns `undefined`** — there's no per-operation HTTP route, just one
`POST /graphql`.

The entire fix is teaching the guard where the request lives:

```ts
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext().req;   // ← the whole trick
  }
}
```

That works because the GraphQL module declares what the context contains:

```ts
context: ({ req, res }) => ({ req, res }),
```

### The authorization mindset shift

In REST, `GET /admin/users` had one entry point and one guard. In GraphQL, **any type
reachable through the graph is exposed by every path that reaches it.** If `User` is reachable
via `Order.user`, then anyone who can read an order can read a user — no matter what guard sits
on `Query.users`.

**Audit by type reachability, not by root field.** Put `@Roles()` on sensitive
`@ResolveField()`s too.

Also: a global guard does **not** protect introspection. `__schema` is resolved by graphql-js
internals, so no guard ever runs — it must be disabled by config.

---

## 8. Pagination

We use plain offset/limit (`page`, `limit`), not Relay cursor connections. Relay's
`edges`/`node`/`cursor` ceremony teaches you *Relay*, not GraphQL, and our catalog will never
be big enough to need keyset pagination. `limit` is hard-capped at 100 — an uncapped list
argument is an attack.

Code-first generics need a factory, since a decorator can't be applied to a type parameter:

```ts
@ObjectType()
export class ProductPage extends Paginated(ProductModel) {}
```

---

## 9. Security: the client now controls the cost

REST protected you implicitly — each endpoint had a fixed, bounded shape. In GraphQL the
client composes the query, so **request cost is attacker-controlled.** Everything below follows
from that.

| Threat | Why it works | Defence |
|---|---|---|
| **Deep nesting** | `Category` is self-referencing, so nesting is free to write and exponential to serve | depth limit (~8) |
| **Huge lists** | `products(limit: 1000) { images { url } }` is only depth 3 | complexity analysis + `@Max(100)` |
| **Alias batching** | one operation can alias `login` 1,000 times — depth limits can't see it, and the throttler counts **one** HTTP request | alias limit (~15) **and** rate-limit inside `AuthService` keyed on email + IP |
| **Introspection** | hands attackers your full schema | off in production |
| **N+1** | small query → thousands of DB round trips | DataLoader (a *security* control) |
| **Error leakage** | stack traces expose table and column names | `formatError` redaction in production |

**Alias batching deserves special attention** — it's the classic GraphQL credential-stuffing
bypass. A "5 logins per minute" throttle permits 5,000 password guesses per minute, because
they all arrive in one HTTP request. The only correct fix is counting attempts at the
*business* layer.

---

## Recap

- **One endpoint**, client picks the fields. No versioning, no over-fetching.
- **Code-first**: decorators generate `schema.gql`, which is the contract the frontend compiles against.
- `@ObjectType` (out) and `@InputType` (in) are **separate universes** — hence `models/` and `inputs/`.
- **Field resolvers run once per parent object.** Always batch them with **DataLoader**,
  request-scoped, honouring the length-and-order rule.
- **Everything returns 200.** Failures live in `errors[].extensions.code`; tests must assert on it.
- **Non-nullable fields that fail null their parent** — keep resolved relations nullable.
- **Authorize by type reachability**, not by root field.
- The client controls the cost — depth, complexity, and alias limits are not optional.
