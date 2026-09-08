---
paths:
  - "ksp-backend/src/**/entities/**/*.ts"
  - "src/**/entities/**/*.ts"
  - "ksp-backend/src/**/*.entity.ts"
  - "src/**/*.entity.ts"
  - "ksp-backend/src/database/**/*.ts"
  - "src/database/**/*.ts"
  - "ksp-backend/src/database/migrations/**/*.ts"
  - "src/database/migrations/**/*.ts"
---

# Database, entities & migrations (ksp-backend)

## Migrations only — `synchronize` is forbidden
`synchronize: true` is banned **even in development**: it silently alters/drops schema and
leaves no reviewable history.

Workflow: edit entities → `npm run migration:generate` → **read the generated SQL** →
`npm run migration:run`.

- **Always read the generated SQL.** It is how you learn what your decorators actually do,
  and the differ often misses `CHECK` constraints and partial indexes — add those by hand.
- Commit every migration. **Never edit a migration that has already run** — write a new one forward.
- Extensions are created in the first migration:
  `CREATE EXTENSION IF NOT EXISTS pgcrypto;` and `citext`.

## Column conventions
| Concern | Rule |
|---|---|
| Primary key | `uuid` via `@PrimaryGeneratedColumn('uuid')`. Never mix PK types across tables. |
| Timestamps | `timestamptz` always (`@CreateDateColumn`/`@UpdateDateColumn`). Never bare `timestamp`. |
| Email | `citext` — case-insensitive uniqueness without lowercasing everywhere. |
| **Money** | Integer minor units: `price_cents integer` + `currency char(3)`. **Never float/double.** `CHECK (>= 0)`. Format only at the presentation edge. |
| Enums | `text` + `CHECK (col IN (...))` rather than native PG enums — cheap to evolve. |
| Postal codes | `text`, never numeric (leading zeros). |

## The two "cascades" — do not confuse them
- **DB-level** `onDelete: 'CASCADE'` — a real FK constraint enforced by Postgres. Use for true
  ownership (cart → items, product → images).
- **ORM-level** `cascade: true` — tells TypeORM to auto-persist relations on `save()`. A
  persistence convenience, *not* a constraint. Use narrowly and deliberately (e.g. `['insert']`).

Policy: ownership → `CASCADE`; `orders.user_id` → **`RESTRICT`** (never lose financial history —
anonymize users instead); `order_items.product_id` → **`SET NULL`** + nullable.

## Snapshots vs live references — the core modeling rule
- **Cart holds live references** — it must show the *current* price and availability.
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
