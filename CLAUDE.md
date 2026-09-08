# ksp-backend — NestJS GraphQL E-Commerce API

General info for this repo. Specific, enforceable conventions live in this repo's own
`.claude/rules/` (`nestjs.md`, `graphql.md`, `database.md`, `testing.md`, `docker.md`).
They are **path-scoped** — each loads automatically when matching files are read or edited.
This repo's `.claude/` also holds the OpenSpec skills and `/opsx:*` commands.

## Stack
- **NestJS 11** (TypeScript) — modular architecture, DI, decorators
- **GraphQL, code-first** — `@nestjs/graphql` 13.4.5 + `@nestjs/apollo` 13.4.5 +
  `@apollo/server` 5 + `@as-integrations/express5`, `graphql` pinned `^16.11.0`
- **TypeORM** + **PostgreSQL 16** (runs in Docker) — entities, migrations-only
- **JWT + Passport** — access/refresh tokens, RBAC (`customer`, `admin`)
- **Jest** (unit) + **Supertest** (e2e against `/graphql`)

> **Version constraint, not a preference:** NestJS 11 ships Express 5 and
> `@nestjs/apollo@13.2.0+` requires Apollo Server 5. Apollo Server 4 would pin us to
> `@nestjs/apollo@13.1.0` forever *and* mismatch Express. Also pin `graphql@^16.11.0` —
> `graphql@17` is `latest` on npm and is incompatible.

## The API is GraphQL-only
REST and Swagger were **dropped**. There is one endpoint: **`POST /graphql`**.
No `@ApiTags`, no `@ApiProperty`, no URI versioning, no HTTP status codes as an error channel.

The only surviving REST routes:
- `/api/health` — probes read status codes, and GraphQL always returns 200
- `/api/uploads/*` — binary transfer; the interesting logic stays in a mutation

**`schema.gql` is the cross-repo contract.** Generated from decorators, committed to git, and
consumed by `ksp-frontend`'s `graphql-codegen`. An e2e test fails if the committed file drifts.

## Domain
E-commerce catalog. First-iteration entities: `User`, `Address`, `Category` (closure-table
tree), `Product`, `ProductImage`, `Cart`, `CartItem`, `Order`, `OrderItem`.
Deferred: ProductVariant, Payment, Review, Coupon.

## Layout
```
schema.gql           # GENERATED + COMMITTED — the contract for ksp-frontend
src/
  main.ts            # bootstrap: /graphql at root, /api prefix for health & uploads only
  app.module.ts      # GraphQLModule.forRootAsync + global APP_* providers
  schema.generate.ts # standalone SDL emit (no database needed)
  config/            # env loading + validation (Joi)
  database/          # DatabaseModule, data-source.ts (CLI), migrations/
  common/            # guards, filters, decorators, plugins, dataloader/, graphql/, enums
  health/            # the only controller besides uploads
  auth/ users/ categories/ products/ cart/ orders/
    <feature>.resolver.ts   # NOT a controller
    <feature>.service.ts
    <feature>.mapper.ts     # entity -> model
    entities/  models/  inputs/
test/                # *.e2e-spec.ts (Supertest -> /graphql)
openspec/            # capability specs written before implementation
LEARNING/            # step-by-step teaching notes (Docker, GraphQL, NestJS)
```

## Key decisions (rationale in `.claude/rules/`)
- **Entity ≠ model.** TypeORM entities are never decorated `@ObjectType()`; a mapper converts.
  The schema is a published contract and must not move when the database refactors.
- **Every relation field resolver goes through a DataLoader.** A `@ResolveField` runs once per
  parent — 20 products with images and category is 41 queries without batching.
- **UUID primary keys** (`gen_random_uuid()`) — non-enumerable
- **Money as integer cents** (`price_cents`) + `currency char(3)` — never floats
- **Migrations only**, `synchronize: false` always — even in dev
- **Snapshots in orders** (name/price copied at purchase) vs **live refs in cart**
- **argon2id** password hashing
- Thin resolvers, fat services; `inputs/` and `models/` are the API contract

## Common commands
```bash
docker compose up -d          # start Postgres (+ pgAdmin)
docker compose down           # stop (data survives in the named volume)
npm run start:dev             # Nest in watch mode
npm run schema:generate       # regenerate schema.gql without booting Postgres
npm run schema:check          # fail if the committed schema.gql is stale
npm run test                  # Jest unit tests
npm run test:e2e              # Supertest e2e
npm run migration:generate    # diff entities -> migration (review the SQL!)
npm run migration:run         # apply pending migrations
```
GraphiQL: http://localhost:3000/graphql · Health: http://localhost:3000/api/health

## Spec-driven workflow (OpenSpec)
Each capability starts from a spec in `openspec/`. Project context and per-artifact rules live
in `openspec/config.yaml`.
```bash
npx @fission-ai/openspec new change "<name>"
npx @fission-ai/openspec status --change "<name>"
npx @fission-ai/openspec archive "<name>"
```

## Working agreement
Every component ships with **tests and an explanation**. See `.claude/rules/testing.md`.
