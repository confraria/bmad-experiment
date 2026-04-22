# Story 3.3: Sync push endpoint (POST /api/sync)

Status: done

## Story

As a developer,
I want a `POST /api/sync` endpoint that accepts a batch of client todo deltas and reconciles them with the server,
so that clients can push local changes with latest-write-wins semantics and soft-delete precedence.

## Acceptance Criteria

1. **Happy path upserts a valid batch.** Given a request `POST /api/sync` with JSON body `{ clientId: <ULID>, todos: Todo[] }` where every todo conforms to `TodoSchema` and every `todo.clientId` equals the top-level `clientId`, when Zod validates and the handler reconciles, then the response is HTTP 200 with body `{ accepted: number }` where `accepted` is the count of rows that were actually written (insert or update).

2. **Latest-write-wins by `updatedAt`.** Given an incoming todo whose `id` matches an existing server row, when neither record is soft-deleted, then the server keeps whichever has the greater `updatedAt`. If `incoming.updatedAt > existing.updatedAt` → overwrite; else → no-op (not counted in `accepted`). Ties resolve to a no-op (existing wins) so identical replays are idempotent.

3. **Soft-delete wins both directions.** Given an incoming todo with `deletedAt !== null`, when it reconciles against any existing row (deleted or not), then the soft-deleted state is persisted regardless of `updatedAt` order. Given an existing row with `deletedAt !== null` and an incoming row with `deletedAt === null`, when they reconcile, then the existing soft-delete persists (the server never "undeletes" on a client push; undeletes must come through a new writeback with `deletedAt: null` AND a higher `updatedAt` — which the rule above rejects).

4. **Cross-client push is rejected.** Given a request where any `todo.clientId !== body.clientId`, when Zod validates, then the response is HTTP 400 with `{ error: { code: "INVALID_REQUEST", message: string } }`. No rows are written.

5. **Batch size is bounded.** Given a request with `todos.length > 500`, when Zod validates, then the response is HTTP 400. Given `todos.length === 0`, when the handler runs, then the response is HTTP 200 with `{ accepted: 0 }` (empty batch is legal — lets the client probe connectivity cheaply).

6. **Invalid body returns 400.** Given any malformed body (missing fields, non-ULID, non-array `todos`, bad todo shape, non-JSON payload), when parsing or Zod validation fails, then the response is HTTP 400 with `{ error: { code: "INVALID_REQUEST", message: string } }`. No stack trace, no raw Zod dump.

7. **Server errors return 500.** Given Prisma throws (DB unreachable, transaction abort), when the catch-all runs, then the response is HTTP 500 with `{ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }`. The original error is `console.error`'d server-side only.

8. **Boundary conversions hold.** Given incoming JSON timestamps are `number` (ms-epoch) and Prisma columns are `BigInt`, when the handler writes, then it converts with `BigInt(n)` on the way in. No `bigint` appears in the response body (there is no response body containing timestamps — just `{ accepted: number }`).

9. **Unit tests cover reconciliation logic end-to-end.** Given the POST handler is exported alongside GET, when `npm test` runs, then Vitest tests cover: (a) empty batch → 0 accepted; (b) insert (no existing) → 1 accepted; (c) update where `incoming.updatedAt > existing.updatedAt` → 1 accepted; (d) no-op where `incoming.updatedAt < existing.updatedAt` → 0 accepted; (e) tie on `updatedAt` → 0 accepted (existing wins); (f) incoming `deletedAt` set, existing not deleted, `incoming.updatedAt < existing.updatedAt` → still overwritten → 1 accepted; (g) incoming NOT deleted, existing deleted → no-op → 0 accepted (soft-delete persists); (h) mixed `clientId` rejected → 400; (i) batch of 501 rejected → 400; (j) non-JSON body → 400; (k) Prisma throw → 500.

10. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed.

## Tasks / Subtasks

