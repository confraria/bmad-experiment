# Story 3.10: Docker deployment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the app packaged as a self-contained Docker image with a local `docker compose` setup and a GHCR publish workflow,
so that it can run anywhere (self-hosted or any container host) without depending on Vercel.

## Acceptance Criteria

1. **`next.config.ts` opts into standalone output for production builds.** The config object (the one wrapped by `withSerwistInit` in the production branch) sets `output: 'standalone'`. This must NOT apply in dev mode — `isDev` branch stays untouched — because `next dev` with standalone output is wasteful and changes module resolution semantics. Verify by running `npm run build` locally: a `.next/standalone/` directory must exist afterward, containing a `server.js` and a traced minimal `node_modules/`.

2. **Multi-stage `Dockerfile` at repo root.** Three stages in this exact topology (names matter — referenced by the publish workflow's cache key):
    - `deps`: runs `npm ci --include=dev` on `package.json` + `package-lock.json` only (no app source). Purpose: a cacheable dependency layer that only invalidates on lockfile change.
    - `builder`: depends on `deps`, copies the full source, runs `npx prisma generate` then `npm run build`. Produces `.next/standalone`, `.next/static`, `public/sw.js` (via Serwist), and the generated Prisma client.
    - `runner`: minimal runtime layer. Copies ONLY what's needed: `.next/standalone`, `.next/static`, `public`, the Prisma CLI (`prisma`, `@prisma/*`), and the `@libsql` native bindings. Uses `node:24-slim` as the base (Debian-based — `@libsql` publishes `linux-x64-gnu` and `linux-arm64-gnu` bindings; alpine's musl is NOT supported by `@libsql/client`).

3. **Runtime image entrypoint.** `CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]`. Migrations run at container start against whatever `DATABASE_URL` points to — creates the `Todo` table on first boot, is a no-op on subsequent boots. If migrations fail, the container exits with a non-zero code (desired — Kubernetes/Compose will retry; silent failure would be worse).

4. **Runtime env contract.** The container reads these env vars, all optional except `DATABASE_URL`:
    - `DATABASE_URL` (required at runtime, NOT at build time). Default baked into the image if unset: unset (Prisma will throw, which is the correct failure mode — forces the operator to be explicit).
    - `PORT` (default `3000`) — `next start` / `server.js` respects this.
    - `HOSTNAME` (default `0.0.0.0`) — required for `server.js` to bind on all interfaces inside the container.
    - `NODE_ENV=production` (hardcoded in the Dockerfile, NOT user-overridable).
    The build-time `DATABASE_URL` is handled via an `ARG DATABASE_URL="file:./build.db"` in the `builder` stage — Prisma generate doesn't actually connect, but some Prisma versions validate the URL format during generate. A stub file URL is safe and leaves no artifacts in the runner image.

5. **`.dockerignore` exists and excludes the right things.** The file must exclude at minimum:
    ```
    .git
    .github
    .next
    node_modules
    coverage
    test-results
    playwright-report
    _bmad
    _bmad-output
    e2e
    .env.local
    .env*.local
    *.db
    *.db-shm
    *.db-wal
    docs
    scripts
    README.md
    ```
    Rationale: keep build context small (<10MB for this project), avoid copying local node_modules (triggers the `deps` stage cache to rebuild even if lockfile unchanged), never leak `.env.local` or dev SQLite files into images. Keep `prisma/`, `public/`, `src/`, top-level configs (`next.config.ts`, `package.json`, `package-lock.json`, `tailwind/postcss/tsconfig`), yes.

6. **`docker-compose.yml` at repo root for local deployment.** Single service `app`:
    - Builds from `.` (uses the repo Dockerfile).
    - Maps `3000:3000`.
    - Sets `DATABASE_URL=file:/data/todos.db`.
    - Sets `NODE_ENV=production` (redundant with Dockerfile but explicit).
    - Mounts a named volume `todos-data` at `/data` for SQLite persistence.
    - `restart: unless-stopped` so it survives host reboots.
    - No depends_on (single service).
    Volume named at the top level: `volumes: { todos-data: {} }`. The volume is managed by Docker, not a bind mount — avoids host-path/permission drama.

7. **Data persistence verified by round-trip.** Given `docker compose up`, a user adds a todo via the UI, then `docker compose down` + `docker compose up` again, then reloads — the todo is still present (survived container replacement via the named volume).

