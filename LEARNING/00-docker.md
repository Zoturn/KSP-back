1 # 00 — Docker & Docker Compose, from zero

> You are new to Docker. This note explains the mental model first, then every line of our
> `docker-compose.yml`, then the commands you'll actually use. Read it once end-to-end; come
> back to the command table later.

---

## 1. The problem Docker solves

To run this project you need PostgreSQL 16. The traditional way is to install Postgres onto
Windows directly: an installer, a Windows service running in the background forever, a
system-wide port, a specific version that other projects must also live with, and a messy
uninstall.

Docker replaces that with a **disposable, isolated box**. Postgres runs *inside* the box with
its own filesystem, its own network, its own installed packages. Your Windows machine only
sees one thing: a port. Delete the box and your machine is exactly as it was before.

Practical consequences:
- Two projects can use Postgres 14 and Postgres 16 simultaneously without conflict.
- "Works on my machine" mostly disappears — the box is identical everywhere.
- Cleanup is one command, not an uninstall wizard.

---

## 2. The four words you must understand

### Image
A **read-only template**. Think of it as a class in programming, or an `.iso` file.
`postgres:16-alpine` is an image: a frozen filesystem containing Alpine Linux plus a fully
installed PostgreSQL 16. You never modify an image; you run it.

The `:16-alpine` part is the **tag** (version). We pin it deliberately — see §7.

Images are downloaded from a **registry** (Docker Hub by default) the first time you use them,
then cached on your disk.

### Container
A **running instance of an image**. The object to the image's class. You can start many
containers from one image; each gets its own isolated filesystem layered on top of the image.

**A container's filesystem is disposable.** This is the single most important thing to
internalise. Delete the container and everything written inside it is gone — including your
database tables, unless you took the step in the next section.

### Volume
**Storage that outlives containers.** A named volume is a folder Docker manages outside the
container. You *mount* it at a path inside the container, and anything written there is really
written to the volume.

Postgres stores its data at `/var/lib/postgresql/data`. We mount our volume `ksp_pgdata` onto
exactly that path. Result: destroy and recreate the container as often as you like — the data
stays. This is why `docker compose down` is safe and `docker compose down -v` is not.

### Port mapping
Containers are network-isolated by default. Postgres listening on port 5432 *inside* the
container is unreachable from Windows until you **publish** the port:

```
ports:
  - "5432:5432"
       │     └── CONTAINER port — where Postgres actually listens (always 5432)
       └──────── HOST port — what your Windows machine connects to
```

Read it as **HOST:CONTAINER**. NestJS connects to `localhost:5432` on your machine; Docker
forwards that into the container. If port 5432 is already taken on Windows, change only the
left number (e.g. `"5433:5432"`) and update `POSTGRES_PORT` in `.env`.

### And one more: the daemon
`docker` (the CLI) talks to the **Docker daemon** (the background engine). On Windows the
daemon is **Docker Desktop**. Having the CLI installed is *not enough* — if Docker Desktop
isn't running, every command fails with:

```
error during connect: ... the docker daemon is not running
```

**Fix: launch Docker Desktop and wait for the whale icon to say "Engine running".**

---

## 3. What Compose adds

Running a container by hand means a long, error-prone command:

```bash
docker run -d --name ksp-postgres -e POSTGRES_USER=ksp_user -e POSTGRES_PASSWORD=... \
  -e POSTGRES_DB=ksp_ecommerce -p 5432:5432 -v ksp_pgdata:/var/lib/postgresql/data \
  --restart unless-stopped postgres:16-alpine
```

**Docker Compose** moves all of that into a file (`docker-compose.yml`) that lives in the repo
and is version-controlled. Then:

```bash
docker compose up -d
```

One command, identical for everyone, reviewable in a pull request. It also manages *multiple*
services (our Postgres **and** pgAdmin) and the private network between them.

> Note: modern Compose is `docker compose` (a subcommand, v2). Older tutorials say
> `docker-compose` with a hyphen (v1, deprecated). Ours also omits the old top-level
> `version:` key — that's correct for v2, not a mistake.

---

## 4. Our `docker-compose.yml`, key by key

The file is heavily commented; this is the conceptual companion.

```yaml
services:          # each entry = one container we want running
  postgres:        # ← the service NAME. Also its hostname on the private network.
```

| Key | What it does | Why we set it |
|---|---|---|
| `image` | Which template to run | `postgres:16-alpine` — official, version-pinned, small |
| `container_name` | Fixed, readable name | so `docker compose logs postgres` and `docker exec ksp-postgres` work predictably |
| `restart: unless-stopped` | Auto-restart policy | survives crashes and reboots, but respects a deliberate stop |
| `environment` | Env vars inside the container | the Postgres image reads these **on first boot** to create the user/DB |
| `ports` | Publish HOST:CONTAINER | makes the DB reachable from NestJS on your machine |
| `volumes` | Mount persistent storage | **the reason your data survives** |
| `healthcheck` | Readiness probe | lets dependents wait until the DB truly accepts connections |
| `depends_on` + `condition: service_healthy` | Ordering | pgAdmin waits for a healthy Postgres |

