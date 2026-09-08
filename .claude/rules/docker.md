---
paths:
  - "**/docker-compose.yml"
  - "**/docker-compose.*.yml"
  - "**/Dockerfile"
  - "**/.dockerignore"
---

# Docker conventions

The author is **new to Docker**. Every Docker change must be explained, not just applied.

## Teaching requirement
- Comment the compose file generously — what each key does, not just what it is set to.
- When introducing a Docker concept (image vs container, volume, port mapping, healthcheck,
  network, `depends_on`), **explain it in the response** and capture it in
  `ksp-backend/LEARNING/00-docker.md`.
- Give the exact command to run, and say what a successful result looks like.

## Conventions
- **No secrets in `docker-compose.yml`.** Values come from `.env` via `${VAR}` interpolation.
  `.env` is gitignored; `.env.example` is committed with placeholder values.
- Pin image versions (`postgres:16-alpine`), never bare `latest` for the database —
  an unpinned major upgrade can make the data directory unreadable.
- **Named volumes** for anything that must survive `docker compose down`
  (Postgres data lives at `/var/lib/postgresql/data`).
- Port mappings are `"HOST:CONTAINER"` — the left side is what your machine connects to.
- Add a `healthcheck` to the database and gate dependents with
  `depends_on: { condition: service_healthy }` to avoid connection races on startup.
- `restart: unless-stopped` for long-running dev infrastructure.

## Command reference to keep accurate
| Command | Effect |
|---|---|
| `docker compose up -d` | start services in the background |
| `docker compose ps` | list services and health |
| `docker compose logs -f postgres` | follow database logs |
| `docker compose down` | stop and remove containers (**named volume data survives**) |
| `docker compose down -v` | ⚠️ also deletes volumes — **destroys all database data** |
| `docker compose exec postgres psql -U <user> -d <db>` | open a SQL shell inside the container |

Warn explicitly before suggesting anything that destroys data (`down -v`, volume removal).

## Gotcha to remember
The Docker **daemon** (Docker Desktop on Windows) must be running before any `docker` command
works — an installed CLI is not enough.