- [x] **Task 1 — Add body schema to `src/lib/schema.ts`** (AC: #1, #4, #5, #6)
  - [x] Append:
    ```ts
    export const SyncPushBodySchema = z
      .object({
        clientId: ulid(),
        todos: z.array(TodoSchema).max(500, 'batch exceeds 500 todos'),
      })
      .refine((b) => b.todos.every((t) => t.clientId === b.clientId), {
        message: 'todo.clientId must match body.clientId',
        path: ['todos'],
      });

    export type SyncPushBody = z.infer<typeof SyncPushBodySchema>;
    ```
  - [x] Reuse the existing `ulid()` helper and `TodoSchema` — do NOT duplicate ULID regex or redefine the todo shape.
  - [x] `.max(500, ...)` bounds the batch size; `.refine(...)` enforces the cross-client-push rule on every element.
  - [x] Add unit tests in `src/lib/__tests__/schema.test.ts`: valid batch, empty todos, 500 todos (boundary pass), 501 todos (boundary reject), mixed clientId reject, non-ULID clientId reject, malformed todo in array reject.

- [x] **Task 2 — Extend `src/app/api/sync/route.ts` with POST handler** (AC: #1, #2, #3, #6, #7, #8)
  - [ ] Keep the existing GET export untouched. Add:
    ```ts
    import type { Todo } from '@/lib/schema';
    import { SyncPushBodySchema } from '@/lib/schema';

    export async function POST(req: NextRequest) {
      try {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return invalidRequest('body is not valid JSON');
        }
        const body = SyncPushBodySchema.parse(rawBody);

        if (body.todos.length === 0) {
          return Response.json({ accepted: 0 });
        }

        const accepted = await reconcile(body.todos);
        return Response.json({ accepted });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return invalidRequest(err.issues[0]?.message ?? 'Invalid request');
        }
        console.error('POST /api/sync failed:', err);
        return Response.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        );
      }
    }

    function invalidRequest(message: string) {
      return Response.json(
        { error: { code: 'INVALID_REQUEST', message } },
        { status: 400 },
      );
    }
    ```
  - [ ] Refactor the existing GET handler to reuse `invalidRequest(...)` so the two handlers share the error-shape helper (small, local, no new module needed).
  - [ ] Implement `reconcile(todos)` in the same file — keep it private to the route module:
    ```ts
    async function reconcile(todos: Todo[]): Promise<number> {
      const ids = todos.map((t) => t.id);
      return prisma.$transaction(async (tx) => {
        const existingRows = await tx.todo.findMany({ where: { id: { in: ids } } });
        const existingById = new Map(existingRows.map((r) => [r.id, r]));
        let accepted = 0;

        for (const incoming of todos) {
          const existing = existingById.get(incoming.id);
          if (shouldWrite(existing, incoming)) {
            await tx.todo.upsert({
              where: { id: incoming.id },
              create: toDbRow(incoming),
              update: toDbRow(incoming),
            });
            accepted++;
          }
        }
        return accepted;
      });
    }

    function shouldWrite(
      existing: { updatedAt: bigint; deletedAt: bigint | null } | undefined,
      incoming: Todo,
    ): boolean {
      if (!existing) return true;                                // insert
      if (existing.deletedAt !== null && incoming.deletedAt === null) return false; // soft-delete persists
      if (incoming.deletedAt !== null) return true;              // incoming-delete wins
      return incoming.updatedAt > Number(existing.updatedAt);    // LWW (ties → existing wins)
    }

    function toDbRow(t: Todo) {
      return {
        id: t.id,
        clientId: t.clientId,
        text: t.text,
        completed: t.completed,
        createdAt: BigInt(t.createdAt),
        updatedAt: BigInt(t.updatedAt),
        deletedAt: t.deletedAt === null ? null : BigInt(t.deletedAt),
      };
    }
    ```
  - [ ] **Why a transaction:** guarantees the `findMany` snapshot matches the state we decide against. Without it, a concurrent writer could slip between the find and the upsert and invert LWW. SQLite transactions are cheap — no reason not to.
  - [ ] **Why `findMany` + in-memory reconcile instead of per-row `upsert`:** one round trip to fetch all existing rows for the batch, then only `upsert` the winners. Batch of 10 goes from ~20 queries to ~1 + (≤10) = cheaper and clearer.
  - [ ] **Why `upsert` both sides:** the `create` branch handles the "no existing row" case from the initial `shouldWrite` check; the `update` branch handles the winner path. Same row object for both — Prisma lets us pass the same shape.
  - [ ] **Do NOT return the written rows.** The response is `{ accepted: number }` per architecture §Format Patterns. The client already has the data locally; echoing wastes bandwidth.

- [x] **Task 3 — Unit tests for the POST handler** (AC: #9)
  - [ ] In `src/app/api/sync/__tests__/route.test.ts`, add a new `describe('POST /api/sync', ...)` block. Reuse the existing `vi.mock('@/lib/prisma', ...)` setup — just extend the mock shape:
    ```ts
    const mockFindMany = vi.fn();
    const mockUpsert = vi.fn();
    const mockTransaction = vi.fn(async (fn) => fn({
      todo: { findMany: mockFindMany, upsert: mockUpsert },
    }));
    vi.mock('@/lib/prisma', () => ({
      prisma: {
        todo: { findMany: (...a: unknown[]) => mockFindMany(...a) },
        $transaction: (fn: unknown) => mockTransaction(fn),
      },
    }));
    ```
  - [ ] Reset all three mocks in `beforeEach`.
  - [ ] Helper to POST JSON:
    ```ts
    function postReq(body: unknown): NextRequest {
      return new NextRequest('http://localhost/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    ```
  - [ ] Build a `fixtureTodo()` factory that returns a valid `Todo` (reuse the ULID from the GET test file; expose it as a module-local const if needed).
  - [ ] Test cases:
    - Empty `todos: []` → 200, `{ accepted: 0 }`, `mockFindMany` NOT called.
    - Single insert (mock `findMany → []`) → 200, `{ accepted: 1 }`, `mockUpsert` called once with correct `BigInt` conversions.
    - Update where `incoming.updatedAt > existing.updatedAt` → 200, `{ accepted: 1 }`.
    - No-op where `incoming.updatedAt < existing.updatedAt` → 200, `{ accepted: 0 }`, `mockUpsert` NOT called.
    - Tie on `updatedAt` → 200, `{ accepted: 0 }` (idempotent replay).
    - Incoming `deletedAt` set, existing live with higher `updatedAt` → 200, `{ accepted: 1 }` (soft-delete wins).
    - Incoming live, existing deleted → 200, `{ accepted: 0 }` (deletion persists).
    - Mixed `clientId` (one todo's clientId differs from body) → 400, mock untouched.
    - 501 todos → 400.
    - Non-JSON body (raw string `"oops"`) → 400 with message `"body is not valid JSON"`.
    - Missing body fields (e.g., no `todos`) → 400.
    - Prisma throws during `$transaction` → 500 with generic message, original error not leaked.

- [x] **Task 4 — Regression sweep** (AC: #10)
  - [x] `npm test` — all tests pass (existing + new). **137/137 pass.**
  - [x] `npm run test:e2e` — Playwright unaffected. **34/34 pass, 10 skipped.**
  - [x] `npm run lint`. **Clean.**
  - [x] `npx tsc --noEmit`. **Clean.**
  - [x] `npm run build` — `/api/sync` still appears as `ƒ (Dynamic)` and bundles successfully. **Confirmed.**

## Dev Notes

### LWW + soft-delete precedence is a two-rule decision tree

```
shouldWrite(existing, incoming):
  if no existing                         → WRITE (insert)
  if existing.deleted AND incoming.live  → SKIP  (deletion persists)
  if incoming.deleted                    → WRITE (soft-delete wins)
  if incoming.updatedAt > existing       → WRITE (LWW)
  otherwise                              → SKIP  (existing wins, ties included)
```

The order matters: check "existing deleted / incoming live" BEFORE "incoming deleted" so a stale live push against a tombstone is rejected even if the tombstone has a lower `updatedAt` — deletion is sticky.

### Why ties resolve to "existing wins"

Two clients could produce the exact same `updatedAt` if `Date.now()` fires on the same millisecond. Preferring existing makes retries idempotent: the client re-pushes the same row after a network blip, the server reads `tie → skip`, returns `accepted: 0`, nothing flaps. If we preferred incoming, every retry would log a write.

### `BigInt(number)` is safe for ms-epoch

`Date.now()` returns a JS `number` up to ~2⁵³. `BigInt(number)` accepts any integer number and converts faithfully. This is the inverse of the GET handler's `Number(bigint)`. The architecture mandates ms-epoch throughout; never persist ISO strings.

### Transaction semantics for SQLite

`prisma.$transaction(async (tx) => ...)` runs serializable on SQLite — the whole batch is one writer. For a dev-DB that's fine; for Turso, the adapter still wraps the transaction correctly. Do not attempt to parallelize the upserts within the transaction — they must run sequentially to keep the snapshot consistent with our decisions.

### The `accepted` count reflects actual writes

If the client pushes 10 todos and 3 are stale (LWW loser), the response is `{ accepted: 7 }`. This is useful observability: the client can log the ratio as a proxy for conflict rate. Story 3.4's sync engine does NOT use `accepted` for correctness — it just drops the pushed records from its queue after a 2xx regardless of `accepted`. Treat `accepted` as informational.

### Sharing `invalidRequest(...)` between GET and POST

The existing GET handler has its own inline 400 branch. Tidy it to call the new `invalidRequest` helper — small refactor, drops duplication. Do NOT extract the helper to a shared module (`src/lib/errors.ts`) yet; YAGNI until a third caller appears.

### Why no rate limiting

Same as Story 3.2 — architecture §Gap Analysis §1 deferred edge rate limiting for v1. Observability via structured logs with `clientId`.

### Why `todos: z.array(TodoSchema).max(500)`

Prevents a malicious or buggy client from pushing a million-row batch and exhausting the server. 500 is a generous upper bound — a healthy client batches ≤10 per debounce window (Story 3.4). Empty array is allowed (`.min` not set) so the client can probe connectivity.

### Pitfalls to avoid

- **Do NOT issue `prisma.todo.upsert` without the transaction wrapper.** The "read-then-write" LWW decision is racy without it.
- **Do NOT iterate with `Promise.all` inside the transaction.** Some Prisma engines allow parallel queries inside `$transaction(async tx => ...)`, but doing so defeats the snapshot we just fetched — issue the upserts sequentially.
- **Do NOT return the written rows.** Response shape is fixed: `{ accepted: number }`.
- **Do NOT validate a todo against `TodoSchema` a second time in the handler.** Zod already ran at the body boundary; trusting the parsed value avoids duplicate work.
- **Do NOT forget that `incoming.clientId` could still differ from the existing row's `clientId`.** Wait — the server-side DB doesn't enforce this at the schema level. Defensive thought: should we enforce "incoming.clientId === existing.clientId" inside `reconcile`? **No** — v1 has no auth and the cross-client check is enforced at the body level (AC #4). A client cannot push todo X claiming it belongs to client A when the body says client B. Adding a second layer of defense inside `reconcile` is YAGNI for v1.

### Files expected to change

- `src/lib/schema.ts` — append `SyncPushBodySchema` + `SyncPushBody` type
- `src/lib/__tests__/schema.test.ts` — add `SyncPushBodySchema` test block
- `src/app/api/sync/route.ts` — add POST handler, `reconcile()`, helpers; refactor GET to use `invalidRequest`
- `src/app/api/sync/__tests__/route.test.ts` — add POST describe block with 12 test cases and extended prisma mock
- `_bmad-output/implementation-artifacts/3-3-sync-push-endpoint-post-api-sync.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression

### Files that must NOT be changed

- `src/lib/prisma.ts` — Story 3.1 singleton; untouched
- `prisma/schema.prisma` — no schema changes
- `src/lib/db.ts` — client Dexie unaffected (Story 3.4 wires it up)
- `src/components/` — no UI changes
- `e2e/*.spec.ts` — no E2E yet (Story 3.4)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — §API & Communication Patterns (sync conflict resolution, LWW, soft-delete precedence), §Format Patterns (`{ accepted: number }`, error shape), §Gap Analysis §1 (rate-limiting deferred)]
- [Source: _bmad-output/implementation-artifacts/3-1-prisma-schema-and-turso-connection.md — BigInt conversion contract]
- [Source: _bmad-output/implementation-artifacts/3-2-sync-pull-endpoint-get-api-sync.md — error shape, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, Prisma-mock test pattern]
- [Source: src/lib/schema.ts — existing `TodoSchema`, `ulid()`, `SyncPullQuerySchema`]
- [Source: src/app/api/sync/route.ts — existing GET handler to extend]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- First POST test batch failed because fixture `updatedAt` values (e.g., `1_000`) were lower than the default `createdAt` (`1_700_000_000_000`), tripping the `TodoSchema` refinement `updatedAt >= createdAt`. Fixed by making the `todo()` factory default `createdAt` to the (possibly overridden) `updatedAt` minus 0 — i.e., both small by default, with overrides staying consistent.

### Completion Notes List

- `SyncPushBodySchema` in `src/lib/schema.ts` — 500-todo cap via `.max(500)`, cross-client-push rule via `.refine(...)` that checks every element's `clientId` against the body's top-level `clientId`.
- POST handler extends the existing `src/app/api/sync/route.ts`. Shared `invalidRequest`/`internalError` helpers cover both GET and POST error paths. GET was refactored to use them — behavior unchanged, assertions still green.
- `reconcile()` runs inside `prisma.$transaction`: one `findMany` to snapshot existing rows, then sequential `upsert` for winners only. `shouldWrite()` is the 4-rule decision tree: no-existing → write; existing-deleted + incoming-live → skip; incoming-deleted → write; else LWW with tie → existing wins.
- 21 route tests total (9 GET + 12 POST) all mocked at module scope. `$transaction` mock immediately invokes its callback with a fake `tx` object so the reconcile code runs against the mocked methods without real DB contact.
- Final sweep: 137/137 unit tests, 34 Playwright, clean lint/tsc, build emits `ƒ /api/sync` as before.

### File List

- `src/lib/schema.ts` — MODIFIED: added `SyncPushBodySchema` + `SyncPushBody` type
- `src/lib/__tests__/schema.test.ts` — MODIFIED: added 8 `SyncPushBodySchema` tests
- `src/app/api/sync/route.ts` — MODIFIED: added POST handler, `reconcile`, `shouldWrite`, `toDbRow`, shared `invalidRequest`/`internalError` helpers; refactored GET to use the helpers
- `src/app/api/sync/__tests__/route.test.ts` — MODIFIED: extended prisma mock with `$transaction` + `upsert`; added 12 POST test cases
- `_bmad-output/implementation-artifacts/3-3-sync-push-endpoint-post-api-sync.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression
