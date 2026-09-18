# ksp-backend

**GraphQL** API for an e-commerce catalog — **NestJS + Apollo Server 5 + TypeORM + PostgreSQL**,
JWT auth, code-first schema.

Part of the KSP learning project. Its sister repo, `ksp-frontend`, generates its entire typed
client from this service's committed `schema.gql`.

> The API is **GraphQL-only** — one endpoint, `POST /graphql`. The only REST routes are
> `/api/health` (probes need status codes) and `/api/uploads/*` (binary transfer).

---

## Prerequisites

| Tool           | Version              | Notes                           |
| -------------- | -------------------- | ------------------------------- |
| Node.js        | **>= 24.9** (24 LTS) | `node --version` — see below    |
| Docker Desktop | any recent           | **must be running** — see below |

> **Node 24.9 is a hard floor, not a preference.** Several `@nestjs/*` packages ship native
> ESM, and Jest can only load them on Node >= 24.9. On an older Node every test suite that
> touches `@nestjs/config`, `@nestjs/typeorm` or `@nestjs/terminus` fails with
> `Must use import to load ES Module`. The version is pinned in `package.json`'s `engines` and
> in `.nvmrc`; with nvm installed, `nvm use` in this directory picks it up.
>
> Note that the flag doing the other half of the work (`--experimental-vm-modules`) is already
> baked into the `jest` npm script — which is why tests must be run via `npm run test` /
> `npm run test:e2e` and **not** by invoking `npx jest` directly.

> **Docker Desktop must actually be running**, not just installed. If commands fail with
> `the docker daemon is not running`, launch Docker Desktop and wait for "Engine running".

---

## Getting started

```bash
# 1. Environment — copy the template and adjust if needed
cp .env.example .env

# 2. Start PostgreSQL + pgAdmin in Docker
docker compose up -d

# 3. Confirm the database is healthy (look for "running (healthy)")
docker compose ps

# 4. Install dependencies
npm install

# 5. Apply database migrations
npm run migration:run

# 6. Run the API in watch mode
npm run start:dev
```

Then open:

| URL                                | What                                                |
| ---------------------------------- | --------------------------------------------------- |
| <http://localhost:3000/graphql>    | **GraphiQL** — the API and its interactive explorer |
| <http://localhost:3000/api/health> | health check (liveness + database)                  |
| <http://localhost:5050>            | pgAdmin (DB browser)                                |

In pgAdmin, connect to host **`postgres`** — not `localhost`. pgAdmin is itself a container,
so `localhost` there would mean pgAdmin's own container. Credentials are in `.env`.

---

## Commands

| Command                               | Description                                  |
| ------------------------------------- | -------------------------------------------- |
| `npm run start:dev`                   | API with hot reload                          |
| `npm test`                            | Jest unit tests                              |
| `npm run test:e2e`                    | Supertest end-to-end tests                   |
| `npm run test:cov`                    | coverage report                              |
| `npm run schema:generate`             | regenerate `schema.gql` (no database needed) |
| `npm run schema:check`                | fail if the committed `schema.gql` is stale  |
| `npm run migration:generate --name=X` | generate a migration from entity changes     |
| `npm run migration:run`               | apply pending migrations                     |
| `npm run migration:revert`            | undo the last migration                      |
| `docker compose up -d`                | start the database                           |
| `docker compose down`                 | stop it (**data survives**)                  |
| `docker compose down -v`              | ⚠️ stop **and delete all database data**     |

---

## Project structure

```
schema.gql       GENERATED + COMMITTED — the contract ksp-frontend compiles against
src/
  main.ts        bootstrap: /graphql at root, /api prefix for health & uploads
  app.module.ts  GraphQLModule.forRootAsync + global APP_* providers
  config/        env loading + validation
  database/      TypeORM setup, data-source.ts, migrations/
  common/        guards, filters, decorators, dataloader/, graphql/
  health/ auth/ users/ categories/ products/ cart/ orders/
                 each: *.resolver.ts, *.service.ts, *.mapper.ts, entities/, models/, inputs/
test/            e2e specs (Supertest -> /graphql)
openspec/        capability specs (written before code)
```

---

## Conventions worth knowing

- **Migrations only.** TypeORM `synchronize` is never enabled — it silently drops data.
  Change entities → generate a migration → **read the SQL** → run it.
- **Money is integer cents** (`price_cents`), never floats. Format at the display edge.
- **Cart holds live product references; orders hold snapshots** of name and price, so order
  history never changes when the catalog does.
- **Entities are never GraphQL models.** A mapper converts; the schema is a published contract
  that must not move when the database refactors.
- **Every relation field resolver goes through a DataLoader.** A field resolver runs once per
  parent object — without batching, 20 products with images and category is 41 queries.
- **GraphQL returns HTTP 200 for execution failures.** Anything a resolver or guard produces —
  including auth failures — is a 200 with `errors[].extensions.code`. (A document that fails
  _parse or validation_, like a typo'd field name, returns 400 instead; that's a malformed
  request, not something application code produces.) Tests must assert `errors` is undefined on
  success and assert the code on failure — `.expect(401)` fails against a _correctly working_
  server.
- **Every component ships with tests and an explanation.** That's the point of the project.

Full conventions live in this repo's `.claude/rules/`.

---

## Troubleshooting

| Problem                                                                  | Fix                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker daemon is not running`                                           | Start Docker Desktop.                                                                                                                                                                                                                    |
| `port is already allocated`                                              | Something else uses that port. Set `POSTGRES_PORT` in `.env` to a free one, re-run `docker compose up -d`.                                                                                                                               |
| `password authentication failed`, but `docker compose ps` says `healthy` | Another process (e.g. a native Postgres install) already owns the host port — Docker's healthcheck runs inside the container, so it never notices. Move this project to a different `POSTGRES_PORT` instead of fighting it.              |
| `password authentication failed` (no port conflict)                      | The volume was created with different credentials. Use the original password, or wipe with `docker compose down -v` (destroys data).                                                                                                     |
| Migrations fail on a fresh DB                                            | Ensure the DB is `healthy` (`docker compose ps`) before running them.                                                                                                                                                                    |
| `Must use import to load ES Module` in tests                             | Node is below 24.9 (`node -v`; `nvm use 24`), or the tests were started with `npx jest` instead of `npm run test` / `npm run test:e2e` — the latter supply the required `--experimental-vm-modules` flag. See `.claude/rules/nestjs.md`. |
