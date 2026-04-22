# Story 3.1: Prisma schema and Turso connection

Status: done

## Story

As a developer,
I want a Prisma schema that mirrors the Dexie Todo entity, with local SQLite for dev and Turso libSQL for prod,
so that server persistence is ready for the sync engine.

## Acceptance Criteria

1. **Migration creates correct `Todo` table.** Given `prisma/schema.prisma`, when `npx prisma migrate dev` is run, then a `Todo` table is created with fields matching the client Todo (`id`, `clientId`, `text`, `completed`, `createdAt`, `updatedAt`, `deletedAt`), with indexes on `clientId` and `updatedAt`.

2. **Dev singleton reads/writes via local SQLite.** Given a local dev environment, when `DATABASE_URL` points to a local SQLite file (`file:./prisma/dev.db`), then `src/lib/prisma.ts` exposes a singleton Prisma client that reads and writes successfully.

3. **Prod singleton works via libSQL adapter.** Given a production environment on Vercel, when `DATABASE_URL` points to a Turso libSQL URL (starts with `libsql://`), then the same file branches to the libSQL adapter path — verified by TypeScript compilation and code review.

4. **`.env.example` is committed; `.env.local` is git-ignored.** Given the `.gitignore` already contains `.env*`, when `.env.example` is created, then it is force-added to the repo (`git add -f`) and `.env.local` (with the real dev SQLite URL) is never committed.

5. **No regressions.** Given the existing frontend flows, when this story lands, then all existing Vitest and Playwright tests still pass.

## Tasks / Subtasks