### The `environment` gotcha (this catches everyone)

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` are read **only when the data directory
is empty** — i.e. on the very first startup. Changing the password in `.env` afterwards does
**nothing** to an already-initialised database; the old credentials still apply.

To genuinely reset credentials you must delete the volume (destroying all data):
`docker compose down -v && docker compose up -d`.

### Where `${POSTGRES_USER}` comes from

Compose automatically reads a file named `.env` **in the same folder** and substitutes
`${VAR}` references. That's why no secret appears in `docker-compose.yml` — the compose file is
committed to git, `.env` is not. `.env.example` is committed as documentation of which
variables exist.

### Why a healthcheck matters

A container reports "started" the instant the process launches, but Postgres needs a moment
more before it accepts connections. Without a healthcheck, an app starting at the same time
hits `ECONNREFUSED`. `pg_isready` is Postgres's own probe; `condition: service_healthy` makes
dependents wait for it.

---

## 5. Running it — the actual workflow

**Step 0 — start Docker Desktop.** Nothing below works until the engine is running.

```bash
cd ksp-backend
docker compose up -d
```

- `up` — create and start everything described in the file
- `-d` — *detached*: run in the background and give you your terminal back

First run downloads the images (a few hundred MB, once). Then:

```bash
docker compose ps
```

Expect `ksp-postgres` with state **running (healthy)**. `healthy` is the one that matters —
it means the healthcheck passed.

Verify the database really works by opening a SQL shell *inside* the container:

```bash
docker compose exec postgres psql -U ksp_user -d ksp_ecommerce -c "SELECT version();"
```

- `exec` — run a command inside an already-running container
- `psql` — the Postgres CLI, which exists inside the container (you didn't install it on Windows)

pgAdmin (browser GUI): <http://localhost:5050>. Connect to host **`postgres`** (the service
name — pgAdmin is itself a container on the same private network, so `localhost` there would
mean *pgAdmin's own* container, not the database).

> That last point is the other classic confusion: **`localhost` means different things
> depending on where you are.** From Windows → `localhost:5432`. From another container →
> `postgres:5432` (service name).

---

## 6. Command reference

| Command | Effect |
|---|---|
| `docker compose up -d` | start everything in the background |
| `docker compose ps` | list services + health status |
| `docker compose logs -f postgres` | follow the database log (`Ctrl+C` to stop watching) |
| `docker compose stop` | stop containers, keep them |
| `docker compose start` | start them again |
| `docker compose restart postgres` | restart one service |
| `docker compose down` | stop **and remove** containers — **data survives** in the volume |
| `docker compose down -v` | ⚠️ **also deletes volumes — destroys the entire database** |
| `docker compose exec postgres psql -U ksp_user -d ksp_ecommerce` | interactive SQL shell |
| `docker volume ls` | list volumes (you should see `ksp-backend_ksp_pgdata`) |
| `docker compose pull` | fetch newer images for the pinned tags |

**Memorise the difference:** `down` = safe, `down -v` = destroys your data. The `-v` flag is
the only one in this project that can lose work irreversibly.

---

## 7. Practices we follow (and why)

1. **Pin image versions** — `postgres:16-alpine`, never bare `latest`. A silent jump to
   Postgres 17 can make an existing data directory unreadable.
2. **No secrets in the compose file** — values come from gitignored `.env` via `${VAR}`.
   `.env.example` documents the required keys with placeholders.
3. **Named volumes for anything that must persist.**
4. **Healthchecks + `depends_on: service_healthy`** to avoid startup races.
5. **`-alpine` variants** where available — much smaller images, faster to pull.

---

## 8. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `the docker daemon is not running` | Docker Desktop isn't started. Launch it, wait for "Engine running". |
| `port is already allocated` | Something else uses 5432 (often a native Postgres install). Change the **host** side: `POSTGRES_PORT=5433`, then `docker compose up -d`. |
| `password authentication failed` | The volume was initialised with different credentials. Either use the original password or wipe it: `docker compose down -v` (destroys data). |
| Container keeps restarting | `docker compose logs postgres` — read the actual error. |
| Data vanished | You ran `down -v`, or never mounted the volume. |
| pgAdmin stuck `Restarting` | We actually hit this: pgAdmin rejects `.local` email domains (`'admin@ksp.local' does not appear to be a valid email address`) and exits, so Docker restarts it forever. Fixed by using `admin@ksp.com` in `.env`. **Lesson: a restart loop means the process is exiting — `docker compose logs <service>` tells you why.** |
| Changes to `.env` seem ignored | Compose reads `.env` at `up` time — re-run `docker compose up -d`. And remember `POSTGRES_*` credentials only apply on first init. |

---

## 9. What we did NOT do yet (and why)

We containerised only the **database**, not the NestJS app. During development you want the
app running natively (`npm run start:dev`) for instant hot-reload, breakpoints and a familiar
debugger. Containerising the API is a deployment concern — we'll add a `Dockerfile` for it
in the hardening phase, and at that point `POSTGRES_HOST` changes from `localhost` to
`postgres`, for exactly the reason explained in §5.

---

## Recap

- **Image** = template · **Container** = running instance (disposable) · **Volume** = data that
  survives · **Ports** = `HOST:CONTAINER`
- Compose turns a long `docker run` into a committed, reviewable file.
- Docker Desktop (the daemon) must be running.
- `down` is safe; **`down -v` destroys the database**.
- Credentials in `POSTGRES_*` apply only on first initialisation.