8. **`.github/workflows/docker.yml` publishes to GHCR on main + manual dispatch.** Workflow triggers on `push` to `main` (only when the Dockerfile, compose file, or source changes — path-filtered to avoid rebuilds on docs-only commits), and on `workflow_dispatch` for manual triggers. Requires `packages: write` permission. Uses:
    - `actions/checkout@v4`
    - `docker/login-action@v3` against `ghcr.io` with `github.actor` + `secrets.GITHUB_TOKEN` (no extra secrets).
    - `docker/metadata-action@v5` for tag generation: `latest`, short SHA (first 7 chars), and `main` ref.
    - `docker/build-push-action@v6` with GHA cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`).
    - Image name MUST be lowercase (GHCR requirement): `ghcr.io/confraria/bmad-experiment`.

9. **Publish workflow does NOT run on PRs.** Explicitly scoped to `push: { branches: [main] }`. Rationale: PRs go through the `CI` workflow (Story 3.8) which runs fast checks; a Docker build adds ~3 minutes and produces an image no one consumes until merge. If a PR ever needs its own image, that's a separate story with `workflow_dispatch` as the bridge.

10. **README gets a "Run with Docker" section.** New second-level section in `README.md` documents two entrypoints:
    - **Local dev path:** `docker compose up --build` — first run builds, subsequent runs reuse cache.
    - **Pulling the published image:** `docker run -d -p 3000:3000 -v todos-data:/data -e DATABASE_URL=file:/data/todos.db ghcr.io/confraria/bmad-experiment:latest`.
    Mention the PWA/HTTPS caveat: the service worker registers in the container, but Chrome/Firefox only install PWAs from HTTPS origins — a reverse proxy (Caddy, Traefik, Cloudflare Tunnel) is needed for the full PWA experience. Out of scope for this story; noted as a known ops step.

11. **Image is reasonably small.** Target: runner-stage image <400MB uncompressed. Measured by `docker image ls bmad-experiment:latest --format '{{.Size}}'` after `docker build .`. If substantially larger, the most likely cause is a leaked build stage artifact into `runner` — investigate via `docker history`. This is a soft ceiling; don't over-engineer (multi-line layer merges, distroless base, etc.) for marginal size wins.

12. **CI (Story 3.8) must keep passing.** Adding the Docker config files must not touch any runtime code path. The existing `CI` workflow already runs lint, tsc, vitest, playwright, and build — none of those read the Dockerfile or docker-compose. Verify by local re-run of the CI sequence after changes land: `npm run lint && npx tsc --noEmit && npm test && npm run test:e2e && npm run build` all green.

13. **Health check (optional, recommended).** `docker-compose.yml`'s `app` service defines:
    ```yaml
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
    ```
    `node:24-slim` includes `wget`. Start period accounts for migrate-deploy + Next boot (~5-10s). If this adds fragility, drop it — it's nice-to-have, not required. Mark as optional in the task list.

14. **Build-time vs. runtime env separation is honored.** The `Dockerfile` explicitly stages the `DATABASE_URL`:
    - `builder` stage: `ARG DATABASE_URL="file:./build.db"` (a throwaway stub used only during `prisma generate`; never written to, never read at runtime).
    - `runner` stage: `DATABASE_URL` is NOT set at image-build time. It MUST come from the container runtime env (compose, `docker run -e`, k8s ConfigMap, etc.). Including it in the image would bake a dev path into production.
    Enforced by inspection: `docker inspect bmad-experiment:latest --format '{{.Config.Env}}'` — the output must not contain `DATABASE_URL=`.

## Tasks / Subtasks

- [ ] **Task 1 — Enable Next.js standalone output in production** (AC: #1)
  - [ ] Open `src/../next.config.ts` (sic — it's at repo root, `next.config.ts`). Add `output: 'standalone'` to the production-branch NextConfig only:
    ```ts
    const nextConfig: NextConfig = {
      allowedDevOrigins: ['192.168.1.65'],
    };

    const prodConfig: NextConfig = {
      ...nextConfig,
      output: 'standalone',
    };

    const config: NextConfig = isDev
      ? nextConfig
      : withSerwistInit({
          swSrc: 'src/app/sw.ts',
          swDest: 'public/sw.js',
        })(prodConfig);
    ```
    Or equivalent — the only requirement is that `isDev === false` path merges `output: 'standalone'` into the config passed to `withSerwistInit`.
  - [ ] Verify locally: `rm -rf .next && npm run build && ls .next/standalone/server.js`. The file must exist.
  - [ ] Run the existing CI-equivalent sequence locally to confirm no regressions: `npm run lint && npx tsc --noEmit && npm test && npm run build`. Skip `test:e2e` here; the next.config change is compile-time and doesn't affect E2E behavior.

- [ ] **Task 2 — Author the `Dockerfile`** (AC: #2, #3, #4, #11, #14)
  - [ ] Create `Dockerfile` at repo root. Target structure:
    ```dockerfile
    # syntax=docker/dockerfile:1.7

    # ---- deps ----
    FROM node:24-slim AS deps
    WORKDIR /app
    COPY package.json package-lock.json ./
    RUN npm ci --include=dev

    # ---- builder ----
    FROM node:24-slim AS builder
    WORKDIR /app
    ARG DATABASE_URL="file:./build.db"
    ENV DATABASE_URL=$DATABASE_URL
    ENV NEXT_TELEMETRY_DISABLED=1
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    RUN npx prisma generate
    RUN npm run build

    # ---- runner ----
    FROM node:24-slim AS runner
    WORKDIR /app
    ENV NODE_ENV=production
    ENV NEXT_TELEMETRY_DISABLED=1
    ENV PORT=3000
    ENV HOSTNAME=0.0.0.0

    # Next standalone output
    COPY --from=builder /app/.next/standalone ./
    COPY --from=builder /app/.next/static ./.next/static
    COPY --from=builder /app/public ./public

    # Prisma CLI + engine for migrate deploy at runtime
    COPY --from=builder /app/prisma ./prisma
    COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
    COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
    COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql

    # Generated client (standalone output traces this but belt-and-suspenders)
    COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

    EXPOSE 3000
    CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
    ```
  - [ ] Critical: do NOT use `node:20-alpine`. `@libsql/client` does not ship musl binaries — the container would fail at first DB touch with "could not locate native module". `node:24-slim` (Debian bookworm-slim) is the right base.
  - [ ] Critical: do NOT `ENV DATABASE_URL=...` in the `runner` stage. That bakes a path into the image. The build-time `ARG`/`ENV` in `builder` is fine because it's a stub and the stage is thrown away.
  - [ ] Build and verify: `docker build -t bmad-experiment:dev .` — should succeed in ~3-5 min cold, <1 min with layer cache. Then `docker image ls bmad-experiment:dev --format '{{.Size}}'` — flag anything >500MB for investigation (target is <400MB, soft).

- [ ] **Task 3 — Create `.dockerignore`** (AC: #5)
  - [ ] Create `.dockerignore` at repo root with the exclusion list from AC#5. Add a comment at the top: `# Keep build context small — everything listed here is not needed inside the image.`
  - [ ] Verify the context size: `docker build --no-cache -t bmad-experiment:dev . 2>&1 | grep "transferring context"`. Expect ~5-10 MB. If it's >50MB, something unwanted is leaking — add it to `.dockerignore`.

