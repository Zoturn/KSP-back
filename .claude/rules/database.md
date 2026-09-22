---
paths:
  - 'ksp-backend/src/**/entities/**/*.ts'
  - 'src/**/entities/**/*.ts'
  - 'ksp-backend/src/**/*.entity.ts'
  - 'src/**/*.entity.ts'
  - 'ksp-backend/src/database/**/*.ts'
  - 'src/database/**/*.ts'
  - 'ksp-backend/src/database/migrations/**/*.ts'
  - 'src/database/migrations/**/*.ts'
---

# Database, entities & migrations (ksp-backend)

## Migrations only — `synchronize` is forbidden

`synchronize: true` is banned **even in development**: it silently alters/drops schema and
leaves no reviewable history.

Workflow: edit entities → `npm run migration:generate` → **read the generated SQL** →
`npm run migration:run`.

- **Always read the generated SQL.** It is how you learn what your decorators actually do.
  Contrary to folklore, the differ does emit `CHECK` constraints and partial indexes **when
  the entity declares them** via `@Check(...)` and `@Index(name, cols, { where })` — verified
  in the Phase 4 catalogue migration, where nothing needed hand-adding. What it will not do is
  invent a constraint you never declared, so the reading is still mandatory: the failure mode
  is a missing decorator, not a lossy differ.
- Commit every migration. **Never edit a migration that has already run** — write a new one forward.
- Extensions are created in the first migration:
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;` and `citext`.

## The ORM will create extensions behind your back — stop it

TypeORM's Postgres driver runs `CREATE EXTENSION IF NOT EXISTS ...` **itself, on connect**, for
every extension your entities imply — pgcrypto or uuid-ossp for uuid columns, citext for citext
ones. It is not gated by `synchronize`. That is DDL performed outside a migration, which defeats
the point of the rule above: the extension exists because something connected, not because a
reviewed migration created it.

**Two settings are needed, and getting only the first is the easy mistake:**

| Setting                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `uuidExtension: 'pgcrypto'` | Changes **which** extension backs `@PrimaryGeneratedColumn('uuid')` |
| `installExtensions: false`  | Stops the driver creating **any** extension on connect              |

`uuidExtension` alone only redirects the DDL — it does not prevent it. Without the second
setting the driver still issues `CREATE EXTENSION` on every boot, which is the behaviour the
whole rule exists to stop.

The default is uuid-ossp, whose function is `uuid_generate_v4()`, while `AddExtensions` installs
**pgcrypto** (`gen_random_uuid()`). Leaving the default therefore produces migrations depending
on an extension no migration creates — fine on any database the ORM has already touched, and a
hard failure on a genuinely fresh one.

**Both settings live once, in `src/database/postgres-policy.ts`**, spread into both connections
(`data-source.ts` for the CLI, `database.module.ts` for the app). They must never disagree, so
they are not written twice.

Two tests guard this, and neither is optional: `src/database/migrations.spec.ts` asserts no
migration reaches for `uuid_generate_v4()`, and `src/database/entity-conventions.spec.ts`
asserts the column rules below hold across every entity. After changing anything about uuid or
citext columns, also check the live extension list rather than assuming:

```sql
SELECT extname FROM pg_extension;
```

Caught in the Phase 4 catalogue migration — twice: first the wrong function, then the DDL that
the first fix did not actually stop.

## Column conventions

| Concern      | Rule                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary key  | `uuid` via `@PrimaryGeneratedColumn('uuid')`. Never mix PK types across tables.                                                                |
| Timestamps   | `timestamptz` always (`@CreateDateColumn`/`@UpdateDateColumn`). Never bare `timestamp`.                                                        |
| Email        | `citext` — case-insensitive uniqueness without lowercasing everywhere.                                                                         |
| **Money**    | Integer minor units: `price_cents integer` + `currency char(3)`. **Never float/double.** `CHECK (>= 0)`. Format only at the presentation edge. |
| Enums        | `text` + `CHECK (col IN (...))` rather than native PG enums — cheap to evolve.                                                                 |
| Postal codes | `text`, never numeric (leading zeros).                                                                                                         |

## The two "cascades" — do not confuse them

- **DB-level** `onDelete: 'CASCADE'` — a real FK constraint enforced by Postgres. Use for true
  ownership (cart → items, product → images).
- **ORM-level** `cascade: true` — tells TypeORM to auto-persist relations on `save()`. A
  persistence convenience, _not_ a constraint. Use narrowly and deliberately (e.g. `['insert']`).

Policy: ownership → `CASCADE`; `orders.user_id` → **`RESTRICT`** (never lose financial history —
anonymize users instead); `order_items.product_id` → **`SET NULL`** + nullable.

## Snapshots vs live references — the core modeling rule

- **Cart holds live references** — it must show the _current_ price and availability.
- **Order holds snapshots** — `product_name`, `unit_price_cents`, `line_total_cents` and a
  `jsonb` shipping address, copied at purchase time. Orders are immutable historical records
  and must not change when the catalog does.

## Indexing

Postgres auto-indexes PKs and UNIQUE constraints but **NOT foreign keys**.
**Index every FK** you join or filter on — unindexed FKs are the #1 silent performance bug.
Add other indexes for real query patterns (`WHERE`/`JOIN ON`/`ORDER BY`), not speculation.
Specific: `UNIQUE(cart_id, product_id)`, `orders(status)`, partial index for published products.

## Transactions

Atomic multi-step writes (checkout above all) use `DataSource.transaction()` or a `QueryRunner`.
Never leave an order half-created.