- [ ] **Task 1 — Install dependencies** (AC: #1, #2, #3)
  - [ ] Run:
    ```bash
    npm install prisma @prisma/client @libsql/client @prisma/adapter-libsql
    ```
  - [ ] Check the installed `@prisma/client` version (`cat node_modules/@prisma/client/package.json | grep '"version"'`):
    - **Prisma 6.x** (most likely): driver adapters are **stable** — no `previewFeatures` needed in schema.
    - **Prisma 5.x**: add `previewFeatures = ["driverAdapters"]` to the `generator client` block in `schema.prisma`.
  - [ ] Do NOT install `prisma-libsql` (unofficial community package) or `@turso/client`.

- [ ] **Task 2 — Initialise Prisma and write `prisma/schema.prisma`** (AC: #1, #2, #3)
  - [ ] Run `npx prisma init --datasource-provider sqlite`. This creates `prisma/schema.prisma` and appends `DATABASE_URL` to `.env` — delete the generated `.env` file immediately (`.env.local` is used instead).
  - [ ] Overwrite `prisma/schema.prisma` with:
    ```prisma
    generator client {
      provider = "prisma-client-js"
      // Remove the line below if Prisma 6+ is installed (driver adapters are stable):
      // previewFeatures = ["driverAdapters"]
    }

    datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
    }

    model Todo {
      id        String  @id
      clientId  String
      text      String
      completed Boolean @default(false)
      createdAt BigInt
      updatedAt BigInt
      deletedAt BigInt?

      @@index([clientId])
      @@index([updatedAt])
    }
    ```
  - [ ] **Why `BigInt` for timestamps?** The architecture mandates "numeric ms-epoch throughout". `Date.now()` returns a 13-digit millisecond value (~1.7 × 10¹²) which exceeds the 32-bit `Int` range (max ~2.1 × 10⁹). Prisma's `BigInt` maps to SQLite's 64-bit `INTEGER`, the generated TypeScript type is `bigint`. The sync API (Stories 3.2/3.3) converts at the boundary: `Number(row.createdAt)` → client, `BigInt(todo.createdAt)` → DB write.
  - [ ] **Field name convention:** camelCase throughout (per architecture). No `@map` annotations needed.
  - [ ] Run `npx prisma validate` — must pass with no errors before proceeding.

- [ ] **Task 3 — Run initial migration** (AC: #1)
  - [ ] Create `.env.local` at the repo root with:
    ```
    DATABASE_URL="file:./prisma/dev.db"
    ```
  - [ ] Run:
    ```bash
    npx prisma migrate dev --name init
    ```
    This creates `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql` and applies it to `prisma/dev.db`.
  - [ ] Verify `prisma/dev.db` is created (SQLite file).
  - [ ] Add `prisma/dev.db` and `prisma/*.db` to `.gitignore` — database files must never be committed.
  - [ ] Commit the generated `prisma/migrations/` directory — migration history is committed (per architecture).
  - [ ] Run `npx prisma generate` to generate the Prisma client types into `node_modules/.prisma/client/`.

- [ ] **Task 4 — Create `src/lib/prisma.ts` singleton** (AC: #2, #3)
  - [ ] Create `src/lib/prisma.ts`:
    ```ts
    import { PrismaClient } from '@prisma/client';
    import { PrismaLibSQL } from '@prisma/adapter-libsql';
    import { createClient } from '@libsql/client';

    declare global {
      // eslint-disable-next-line no-var
      var __prisma: PrismaClient | undefined;
    }

    function makePrismaClient(): PrismaClient {
      const url = process.env.DATABASE_URL ?? '';
      if (url.startsWith('libsql')) {
        const libsql = createClient({ url });
        const adapter = new PrismaLibSQL(libsql);
        return new PrismaClient({ adapter });
      }
      return new PrismaClient();
    }

    export const prisma = globalThis.__prisma ?? makePrismaClient();

    if (process.env.NODE_ENV !== 'production') {
      globalThis.__prisma = prisma;
    }
    ```
  - [ ] The `globalThis.__prisma` singleton pattern prevents multiple Prisma instances during Next.js hot-reload in development (standard Next.js best practice).
  - [ ] The `libsql` branch is taken when `DATABASE_URL` starts with `libsql://` or `libsql+wss://` (Turso URL formats). The `file:` branch uses Prisma's native SQLite driver — no adapter needed.
  - [ ] This file is **server-only**: never import `prisma.ts` from a client component (`'use client'`). API route handlers and Server Components are the only callers.
  - [ ] Run `npx tsc --noEmit` — singleton must compile cleanly.

- [ ] **Task 5 — Create `.env.example` and add `.gitignore` entries** (AC: #4)
  - [ ] Create `.env.example` at repo root:
    ```
    # Local dev — SQLite file (git-ignored)
    # DATABASE_URL="file:./prisma/dev.db"

    # Production — Turso libSQL (embed authToken in URL or use separate TURSO_AUTH_TOKEN)
    # DATABASE_URL="libsql://<db-name>.turso.io?authToken=<token>"
    DATABASE_URL="file:./prisma/dev.db"
    ```
  - [ ] Force-add `.env.example` to git (the existing `.gitignore` has `.env*` which would otherwise ignore it):
    ```bash
    git add -f .env.example
    ```
  - [ ] Append to `.gitignore`:
    ```
    # Prisma local databases
    prisma/*.db
    prisma/*.db-journal
    ```
  - [ ] Confirm `.env.local` is NOT tracked: `git status` should not show it.

- [ ] **Task 6 — Verify AC #2 with a smoke test** (AC: #2)
  - [ ] Run the following snippet to confirm the singleton connects and round-trips a write/read/delete against `prisma/dev.db`:
    ```bash
    DATABASE_URL="file:./prisma/dev.db" node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.todo.create({ data: {
      id: 'smoke-test-id',
      clientId: 'smoke-client-id',
      text: 'smoke test',
      completed: false,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
      deletedAt: null,
    }}).then(() => p.todo.findFirst({ where: { id: 'smoke-test-id' }}))
      .then(r => { console.log('OK', r?.text); })
      .then(() => p.todo.delete({ where: { id: 'smoke-test-id' }}))
      .finally(() => p.\$disconnect());
    "
    ```
  - [ ] Expected output: `OK smoke test`. If this fails, debug before proceeding.
  - [ ] This is a one-off verification step — no permanent test file is added for the singleton itself. The first real integration test of the Prisma client comes in Story 3.2's API route handler tests.

- [ ] **Task 7 — Regression sweep** (AC: #5)
  - [ ] `npm test` — all existing Vitest tests must pass (they don't touch Prisma)
  - [ ] `npm run test:e2e` — all Playwright tests must pass
  - [ ] `npm run lint`
  - [ ] `npx tsc --noEmit`
  - [ ] `npm run build`

## Dev Notes

### Prisma version determines whether `previewFeatures` is needed

Check after install:
```bash
node -e "console.log(require('@prisma/client/package.json').version)"
```
- **v6.0+** → `previewFeatures = ["driverAdapters"]` is NOT needed (stable).
- **v5.x** → add `previewFeatures = ["driverAdapters"]` to `generator client {}`.

### `BigInt` for timestamps — the conversion contract

Prisma's `BigInt` generates `bigint` in TypeScript. The existing client `Todo` type uses `number`. At the API boundary (Stories 3.2/3.3), always convert:
- DB → JSON: `Number(row.createdAt)` (safe: ms timestamps fit in JS `Number` precision)
- JSON → DB: `BigInt(todo.createdAt)`

Do NOT change the Zod `TodoSchema` in `schema.ts` — it uses `z.number()` for timestamps and is shared with the client. The Prisma model is server-side only.

### `prisma init` generates an `.env` file — delete it

`npx prisma init` creates a plain `.env` file in the repo root. Delete it immediately. The project uses `.env.local` (Next.js convention, already git-ignored via `.env*` in `.gitignore`).

### `prisma/dev.db` must be git-ignored

The SQLite file is a runtime artifact, not source. Add `prisma/*.db` and `prisma/*.db-journal` to `.gitignore`. The `prisma/migrations/` directory IS committed — this is migration history, not a runtime artifact.

### `.env.example` must be force-added

`.gitignore` contains `.env*` which matches `.env.example`. Use `git add -f .env.example` to force-track it. It contains no secrets — just commented-out templates.

### The singleton pattern

The `globalThis.__prisma` pattern prevents Next.js's hot-reload from creating multiple Prisma client instances (each instance holds connection pool resources). Only active in `NODE_ENV !== 'production'` — in prod, the module is evaluated once per serverless function invocation.

### Do NOT use `@turso/client` or `prisma-libsql`

`@turso/client` — does not exist (the official package is `@libsql/client`).
`prisma-libsql` — unofficial community package; use `@prisma/adapter-libsql` (official).

### Architecture guardrails

1. **`prisma.ts` is server-only.** Never import from a `'use client'` component. API route handlers and Server Components only.
2. **Never rename a Prisma field without a committed migration.** Field renames require a new migration file in the same PR (per architecture guardrail #4).
3. **No authentication in v1.** `clientId` is the only scoping key for this schema.
4. **Numeric timestamps (BigInt), not DateTime.** The architecture mandates ms-epoch everywhere — no ISO strings in the DB.

### Files expected to change

- `package.json` + `package-lock.json` — 3 new dependencies
- `prisma/schema.prisma` — NEW
- `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql` — NEW (generated)
- `prisma/dev.db` — NEW runtime file (git-ignored)
- `src/lib/prisma.ts` — NEW
- `.env.local` — NEW (git-ignored)
- `.env.example` — NEW (force-added)
- `.gitignore` — add prisma db entries
- `_bmad-output/implementation-artifacts/3-1-prisma-schema-and-turso-connection.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

### Files that must NOT be changed

- `src/lib/schema.ts` — Zod schemas are shared client/server; do not add Prisma-specific types here
- `src/lib/db.ts` — Dexie client; no changes needed
- `src/components/` — no UI changes
- `src/app/` — no Next.js routes yet (that's Stories 3.2/3.3)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Database section; Prisma schema; API Patterns; scaffold step #6; AI Agent Guardrails]
- [Source: src/lib/schema.ts — Zod Todo type (field names and types to mirror in Prisma)]
- [Source: src/lib/db.ts — Dexie schema (indexes: clientId, updatedAt, completed)]
- [Source: .gitignore — `.env*` pattern that requires force-add for `.env.example`]
