# Story 3.2: Sync pull endpoint (GET /api/sync)

Status: done

## Story

As a developer,
I want a `GET /api/sync` endpoint that returns all todos for a given `clientId` updated since a timestamp,
so that clients can pull server changes on startup and periodically.

## Acceptance Criteria

1. **Happy path returns all newer todos, soft-deletes included.** Given a request `GET /api/sync?clientId=<ULID>&since=<ms>`, when Zod validates the query params successfully, then the response is HTTP 200 with JSON body `{ todos: Todo[] }` containing every row where `clientId` matches and `updatedAt > since` — including rows with `deletedAt != null`.

2. **`since=0` performs a full initial sync.** Given a request `GET /api/sync?clientId=<ULID>&since=0`, when the handler runs, then it returns every todo for that `clientId` regardless of age (deleted ones included).

3. **No rows for unknown `clientId`.** Given a `clientId` that has never written to the server, when the handler runs, then the response is HTTP 200 with `{ todos: [] }` — NOT a 404.

4. **`BigInt` → `number` conversion at the boundary.** Given Prisma returns `createdAt`/`updatedAt`/`deletedAt` as `bigint`, when the handler serialises the response, then every timestamp is converted to `number` (via `Number(v)`) so the JSON matches the client `Todo` type (`src/lib/schema.ts`) — no `BigInt` serialisation errors and no ISO strings.

5. **Invalid query params return 400 with typed error.** Given a request with a missing, malformed, or non-ULID `clientId`, OR a missing / negative / non-integer `since`, when Zod validation fails, then the response is HTTP 400 with body `{ error: { code: "INVALID_REQUEST", message: string } }`. No stack trace, no raw Zod dump.

6. **Server errors return 500 with generic message.** Given Prisma throws (e.g., DB unreachable), when the handler's catch-all runs, then the response is HTTP 500 with body `{ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }`. The original error is `console.error`'d server-side only — never leaked to the response.

7. **Unit tests cover validation + handler.** Given the route handler is exported, when `npm test` runs, then Vitest tests cover: (a) valid request returns sorted todos, (b) `since=0` returns all, (c) unknown `clientId` returns `[]`, (d) soft-deleted rows are included, (e) invalid `clientId` → 400, (f) missing `since` → 400, (g) Prisma throw → 500.

8. **No regressions.** Given the existing frontend flows, when this story lands, then all existing Vitest and Playwright tests still pass; `npm run lint`, `npx tsc --noEmit`, and `npm run build` succeed.

## Tasks / Subtasks

