# Story 3.4: Client sync engine with offline queue

Status: done

## Story

As a user,
I want my todos to sync across my devices in the background without me ever seeing a spinner,
so that I can trust the data and never wait.

## Acceptance Criteria

1. **Initial pull on mount.** Given the app mounts and `useSync()` runs its effect, when the engine initializes, then it issues `GET /api/sync?clientId=<ULID>&since=<lastSyncAt>` (with `lastSyncAt` read from `localStorage`, defaulting to `0`), merges the response into Dexie, and advances `lastSyncAt` to the maximum `updatedAt` across the merged rows (or keeps the previous value if the response is empty).

2. **Merge applies LWW + soft-delete precedence locally.** Given an inbound todo from the server, when the engine merges it into Dexie, then the same 4-rule decision tree from Story 3.3 applies locally: no-existing → write; existing-deleted + incoming-live → skip; incoming-deleted → write; else `incoming.updatedAt > existing.updatedAt` → write (ties → skip). The merge writes raw rows via `db.todos.put()` (NOT via `putTodo`/`updateTodo` which would rewrite `updatedAt`).

3. **Push on local mutation.** Given any call to `putTodo` / `updateTodo` / `softDeleteTodo` in `src/lib/db.ts`, when the mutation commits to Dexie, then `db.ts` dispatches a `bmad:mutation` `CustomEvent` on `window`. The engine listens for this event and calls `scheduleSync()` — a 300 ms debounced tick.

4. **Push batches new local changes.** Given a sync tick runs, when the engine builds the push batch, then it reads every todo from Dexie with `updatedAt > lastPushAt`, caps the batch at 500, and issues `POST /api/sync` with `{ clientId, todos }`. On HTTP 200, it advances `lastPushAt` to the maximum `updatedAt` across the sent batch, persists it to `localStorage`, and — if more todos remain above the new `lastPushAt` — schedules another tick immediately.

5. **No-op when there is nothing to push.** Given a sync tick runs but there are no todos with `updatedAt > lastPushAt`, when the engine checks, then it does NOT issue a POST. (It still performs pulls if `scheduleSync()` was called from an online-recovery event — but for the plain "local mutation → debounce → nothing-to-push" path, skip silently.)

6. **Offline = skip outbound.** Given `navigator.onLine === false`, when a sync tick fires, then the engine performs neither a pull nor a push — it returns silently. Subsequent mutations still dispatch `bmad:mutation`; the event listener re-debounces harmlessly.

7. **Exponential backoff on transient failures.** Given a pull or push fails with a network error, timeout, HTTP 5xx, or HTTP 429, when the engine retries, then it uses delays `2s, 4s, 8s, 16s, 30s` (cap at 30 s) for attempts 1–5. After 5 failed attempts it abandons this tick (the queue is preserved via `lastPushAt` not advancing; the next mutation or page reload triggers another tick).

8. **4xx other than 429 drops the batch.** Given a push fails with HTTP 4xx other than 429, when the engine handles it, then it logs a structured error (`console.error('sync: dropping batch', { status, batchIds, message })` for v1 — Story 3.7 wires `/api/errors`), advances `lastPushAt` past the batch's max `updatedAt` (so the bad batch does not retry), and continues with any remaining todos.