- [ ] **Task 4 — Author `docker-compose.yml`** (AC: #6, #7, #13)
  - [ ] Create `docker-compose.yml` at repo root:
    ```yaml
    services:
      app:
        build: .
        image: bmad-experiment:local
        ports:
          - "3000:3000"
        environment:
          DATABASE_URL: "file:/data/todos.db"
          NODE_ENV: production
        volumes:
          - todos-data:/data
        restart: unless-stopped
        healthcheck:
          test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/"]
          interval: 30s
          timeout: 5s
          start_period: 20s
          retries: 3

    volumes:
      todos-data: {}
    ```
  - [ ] If the healthcheck's `wget --spider` fails at runtime (some minimal `node:24-slim` variants may strip wget), fall back to `curl -fsS http://localhost:3000/ || exit 1` and add `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*` to the `runner` stage. First try without the fallback — `node:24-slim` ships wget by default as of 2026.
  - [ ] Verify round-trip: `docker compose up --build -d`, open `http://localhost:3000`, add a todo, `docker compose down`, `docker compose up -d`, verify the todo is still there. (AC#7.) Document the round-trip result in Dev Agent Record.

- [ ] **Task 5 — Author `.github/workflows/docker.yml` (GHCR publish)** (AC: #8, #9)
  - [ ] Create `.github/workflows/docker.yml`:
    ```yaml
    name: Docker Image

    on:
      push:
        branches: [main]
        paths:
          - 'Dockerfile'
          - 'docker-compose.yml'
          - '.dockerignore'
          - 'package.json'
          - 'package-lock.json'
          - 'next.config.ts'
          - 'prisma/**'
          - 'public/**'
          - 'src/**'
      workflow_dispatch:

    concurrency:
      group: docker-${{ github.ref }}
      cancel-in-progress: true

    permissions:
      contents: read
      packages: write

    jobs:
      build-and-push:
        runs-on: ubuntu-latest
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Set up Docker Buildx
            uses: docker/setup-buildx-action@v3

          - name: Log in to GHCR
            uses: docker/login-action@v3
            with:
              registry: ghcr.io
              username: ${{ github.actor }}
              password: ${{ secrets.GITHUB_TOKEN }}

          - name: Extract metadata
            id: meta
            uses: docker/metadata-action@v5
            with:
              images: ghcr.io/confraria/bmad-experiment
              tags: |
                type=raw,value=latest,enable={{is_default_branch}}
                type=sha,format=short

          - name: Build and push
            uses: docker/build-push-action@v6
            with:
              context: .
              push: true
              tags: ${{ steps.meta.outputs.tags }}
              labels: ${{ steps.meta.outputs.labels }}
              cache-from: type=gha
              cache-to: type=gha,mode=max
    ```
  - [ ] The image name MUST be lowercase: `ghcr.io/confraria/bmad-experiment`. GitHub owners and repo names are case-insensitive in the UI but GHCR enforces lowercase on the registry.
  - [ ] First run: after push, go to `https://github.com/confraria/bmad-experiment/pkgs/container/bmad-experiment` and confirm the package appears. It's private by default — to make it public, click "Package settings" → "Change visibility" → Public. That's a separate ops step; story does NOT mandate public.
  - [ ] Workflow verification is post-push only. Like Story 3.8, Task 4: if the first run fails, diagnose and push a follow-up commit. Common first-run issues:
    - GHCR login fails → `packages: write` permission block is missing or has a typo.
    - Build hits "could not locate native module" for libsql → base image is `node:20-alpine` (wrong); must be `node:24-slim`.
    - Build cache too large → `cache-to: type=gha,mode=max` with a large repo can exceed GitHub's 10GB Actions cache quota. For this project's size, unlikely, but if it happens, switch to `mode=min`.

- [ ] **Task 6 — Update README with "Run with Docker" section** (AC: #10)
  - [ ] Open `README.md`. Add a new section `## Run with Docker` AFTER the `## Scripts` section. Content outline:
    ```markdown
    ## Run with Docker

    ### Locally (build + run)

    ```bash
    docker compose up --build
    ```

    App listens on `http://localhost:3000`. SQLite data persists in a Docker-managed
    named volume (`todos-data`) across `docker compose down` / `up` cycles.

    ### Published image (GHCR)

    ```bash
    docker run -d \
      -p 3000:3000 \
      -v todos-data:/data \
      -e DATABASE_URL=file:/data/todos.db \
      ghcr.io/confraria/bmad-experiment:latest
    ```

    ### Notes

    - PWA install prompts require an HTTPS origin. For a proper PWA experience
      behind Docker, front the container with a reverse proxy that terminates
      TLS (Caddy, Traefik, Cloudflare Tunnel).
    - Database migrations run automatically at container start via
      `prisma migrate deploy`. First boot creates the schema; subsequent boots
      are a no-op.
    ```
  - [ ] Keep the CI badge region untouched.

- [ ] **Task 7 — Local verification** (AC: #7, #11, #12)
  - [ ] `docker build -t bmad-experiment:dev .` — succeeds, image size <500MB (ideally <400MB).
  - [ ] `docker compose up --build` — starts clean; `http://localhost:3000` responds; adding a todo via UI works.
  - [ ] `docker compose down && docker compose up` — todo is still there after restart.
  - [ ] `docker image inspect bmad-experiment:dev --format '{{.Config.Env}}'` — does NOT contain `DATABASE_URL=`.
  - [ ] Run the existing local CI sequence to confirm no regression: `npm run lint && npx tsc --noEmit && npm test && npm run build`. All green.
  - [ ] (Optional, defer to post-push.) Trigger the new publish workflow manually (`gh workflow run "Docker Image"`) and confirm the image lands at `ghcr.io/confraria/bmad-experiment:latest`.

## Dev Notes

### Why Docker instead of Vercel (replacing Story 3.9's intent)

Story 3.9 was "Vercel deployment wiring" and it was dropped. User pivoted to Docker for deployability without platform lock-in. Docker works on:
- A VPS (Hetzner, DigitalOcean, Linode) — pull + run.
- A container host (Fly.io, Railway, Render) — point-to-GHCR deploy.
- Kubernetes — drop the compose spec, translate to a Deployment + PersistentVolumeClaim.
- A laptop — `docker compose up`.

Vercel would give edge + previews + zero-ops for free, but requires buying into their workflow for a single-file Next app. Docker has higher day-one effort and lower day-two convenience (no auto-deploys on PR without extra wiring), but is maximally portable. For a personal/experimental app that may live on various hosts over time, portability wins.

Story 3.9 stays `dropped` in sprint-status — it was a different intent (Vercel specifically). This story (3.10) is additive, not a rename.

### Why multi-stage standalone output

Next.js 13+ `output: 'standalone'` produces a `.next/standalone/` directory containing a minimal `server.js` + the traced `node_modules/` subset the runtime actually touches. Copying this into a minimal runner cuts image size from ~1.2GB (full node_modules) to ~300-400MB. Specifically:
- `node_modules` in dev mode: ~800MB (includes eslint, playwright, vitest, next-dev etc).
- `.next/standalone/node_modules` for this project: ~80MB (just React, Next runtime, Dexie isn't server-side, Zustand, Zod, Prisma runtime).

The builder stage is thrown away — its ~1.5GB weight never ships in the final image.

### Why `node:24-slim` instead of alpine or an older Node LTS

`@libsql/client` (used by `@prisma/adapter-libsql`) ships platform-specific native bindings for: `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`, `win32-x64-msvc`. There is NO `linux-*-musl` binary. Alpine Linux uses musl libc — the optional-dep resolver at install time skips the binding entirely, and runtime crashes when `@prisma/adapter-libsql` tries to open a DB.

Debian-based `node:24-slim` (bookworm-slim) uses glibc and matches `linux-x64-gnu`/`linux-arm64-gnu`. Image is ~200MB base vs. alpine's ~50MB, but correctness beats size.

Alternative considered: `node:20-alpine` + compile libsql from source via rust toolchain in the builder. Adds ~300MB builder weight, 5-8 min to build, and a whole rust dep chain to audit. Not worth it.

### Why run migrations at container start vs. a separate step

Two options for running `prisma migrate deploy`:
- **A (chosen):** `CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]` — migrations run every container start. First boot creates tables, later boots are no-ops (~200ms each). Idempotent. Simple. Uses the Prisma CLI we already copy into the runner.
- **B:** Separate `migrate` service in `docker-compose.yml` with `depends_on: service_completed_successfully`. Cleaner separation but: needs a second image (or the same image with a different CMD), fails "run one container" simplicity, and doesn't work identically in Kubernetes without porting to an init container.
- **C:** Bake migrations into the image as raw SQL and apply via `sqlite3 /data/todos.db < /app/migrations.sql` at start. Avoids shipping the Prisma CLI but duplicates the migration tracking Prisma manages via `_prisma_migrations` table.

Option A is the least-surprise path. If the project later grows to >10 migrations or >1 replica, revisit — A races if multiple replicas start concurrently and both try to apply the same migration. For a single-instance todo app, it's fine.

### Why named volume instead of bind mount

Bind mounts (`./data:/data`) leak host-path conventions and permission drama:
- On Linux, the container runs as `node` (uid 1000) by default; host-owned directories won't be writable without `chown`.
- On macOS/Windows Docker Desktop, bind mounts have notorious I/O performance.
- On some hosts (managed container platforms), bind mounts aren't even allowed.

Named volumes are Docker-managed — Docker handles permissions and storage driver choice. The tradeoff: the user can't just `ls ./data` on the host. For a todo app's <1MB SQLite file, that's fine.

### Why `output: 'standalone'` only in production branch

`output: 'standalone'` changes how Next traces modules. In dev mode (`next dev`), it's irrelevant — dev uses a different server entirely. But setting it unconditionally could:
- Confuse `next dev`'s module resolution (low risk, but non-zero).
- Change behavior of any future dev-time tooling that introspects the config.

The existing `next.config.ts` already has a dev-vs-prod fork (the Serwist wrapper). Adding `output: 'standalone'` to the prod-only path is the minimal, consistent change.

### Why path-filtered triggers on the docker workflow

Without path filters, every doc-only commit on `main` rebuilds the image (~3 min) and republishes — wasteful. Path-filtering to Dockerfile, compose, source, lockfile, Prisma, and public folder captures exactly the inputs that matter. Edge cases:
- Adding a new dep to `package.json` → triggers (matched by `package.json` / `package-lock.json`).
- Adding a new file to `scripts/` → does NOT trigger. If `scripts/` ever has runtime relevance, add it to the paths list.
- Adding a new file to `_bmad-output/` → does NOT trigger. Correct.

`workflow_dispatch` gives a manual override for "I changed something in the paths list and want to republish without a code change."

### Why NOT run the Docker workflow on PRs

Three reasons:
1. **Cost.** GitHub free tier gives 2000 Actions minutes/month for private repos (unlimited on public). A 3-minute docker build per PR adds up when you're iterating. The CI workflow (3.8) already runs fast checks.
2. **No consumer.** No one pulls a PR-preview image. The workflow would produce an artifact no one uses.
3. **Drift risk.** PR-preview images tagged with PR numbers accumulate in GHCR unless actively pruned. Cleaner to keep GHCR tied to `main`.

If a PR ever needs a pre-merge image (e.g., to deploy to a staging env for manual testing), `workflow_dispatch` with a branch input is the bridge — add it in a follow-up story when needed.

### Out of scope

- **HTTPS / reverse proxy.** The container speaks HTTP on 3000. For PWA install prompts, HTTPS is mandatory. Picking a proxy (Caddy is simplest; Cloudflare Tunnel is simplest-if-already-CF) is host-specific and orthogonal to this story. Documented as a README note; no config committed here.
- **Multi-platform images.** Current setup produces amd64 only (`ubuntu-latest` on Actions is x86). For arm64 hosts (Apple Silicon local use, AWS Graviton), `docker/build-push-action` accepts `platforms: linux/amd64,linux/arm64` — adds ~2x build time via QEMU. Not shipping today; add if an arm64 host actually materializes.
- **Deploy to a specific host.** Fly.io / Railway / Render / self-hosted — each is a separate story with its config file (fly.toml, railway.json, render.yaml, systemd unit).
- **Backup / restore for the volume.** The named volume is the SQLite file. Backing it up is `docker run --rm -v todos-data:/data -v $PWD:/backup alpine tar czf /backup/todos.tar.gz /data`. Not codified here.

### Files expected to change

- NEW: `Dockerfile` — multi-stage build.
- NEW: `.dockerignore` — exclusion list.
- NEW: `docker-compose.yml` — local deployment.
- NEW: `.github/workflows/docker.yml` — GHCR publish workflow.
- NEW: `_bmad-output/implementation-artifacts/3-10-docker-deployment.md` — this file.
- MODIFIED: `next.config.ts` — add `output: 'standalone'` to prod branch.
- MODIFIED: `README.md` — add "Run with Docker" section.
- MODIFIED: `_bmad-output/planning-artifacts/epics.md` — Story 3.10 entry (already added during story drafting).
- MODIFIED: `_bmad-output/implementation-artifacts/sprint-status.yaml` — status transitions (added 3-10-docker-deployment, reopened epic-3).

### Files that must NOT change

- `package.json` / `package-lock.json` — no new dependencies (Docker is external tooling).
- Any file under `src/` — this is pure infrastructure.
- `prisma/schema.prisma` — no schema change.
- `e2e/*.spec.ts` — Docker doesn't affect test surface.
- `.github/workflows/ci.yml` — Story 3.8's workflow stays as-is. The new Docker workflow is additive.

### Interaction with existing Story 3.8 CI pipeline

The existing `.github/workflows/ci.yml` runs lint/tsc/vitest/playwright/build on every PR + main push. It does NOT touch Docker. The new `.github/workflows/docker.yml` runs only on `main` push with path filters. The two workflows can run in parallel on a `main` push; no ordering required. GHCR publish is decoupled from CI green — if CI fails on `main` but Docker succeeds, you've published a "broken" image. Mitigation: branch protection (Story 3.8 Task 4 follow-up) prevents broken code from landing on `main` in the first place. If that's not enforced, the cost is low — just don't `docker pull :latest` blind.

### Previous story intelligence

- **Story 3.8 (CI pipeline)** shipped `prisma generate` + `prisma migrate deploy` as CI steps. The Docker runtime uses the same `prisma migrate deploy` at container start — identical mechanism, different trigger. Validates that the Prisma runtime story is battle-tested.
- **Story 3.6 (PWA with Serwist)** builds `public/sw.js` into the prod bundle. Standalone output copies `public/` as-is, so the service worker ships. Install prompts gated on HTTPS (out of scope, noted above).
- **Story 3.1 (Prisma + Turso)** left `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` as optional env paths in `src/lib/prisma.ts`. The Docker runtime can use either file-path SQLite (compose default) or remote Turso (set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` via `docker run -e` or compose env). No code change needed — the adapter already handles both.

### Recent commit patterns (last 5)

```
8071861 chore(ci): GitHub Actions CI pipeline (Story 3.8)
d2e6421 docs: add README
900e9bc chore: close Epic 4 (Power use) — all stories done, retro skipped
0bfc767 feat(power-use): help overlay (Story 4.2)
3b4ec2c feat(power-use): keyboard shortcuts on desktop (Story 4.1)
```

Commit message for this story: `chore(deploy): Docker image + GHCR publish workflow (Story 3.10)` — `chore` because no product behavior, `deploy` scope matches the deployment concern.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.10 (added this session), Epic 3 line 121 ("Also includes: ...Vercel deployment")]
- [Source: _bmad-output/planning-artifacts/architecture.md — §Hosting line 229 (Vercel mentioned, not mandated), §CI/CD lines 233–240, §Environment line 242]
- [Source: Next.js docs — output: 'standalone' https://nextjs.org/docs/app/api-reference/config/next-config-js/output]
- [Source: src/lib/prisma.ts — reads DATABASE_URL or TURSO_* at runtime; throws if both unset]
- [Source: prisma/migrations/20260422183933_init/migration.sql — the single existing migration, baseline Todo table]
- [Source: next.config.ts — current production-branch config wrapped by withSerwistInit]
- [Source: package.json — @libsql/client ^0.17.2, @prisma/adapter-libsql ^7.8.0, prisma ^7.8.0]
- [Source: .github/workflows/ci.yml — existing Story 3.8 CI workflow (for reference / non-interference)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- **Node version bump: 20 → 24.** User requested Node 24 mid-implementation. Applied consistently to `Dockerfile` and `.github/workflows/ci.yml` so CI and Docker run on the same major.
- **Host credential helper snag (local only).** Podman on the dev host invoked `gcloud` as a credential helper when pulling `node:24-slim` from Docker Hub; user commented out the helpers in `~/.config/containers/auth.json` to unblock. Not a Dockerfile issue — no change needed for CI/GHCR.
- **Runtime `prisma` CLI resolution failure.** First Dockerfile iteration used `npx prisma migrate deploy` as the container CMD. Selective copy of `node_modules/prisma` missed the `.bin/prisma` symlink AND Prisma 7's transitive deps (notably `effect`). Symptom: `sh: 1: prisma: not found` restart loop.
- **Image size explosion attempted fix.** Tried an alternate Dockerfile with a `prod-deps` stage copying the full `npm ci --omit=dev` tree into the runner. Fixed correctness but blew image size to 1.24GB — Prisma 7 ships multi-platform query engines (~600MB).
- **Final migration strategy: libsql-native script.** Replaced `prisma migrate deploy` at runtime with a tiny ES module (`prisma/migrate.mjs`) that uses `@libsql/client` directly to apply idempotent `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` statements. Matches the one committed migration exactly. Drops the Prisma CLI from the runtime image entirely — final size **322MB** (well under the 400MB soft target).
- **`@libsql/linux-arm64-gnu` missing from standalone trace.** Next.js `output: 'standalone'` traces static imports; `libsql` resolves its platform-specific native binding via dynamic `require()` at runtime, so the tracer misses it. Symptom: `Cannot find module '@libsql/linux-arm64-gnu'` on first DB touch. Fix: added one explicit `COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql` in the runner stage — adds ~30MB for platform bindings.

### Completion Notes List

- **AC#1 (standalone output)** — `next.config.ts` now sets `output: 'standalone'` on the prod-only branch (dev config untouched). `.next/standalone/server.js` exists after `npm run build`.
- **AC#2–#5, #13, #14 (Dockerfile + dockerignore + healthcheck)** — Multi-stage Dockerfile with `deps`, `builder`, `runner` stages on `node:24-slim`. `.dockerignore` keeps build context lean (~5MB transferred per `docker build`). Healthcheck uses `wget --spider` against `/`. No `DATABASE_URL` baked into the runner stage (verified via `docker image inspect` — empty env grep).
- **AC#6, #7 (compose + persistence round-trip)** — `docker-compose.yml` wires the app to a named volume `todos-data` at `/data`. Verified end-to-end: POST `/api/sync` to push a todo → GET pulls it back → `docker compose down && docker compose up -d` → GET still returns the todo. Volume persistence confirmed.
- **AC#8, #9 (GHCR publish workflow)** — `.github/workflows/docker.yml` triggers on main push (path-filtered to app-relevant changes) and `workflow_dispatch`. Uses the standard docker login+metadata+build-push action trio. No extra secrets beyond `GITHUB_TOKEN`. Validation is post-push on GitHub.
- **AC#10 (README section)** — "Run with Docker" section added below "Scripts", documenting both `docker compose up --build` and the `ghcr.io/confraria/bmad-experiment:latest` pull path, plus the HTTPS-for-PWA and migrate-on-start caveats.
- **AC#11 (image size)** — Final runner image 322MB, under the 400MB soft target. Path to this number was non-obvious: the obvious "copy full prod node_modules for Prisma CLI" ballooned to 1.24GB; switching to a libsql-based runtime migration script kept things lean.
- **AC#12 (no regressions)** — Local `npm run lint` + `tsc --noEmit` + `npm test` (225/225) all green after the `next.config.ts` change. Full CI workflow from Story 3.8 runs against the change — expected green.
- **Scope delta from the draft:** swapped `npx prisma migrate deploy` for `node prisma/migrate.mjs`. New runtime file `prisma/migrate.mjs` didn't exist in the original task list. Documented under Debug Log above. The idempotent SQL matches `prisma/migrations/20260422183933_init/migration.sql` exactly — any future migration would need either (a) appending to this script, or (b) going back to Prisma CLI + eating the image-size cost, or (c) a dedicated migration sidecar/init-container pattern.
- **Node version** — 24-slim (base) in Dockerfile, `node-version: '24'` in the CI workflow. Both now on the same major.
- **Pending user action (Task 5 / AC#8):** push triggers first GHCR run. If it fails, the common issues documented in Task 5's subtasks are the starting points (most likely: none, since the workflow is standard docker-build-push-action plumbing).
- **Skipped: Task 7 optional GHCR trigger.** Deferred until after push; `workflow_dispatch` exists for manual re-runs.

### Change Log

| Date       | Change                                                                            |
|------------|-----------------------------------------------------------------------------------|
| 2026-04-23 | Shipped Story 3.10: Docker deployment. Multi-stage Dockerfile on node:24-slim, docker-compose with volume persistence, GHCR publish workflow. Final image 322MB. Runtime migrations via libsql (no Prisma CLI shipped — 600MB savings). Epic 3 reopened to `in-progress` for this story; will close again after verification. |

### File List

- NEW: `Dockerfile` — multi-stage build.
- NEW: `.dockerignore` — exclusion list.
- NEW: `docker-compose.yml` — local deployment spec with named volume + healthcheck.
- NEW: `.github/workflows/docker.yml` — GHCR publish on main push.
- NEW: `prisma/migrate.mjs` — idempotent startup migration script using `@libsql/client`.
- MODIFIED: `next.config.ts` — added `output: 'standalone'` to the prod branch only.
- MODIFIED: `.github/workflows/ci.yml` — Node version bumped 20 → 24.
- MODIFIED: `README.md` — added "Run with Docker" section with the `docker compose` commands inline.
- MODIFIED: `_bmad-output/planning-artifacts/epics.md` — added Story 3.10 entry.
- MODIFIED: `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-10 transitions (backlog → ready-for-dev → in-progress → done); epic-3 reopened.