- [x] **Task 1 — Add query schema to `src/lib/schema.ts`** (AC: #1, #2, #5)
  - [x] Append the following export to `src/lib/schema.ts`:
    ```ts
    export const SyncPullQuerySchema = z.object({
      clientId: ulid(),
      since: z.coerce.number().int().nonnegative(),
    });

    export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;
    ```
  - [x] `z.coerce.number()` is needed because `URLSearchParams` returns strings. `.int().nonnegative()` rejects floats and negatives.
  - [x] Keep `TodoSchema` and the `ulid()` helper untouched — they are already correct and shared with the client.
  - [x] Add a sibling unit test in `src/lib/__tests__/schema.test.ts` for the new schema: valid input, missing fields, bad ULID, negative `since`, float `since`.

- [x] **Task 2 — Create `src/app/api/sync/route.ts`** (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create the directory if it does not exist: `src/app/api/sync/`.
  - [x] Write the handler:
    ```ts
    import { NextRequest } from 'next/server';
    import { z } from 'zod';
    import { prisma } from '@/lib/prisma';
    import { SyncPullQuerySchema, type Todo } from '@/lib/schema';

    export const dynamic = 'force-dynamic';
    export const runtime = 'nodejs';

    export async function GET(req: NextRequest) {
      try {
        const params = SyncPullQuerySchema.parse({
          clientId: req.nextUrl.searchParams.get('clientId'),
          since: req.nextUrl.searchParams.get('since'),
        });

        const rows = await prisma.todo.findMany({
          where: {
            clientId: params.clientId,
            updatedAt: { gt: BigInt(params.since) },
          },
          orderBy: { updatedAt: 'asc' },
        });

        const todos: Todo[] = rows.map((r) => ({
          id: r.id,
          clientId: r.clientId,
          text: r.text,
          completed: r.completed,
          createdAt: Number(r.createdAt),
          updatedAt: Number(r.updatedAt),
          deletedAt: r.deletedAt === null ? null : Number(r.deletedAt),
        }));

        return Response.json({ todos });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return Response.json(
            { error: { code: 'INVALID_REQUEST', message: err.issues[0]?.message ?? 'Invalid request' } },
            { status: 400 },
          );
        }
        console.error('GET /api/sync failed:', err);
        return Response.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        );
      }
    }
    ```
  - [x] **Why `runtime = 'nodejs'`:** the Prisma + `@libsql/client` adapter does not run on the edge runtime. Force Node.
  - [x] **Why `dynamic = 'force-dynamic'`:** route-handlers with query params should never be statically cached by Next.
  - [x] **Why `orderBy: { updatedAt: 'asc' }`:** gives the client a deterministic pull order; aids debugging and makes the response stable for tests.
  - [x] **Why `gt` (strict) not `gte`:** the client passes `since` = last-seen `updatedAt`; using `gt` prevents re-pulling the last-seen row.
  - [x] **Why no envelope wrapping:** architecture §Format Patterns mandates `{ todos: Todo[] }` — direct payload, no `{ data: ... }`.

- [x] **Task 3 — Unit tests for the route handler** (AC: #7)
  - [x] Create `src/app/api/sync/__tests__/route.test.ts`. Follow the project convention of `__tests__/` folders (existing pattern in `src/lib/__tests__/` and `src/components/__tests__/`).
  - [x] Mock Prisma at the module level:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { NextRequest } from 'next/server';

    const mockFindMany = vi.fn();
    vi.mock('@/lib/prisma', () => ({
      prisma: { todo: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
    }));

    // Import AFTER vi.mock so the module uses the mock
    const { GET } = await import('@/app/api/sync/route');

    function makeReq(qs: string) {
      return new NextRequest(`http://localhost/api/sync?${qs}`);
    }

    beforeEach(() => mockFindMany.mockReset());
    ```
  - [x] Test cases:
    - Valid request with one row → 200, `todos` array with `number` timestamps (verify `typeof todo.createdAt === 'number'`).
    - `since=0` → passes `BigInt(0)` to Prisma (assert on `mockFindMany.mock.calls[0][0].where.updatedAt.gt === 0n`).
    - Unknown `clientId` (mock returns `[]`) → 200, `{ todos: [] }`.
    - Soft-deleted row (`deletedAt: 123n`) → included in response, `deletedAt === 123` (number).
    - Invalid `clientId` (e.g., `"not-a-ulid"`) → 400, body `{ error: { code: 'INVALID_REQUEST', ... } }`.
    - Missing `since` → 400.
    - Negative `since` (`-5`) → 400.
    - Float `since` (`1.5`) → 400.
    - Prisma throws → 500, body `{ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }`, and the original error is NOT in the response.
  - [x] Use a valid ULID for the `clientId` fixture — reuse the existing `ULID_REGEX` or hard-code a known-good one like `01HZY9K3X4W2V6N7M8P9Q0R1S2`.

- [x] **Task 4 — Regression sweep** (AC: #8)
  - [x] `npm test` — new tests pass; existing tests unaffected. **117/117 pass.**
  - [x] `npm run test:e2e` — Playwright unchanged (no E2E coverage added in this story; deferred to Story 3.4 when the client sync engine ships). **34/34 pass, 10 skipped.**
  - [x] `npm run lint`. **Clean.**
  - [x] `npx tsc --noEmit`. **Clean.**
  - [x] `npm run build` — Next.js must compile the new route. A bundling error here usually means `prisma.ts` leaked into a Client Component import graph. **Build succeeds; `/api/sync` routes as `ƒ (Dynamic)`.**

## Dev Notes

### This story is server-only; do not touch the client

No UI, no Dexie, no Zustand, no Playwright spec. The endpoint exists but nothing consumes it yet. Story 3.4 wires the client sync engine; resist the urge to reach into `src/components/` or `src/lib/db.ts`.

### `BigInt` ↔ `number` conversion contract (from Story 3.1)

Prisma returns `bigint` for all timestamp columns. The wire format is JSON `number` (ms-epoch). The conversion happens *only* at this HTTP boundary:

- **DB row → response:** `Number(row.createdAt)` — safe because `Date.now()` stays well within `Number.MAX_SAFE_INTEGER` (9.007 × 10¹⁵) for ~285,000 years.
- **Request → DB query:** `BigInt(params.since)` when passing to Prisma `where` clauses.

**Do not** extend the shared `TodoSchema` in `schema.ts` with `bigint` — keep it `z.number()`. The client never sees `bigint` and shouldn't have to.

### Why Zod validates `since` with `coerce.number()`

`req.nextUrl.searchParams.get('since')` returns `string | null`. `z.coerce.number()` converts the string to a number before validation. For invalid input like `"abc"` the coercion produces `NaN` which `.int()` rejects, yielding a clean 400. Do not pre-parse with `parseInt` — let Zod own the boundary.

### Soft-deleted rows MUST be returned in pulls

The client needs the `deletedAt` timestamp to reconcile its own state — if the server omitted soft-deletes, a device that deleted a todo on another device would never learn about it. Architecture §Sync conflict resolution: "Soft-deletes win against concurrent updates." This only works if the server tells the client about them.

### No rate limiting in v1

Architecture §Gap Analysis §1 explicitly dropped edge rate limiting for v1 ("premature for single-user dogfood"). Do NOT add an Upstash dependency or edge middleware. Observability comes from structured logs with `clientId`.

### Error response shape is fixed

Architecture §Format Patterns §Error mandates `{ error: { code: string, message: string } }`. The two codes used here:
- `INVALID_REQUEST` — any 4xx from Zod validation.
- `INTERNAL_ERROR` — any uncaught error (mapped to 500).

Do not invent new codes in this story. Story 3.3 will add `INVALID_PAYLOAD` for POST; cross-story standardisation happens there.

### `export const runtime = 'nodejs'`

Next.js 16 supports both `edge` and `nodejs` runtimes for route handlers. `@prisma/adapter-libsql` uses Node APIs (`fs` for file: URLs, long-lived connections). Forcing `nodejs` prevents Vercel from accidentally deploying the handler to the edge where Prisma would fail to initialise.

### `export const dynamic = 'force-dynamic'`

Next.js aggressively caches route handlers by default. Sync pulls must never serve stale data, so force dynamic rendering. This also avoids a subtle class of bugs where Next tries to statically render a route that reads `req.nextUrl.searchParams`.

### Testing pattern notes

- **Vitest mocks are module-scoped**: `vi.mock('@/lib/prisma', ...)` must appear before the `await import('@/app/api/sync/route')`. `vi.mock` is hoisted by Vitest, but using dynamic `import()` makes the order explicit and avoids surprises.
- **`NextRequest` in jsdom**: Vitest's `jsdom` environment provides `fetch`/`Request`/`URL`. `NextRequest` extends the web `Request` class; instantiating it with `new NextRequest('http://localhost/api/sync?...')` works without a running server.
- **Project convention is `__tests__/` folders** — follow the established pattern even though architecture.md §337 says "No `__tests__/` directories". The project drifted; existing `src/lib/__tests__/` and `src/components/__tests__/` are canonical.

### Files expected to change

- `src/lib/schema.ts` — append `SyncPullQuerySchema` + `SyncPullQuery` type
- `src/lib/__tests__/schema.test.ts` — add test block for the new schema
- `src/app/api/sync/route.ts` — NEW
- `src/app/api/sync/__tests__/route.test.ts` — NEW
- `_bmad-output/implementation-artifacts/3-2-sync-pull-endpoint-get-api-sync.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

### Files that must NOT be changed

- `src/lib/prisma.ts` — the Story 3.1 singleton is complete; do not touch it
- `prisma/schema.prisma` — no schema changes in this story
- `src/lib/db.ts` — client-side Dexie; irrelevant here
- `src/components/` — no UI work in this story
- `e2e/*.spec.ts` — no E2E coverage yet (Story 3.4)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — §API & Communication Patterns, §Format Patterns (response/error shape), §Data Architecture (BigInt), §Gap Analysis §1 (rate-limiting deferred)]
- [Source: _bmad-output/implementation-artifacts/3-1-prisma-schema-and-turso-connection.md — BigInt conversion contract, Prisma singleton pattern, runtime=nodejs rationale]
- [Source: src/lib/schema.ts — existing `TodoSchema` and `ulid()` helper to reuse]
- [Source: src/lib/prisma.ts — singleton imported by the route handler]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- `z.coerce.number()` initially used for `since`, but it coerces `null` → `0`, allowing missing params through. Switched to `z.string().regex(/^\d+$/).transform(Number).pipe(...)` for strict string-first validation.
- `target: ES2017` in `tsconfig.json` rejects BigInt literals (`0n`). Replaced all `0n` / `123n` forms with `BigInt(0)` / `BigInt(123)` in tests.

### Completion Notes List

- `SyncPullQuerySchema` added to `src/lib/schema.ts` — string-first with regex + transform, rejects missing/negative/float/null cleanly.
- Route handler at `src/app/api/sync/route.ts` with `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. Returns `{ todos: Todo[] }` with `BigInt → number` conversion at the response boundary.
- Error codes: `INVALID_REQUEST` (400) for Zod failures, `INTERNAL_ERROR` (500) for anything else. Root cause `console.error`'d server-side only, never leaked.
- 9 route handler tests (mocked Prisma at module scope via `vi.mock` hoisting); 9 new schema tests. 35/35 new tests green, 117/117 full suite green.
- E2E suite untouched (no client consumer yet; wired in Story 3.4).
- Build confirms `/api/sync` routes as `ƒ (Dynamic)` — no edge-runtime / Client Component leakage.

### File List

- `src/lib/schema.ts` — MODIFIED: added `SyncPullQuerySchema` + `SyncPullQuery` type
- `src/lib/__tests__/schema.test.ts` — MODIFIED: added 9 `SyncPullQuerySchema` tests
- `src/app/api/sync/route.ts` — NEW: `GET` handler
- `src/app/api/sync/__tests__/route.test.ts` — NEW: 9 handler tests
- `_bmad-output/implementation-artifacts/3-2-sync-pull-endpoint-get-api-sync.md` — MODIFIED: this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: story status progression