9. **Never disturb the UI.** Given any sync operation (success, retry, abandon), when the engine runs, then it never mutates Zustand, never opens a toast, never logs to `console.log`, and never blocks any user-facing promise. The user sees nothing. (Architecture §AI Agent Guardrails #1: "Never introduce a spinner for a local operation.")

10. **`useSync()` wires the engine to the React tree.** Given `src/hooks/useSync.ts` is imported into `TodoApp.tsx` and called at the top of the component, when the component mounts, then the engine starts; when it unmounts, the engine stops (cancels pending timers, detaches the event listener). The hook returns nothing.

11. **Unit tests cover the engine end-to-end.** Given Vitest + `fake-indexeddb` + mocked `fetch`, when `npm test` runs, then tests cover: (a) initial pull merges server rows; (b) LWW + soft-delete precedence on merge; (c) debounced push after a mutation; (d) push uses `lastPushAt` as the lower bound; (e) nothing-to-push skips the POST; (f) offline skips both calls; (g) exponential backoff on 5xx; (h) 429 retries; (i) 400 drops the batch and advances `lastPushAt`; (j) merge does NOT cause a re-push (no feedback loop).

12. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed. No Playwright specs are added in this story — sync is too timing-sensitive for reliable E2E; Story 3.5/3.6 cover the user-visible signals.

## Tasks / Subtasks

- [x] **Task 1 — Add a mutation event to `src/lib/db.ts`** (AC: #3)
  - [x] After each successful write (`putTodo`, `updateTodo`, `softDeleteTodo`), dispatch a `bmad:mutation` event:
    ```ts
    function notifyMutation() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bmad:mutation'));
      }
    }
    ```
    Call `notifyMutation()` at the end of each mutation function (inside the transaction's `.then`, or after `await db.todos.put(...)` returns).
  - [x] Do NOT import from `sync.ts` — this is deliberately decoupled to avoid a circular-import graph.
  - [x] Extend `src/lib/__tests__/db.test.ts` with a test per mutation verifying the event fires exactly once on success. Use `vi.spyOn(window, 'dispatchEvent')` and assert the `detail`-less `CustomEvent` with `type === 'bmad:mutation'`.
  - [x] Verify the existing db tests still pass after the addition.

- [x] **Task 2 — Create `src/lib/sync.ts` — the engine** (AC: #1, #2, #4, #5, #6, #7, #8, #9)
  - [x] Public API:
    ```ts
    export function startSync(): void;     // attach listener, kick off initial pull, idempotent
    export function stopSync(): void;      // detach listener, cancel timers, idempotent
    export function scheduleSync(): void;  // debounce 300 ms, then run a tick
    export function syncNow(): Promise<void>; // for tests — await a full tick without debounce
    ```
  - [x] Internal state (module-level, like the Zustand timer pattern in Story 2.3):
    ```ts
    let listenerAttached = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let inflight: Promise<void> | null = null;
    ```
  - [x] `localStorage` keys:
    - `bmad:lastSyncAt` — number (ms epoch), last successfully merged pull cursor
    - `bmad:lastPushAt` — number (ms epoch), last successfully pushed upper bound
    Helpers: `readCursor(key)` → `number` (default 0 on parse failure or unavailability), `writeCursor(key, value)` → `void` (try/catch; ignore storage failures).
  - [x] `startSync()`:
    1. If `listenerAttached`, return (idempotent).
    2. Attach `window.addEventListener('bmad:mutation', scheduleSync)`.
    3. Attach `window.addEventListener('online', scheduleSync)` (so the engine flushes when Story 3.5's offline→online transition fires).
    4. Fire an initial `scheduleSync()` to trigger the startup pull/push.
    5. Set `listenerAttached = true`.
  - [x] `stopSync()`: reverse of the above — detach listeners, clear `debounceTimer`, reset flags. Do NOT cancel an `inflight` promise; let it settle.
  - [x] `scheduleSync()`: clear pending timer, `setTimeout(runTick, 300)`.
  - [x] `runTick()` (private):
    1. If `inflight`, return (don't interleave).
    2. If `typeof navigator !== 'undefined' && !navigator.onLine`, return.
    3. `inflight = doTick(); await inflight; inflight = null;`
  - [x] `doTick()` (private):
    1. `await pull()` with backoff.
    2. `await push()` with backoff (loops while more todos remain above the advanced `lastPushAt`, up to a safety limit of 10 batches per tick to prevent infinite loops).
  - [x] `pull()`:
    1. Read `since = readCursor('bmad:lastSyncAt')`.
    2. Fetch `GET /api/sync?clientId=<id>&since=<since>` with retry+backoff (2s, 4s, 8s, 16s, 30s; 5 attempts max; retries on network error, HTTP 5xx, HTTP 429; any other non-2xx aborts the tick silently).
    3. Parse the `{ todos: Todo[] }` body. No-op if empty.
    4. In a single Dexie `rw` transaction, for each server todo run the same `shouldWrite` decision tree as Story 3.3 (copy the function into `sync.ts`; do NOT import from the server route file). If `shouldWrite` returns true, `db.todos.put(serverTodo)` — raw `put`, bypassing `putTodo`/`updateTodo` so `updatedAt` is preserved.
    5. After the transaction, advance `lastSyncAt` to `max(existing, max(serverTodo.updatedAt))`. Also advance `lastPushAt` to `max(existing, max(serverTodo.updatedAt))` so the just-merged rows do not re-push on the next tick (AC #11j — no feedback loop).
  - [x] `push()`:
    1. Read `lastPushAt = readCursor('bmad:lastPushAt')`.
    2. In one Dexie query, `const batch = await db.todos.where('updatedAt').above(lastPushAt).sortBy('updatedAt')`, then `batch.slice(0, 500)`.
    3. If `batch.length === 0`, return.
    4. POST `/api/sync` with `{ clientId, todos: batch }`, retry+backoff as above.
    5. On 2xx: advance `lastPushAt` to `batch.at(-1)!.updatedAt` (not `Date.now()` — avoid losing mutations that landed during the request; see Dev Notes). If `batch.length === 500` and there may be more, recursively call `push()` (with a safety counter to cap at 10 iterations per tick).
    6. On 4xx other than 429: `console.error('sync: dropping batch', { status, ids: batch.map(b => b.id), message })`, advance `lastPushAt` to `batch.at(-1)!.updatedAt`, return. No retry.
  - [x] `backoff(attempt)`: returns a `Promise<void>` resolving after `Math.min(30_000, 2_000 * 2 ** attempt)` ms. Use `setTimeout` — does NOT need to be cancellable for this story.
  - [x] `shouldWrite(existing, incoming)`: copied from `src/app/api/sync/route.ts` (same logic, signatures adapted for local `Todo` with `number` timestamps — NOT `bigint`). Export it so the unit test can call it directly.
  - [x] Client-side type safety: response bodies are untyped from `fetch`. After `res.json()`, validate with `z.object({ todos: z.array(TodoSchema) }).parse(body)`. If validation fails, treat it as a transient error and retry (the server shouldn't return malformed bodies, but defensive parsing keeps the client crash-safe).

- [x] **Task 3 — Create `src/hooks/useSync.ts`** (AC: #10)
  - [x] Tiny React integration:
    ```ts
    'use client';
    import { useEffect } from 'react';
    import { startSync, stopSync } from '@/lib/sync';

    export function useSync(): void {
      useEffect(() => {
        startSync();
        return () => stopSync();
      }, []);
    }
    ```
  - [x] No state, no return value — the hook exists purely for lifecycle binding.

- [x] **Task 4 — Wire `useSync()` into `TodoApp.tsx`** (AC: #10)
  - [x] Add `useSync()` at the top of the `TodoApp` component body (above the JSX return). It runs once on mount.
  - [x] No other changes to `TodoApp.tsx`.

- [x] **Task 5 — Unit tests for `src/lib/sync.ts`** (AC: #11)
  - [x] Create `src/lib/__tests__/sync.test.ts`. Use `vi.useFakeTimers()` for debounce + backoff; use `vi.spyOn(globalThis, 'fetch')` for network mocking; reuse `fake-indexeddb/auto` (already in `vitest.setup.ts`); reset state with `resetDbForTests()` + `window.localStorage.clear()` in `beforeEach`.
  - [x] Set `window.__clientId` to a known ULID in `beforeEach` so `getClientId()` returns a deterministic value (Story 1.2 already supports this override).
  - [x] Test suite structure: one `describe` per behavior, each with a small `arrange → act → assert` block.
  - [x] Test cases:
    1. **Initial pull merges server rows.** Mock `fetch` to return `{ todos: [<server row>] }`. Call `syncNow()`. Assert Dexie now contains the row AND `lastSyncAt` advanced.
    2. **LWW on merge.** Pre-seed Dexie with a row. Mock pull response with a newer `updatedAt`. After `syncNow()`, Dexie has the server version.
    3. **Soft-delete precedence on merge.** Pre-seed Dexie with a deleted row. Mock pull response with an older live version of same id. After `syncNow()`, Dexie still has the deleted row (skip).
    4. **Debounced push after a mutation.** Seed Dexie. Call `startSync()`. Dispatch `bmad:mutation`. Advance timers by 300 ms. Assert `fetch` was called with a POST body containing the expected todo.
    5. **Push respects `lastPushAt`.** Write `lastPushAt = 1000` to localStorage. Seed Dexie with rows at `updatedAt = 500, 1500, 2000`. After `syncNow()`, the POST body contains only the 1500 and 2000 rows.
    6. **Nothing-to-push skips the POST.** Seed Dexie with one row and set `lastPushAt` past its `updatedAt`. After `syncNow()`, no POST was issued.
    7. **Offline skips both calls.** Stub `navigator.onLine = false`. `syncNow()` → no `fetch` calls. Reset `navigator.onLine = true` after.
    8. **Exponential backoff on 5xx.** Mock `fetch` to return 500 five times. `await syncNow()` with `vi.runAllTimersAsync()` progressively — assert 5 calls in total then abandon.
    9. **429 also retries.** Same as above with 429.
    10. **400 drops the batch.** Mock the POST to return 400. After `syncNow()`, no retry, `lastPushAt` advanced past the batch, `console.error` spy called with `'sync: dropping batch'`.
    11. **No feedback loop.** Seed Dexie empty. Mock pull to return a row with `updatedAt = 2000`. After `syncNow()`, assert only ONE fetch call was made — no subsequent POST of the just-merged row (because `lastPushAt` advanced to 2000 during merge).
    12. **`useSync` mount/unmount** — lives in `src/hooks/__tests__/useSync.test.tsx`. Use `@testing-library/react`'s `renderHook`. Mount → assert `startSync` was called; unmount → assert `stopSync` was called. (Use `vi.mock('@/lib/sync', ...)` to stub the module.)

- [ ] **Task 6 — Manual smoke via the dev server** (AC: all) — **DEFERRED TO USER**
  - [ ] Run `npm run dev`. Open the app in two tabs (same browser profile → same `clientId`). In tab A, add 3 todos; wait ~1 s; in tab B reload; assert the 3 todos appear.
  - [ ] In tab A, soft-delete one; reload tab B; assert the deletion is visible (the soft-deleted todo is filtered out by the existing `useTodos` query — but Dexie has it with `deletedAt` set).
  - [ ] In DevTools Network, throttle to Offline; add a todo; toggle back Online; observe a single POST containing the queued todo.
  - Note: Automated test coverage is comprehensive (19 engine tests, 4 mutation-event tests, 2 hook tests). User verification recommended before taking the app to prod.

- [x] **Task 7 — Regression sweep** (AC: #12)
  - [x] `npm test` — all unit tests pass.
  - [x] `npm run test:e2e` — Playwright untouched.
  - [x] `npm run lint`.
  - [x] `npx tsc --noEmit`.
  - [x] `npm run build`.

## Dev Notes

### Why a window `CustomEvent` instead of a direct import

If `db.ts` imports `scheduleSync` from `sync.ts` AND `sync.ts` imports `getDb` from `db.ts`, we have a two-way module graph. Node's ESM tolerates it as long as neither side calls the imported function at module load — but it's a footgun. A `window.dispatchEvent` handshake keeps the coupling one-directional in code and zero-coupled at the import graph level. Cost: ~4 LOC. Benefit: no cycle, and the event is trivially observable from any listener (useful if Story 3.7 later wants a global "mutation happened" hook for analytics).

### Why advance `lastPushAt` during the merge (Pull)

Without it, the merge writes server rows to Dexie. Those rows have `updatedAt` values that are necessarily `> lastPushAt` (otherwise we wouldn't have pulled them). The next push tick would see them as local changes and round-trip them back to the server. The server's LWW would no-op (since their `updatedAt` wouldn't exceed the server's stored value), but we'd waste a POST per tick. Advancing `lastPushAt` to the merged max `updatedAt` breaks the loop cleanly.

### Why advance `lastPushAt` to `batch.at(-1)!.updatedAt`, not `Date.now()`

Between "read batch from Dexie" and "receive 200 from the server", a new user mutation could land with a fresh `updatedAt`. If we advanced `lastPushAt` to `Date.now()`, that mutation would be missed on the next tick. Advancing to the sent batch's upper bound is conservative: the new mutation's `updatedAt` is still > `lastPushAt`, so the next tick picks it up. Small cost: same row could be re-queried from Dexie but won't be in the next batch because the batch filter excludes it. Safe.

### Why copy `shouldWrite` into `sync.ts` instead of sharing with the server route

The server's `shouldWrite` operates on `bigint` timestamps (Prisma). The client's operates on `number`. Sharing would mean generics or unions — overkill for a 5-line function that changes rarely. Duplicate and keep both crisp.

### Pull-merge uses raw `db.todos.put()`, NOT `putTodo`/`updateTodo`

`putTodo` calls `Date.now()` for `updatedAt`. If the merge used it, every merged row would get `updatedAt = Date.now()` — destroying the server's timestamp and breaking LWW everywhere downstream. Use `db.todos.put(serverTodo)` directly.

### Backoff is per-tick, not per-request

Attempts 1–5 within one tick. After 5 failures, the tick abandons. The next mutation or `online` event starts a fresh tick with its own attempt counter. This means a persistent outage doesn't inflate the queue — it just delays the eventual flush until the user acts.

### Architecture guardrails applied

1. **No spinners, toasts, or modals from the engine.** (Architecture §AI Agent Guardrails #1 + #2.)
2. **Never log user todo text to server errors.** The 4xx-drop log includes only IDs and status. (Architecture §AI Agent Guardrails #3.)
3. **Dexie is client-only.** `sync.ts` is imported only from `useSync.ts` (a Client Component via `'use client'` in the hook file, imported by `TodoApp.tsx` which is already `'use client'`). `getDb()` already throws on SSR. (Architecture §AI Agent Guardrails #6.)

### `/api/errors` endpoint doesn't exist yet

Story 3.7 wires the error reporting endpoint. For this story, the 4xx-drop path uses `console.error` with a structured payload shape that mirrors what Story 3.7 will POST. Leave a single-line `// TODO(Story 3.7): POST to /api/errors` comment so the handoff is explicit.

### Why no E2E in this story

Playwright + real service workers + fake timers is a recipe for flaky tests. The sync engine's correctness is best tested at the Vitest level where we control `fetch`, `Date.now`, and `setTimeout`. When Story 3.5 adds the offline indicator and Story 3.6 adds the service worker, we'll have user-visible signals to E2E against. Today the engine is invisible to the user; asserting invisible behavior in Playwright is a trap.

### Files expected to change

- `src/lib/db.ts` — add `notifyMutation()` calls after each mutation
- `src/lib/__tests__/db.test.ts` — extend with mutation-event assertions
- `src/lib/sync.ts` — NEW: the engine
- `src/lib/__tests__/sync.test.ts` — NEW: 11 engine tests
- `src/hooks/useSync.ts` — NEW: React bridge
- `src/hooks/__tests__/useSync.test.tsx` — NEW: mount/unmount test
- `src/components/TodoApp.tsx` — add `useSync()` call
- `_bmad-output/implementation-artifacts/3-4-client-sync-engine-with-offline-queue.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression

### Files that must NOT be changed

- `src/app/api/sync/route.ts` — server route is complete; do NOT add client-side helpers there
- `src/lib/prisma.ts` — server-only
- `prisma/schema.prisma` — no schema changes
- `src/stores/useUIStore.ts` — sync state is intentionally NOT in Zustand (ephemeral UI only)
- `src/lib/schema.ts` — `TodoSchema` is sufficient; no new types needed
- `e2e/*.spec.ts` — explicit non-goal per AC #12

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — §API & Communication Patterns (client sync behavior), §Error Handling Patterns (client sync engine), §AI Agent Guardrails]
- [Source: _bmad-output/implementation-artifacts/3-1-prisma-schema-and-turso-connection.md — BigInt conversion contract (client uses number exclusively)]
- [Source: _bmad-output/implementation-artifacts/3-2-sync-pull-endpoint-get-api-sync.md — GET response shape]
- [Source: _bmad-output/implementation-artifacts/3-3-sync-push-endpoint-post-api-sync.md — POST body shape, LWW decision tree (copied for client merge)]
- [Source: src/lib/db.ts — existing mutation functions to augment]
- [Source: src/lib/clientId.ts — `getClientId()` + `window.__clientId` test override]
- [Source: src/components/TodoApp.tsx — integration point]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- Initial retry tests used `vi.useFakeTimers()` + `advanceTimersByTimeAsync` to step through backoffs. Multiple tests timed out at 5–10 s. Root cause: the fake-timers pattern combined with `fetch` microtasks across 5 sequential attempts per handler (pull + push = 10 attempts) was fragile. Switched to a test-only config hook `configureSyncForTests({ debounceMs: 1, backoffBaseMs: 1 })` so the real engine timers are effectively zero during tests. Tests now run on real timers with minimal delays and settle in milliseconds.
- `vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk(...))` initially returned a `ReturnType<typeof vi.fn>` which TypeScript refused because it doesn't match `fetch`'s overloads. Returned a typed `FetchFn` function directly instead of a `vi.fn()`.
- Refactored `updateTodo` and `softDeleteTodo` to capture the transaction return value outside the `db.transaction()` call so `notifyMutation()` could run post-commit. The original code `return db.transaction(...)` meant any `notifyMutation()` appended below was unreachable. Now: `const result = await db.transaction(...); notifyMutation(); return result;`.
- `softDeleteTodo` is a no-op if already deleted. Returning `true`/`false` from the transaction lets the caller decide whether to fire the event — verified with a dedicated "idempotent" test.

### Completion Notes List

- `bmad:mutation` `CustomEvent` dispatched from `db.ts` after every successful write, only on actual mutation (no event for no-op soft-delete of an already-deleted row, no event on validation failure).
- `src/lib/sync.ts` engine: `startSync` / `stopSync` (idempotent, attach/detach `bmad:mutation` + `online` listeners), `scheduleSync` (debounced), `syncNow` (test hook), `shouldWrite` (exported for direct unit testing). All module-level state is reset by `resetSyncForTests()` and tuneable via `configureSyncForTests()`.
- Pull merges server rows via raw `db.todos.put()` (preserves server `updatedAt`) inside a Dexie `rw` transaction. Advances BOTH `lastSyncAt` and `lastPushAt` to the merged max so merged rows never re-push — verified by the "no feedback loop" test.
- Push reads `db.todos.where('updatedAt').above(lastPushAt).sortBy('updatedAt')`, caps at 500, POSTs, advances `lastPushAt` to the batch's upper bound (NOT `Date.now()` — preserves concurrent mutations). Loops up to 10 batches per tick if more remain.
- `fetchWithRetry` handles 2xx → return, 5xx/429 → backoff + retry (max 5 attempts), 4xx-other → throw `HttpError` (caller decides to drop or abandon), network error → backoff + retry.
- 4xx-drop path: `console.error('sync: dropping batch', { status, ids, message })` + advance `lastPushAt` past the batch. `/api/errors` is Story 3.7 — TODO comment left in-place.
- Offline: `navigator.onLine === false` short-circuits the tick. `online` event listener reattaches via `scheduleSync`.
- `useSync()` React hook wired into `TodoApp.tsx`. `useEffect` with empty deps mounts/unmounts the engine once per app lifetime.
- **Unit test coverage: 25 new tests** (4 db mutation-event + 19 sync engine + 2 useSync hook). **Total: 162/162 unit tests pass, 34/34 Playwright, clean lint/tsc/build.**
- **Task 6 (manual smoke test) deferred to user.** Requires live `npm run dev` + dual-tab browser session + DevTools offline throttling. Automated coverage is comprehensive; recommend user verifies cross-tab sync and offline → online flush manually before taking to prod.

### File List

- `src/lib/db.ts` — MODIFIED: added `notifyMutation()` helper, called post-commit in `putTodo`/`updateTodo`/`softDeleteTodo`; refactored `updateTodo`/`softDeleteTodo` to return from transaction before notify
- `src/lib/__tests__/db.test.ts` — MODIFIED: added 4 `bmad:mutation` event tests
- `src/lib/sync.ts` — NEW: sync engine (~210 LOC)
- `src/lib/__tests__/sync.test.ts` — NEW: 19 engine tests covering LWW, soft-delete, pull/push/offline/retry/backoff/400-drop/no-feedback-loop, debounce, startSync/stopSync
- `src/hooks/useSync.ts` — NEW: 10-line React bridge
- `src/hooks/__tests__/useSync.test.tsx` — NEW: mount/unmount + re-render tests
- `src/components/TodoApp.tsx` — MODIFIED: `useSync()` call at the top of the component body
- `_bmad-output/implementation-artifacts/3-4-client-sync-engine-with-offline-queue.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression
