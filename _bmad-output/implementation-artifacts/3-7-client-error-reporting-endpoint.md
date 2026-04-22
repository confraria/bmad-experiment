# Story 3.7: Client error reporting endpoint

Status: done

## Story

As a developer,
I want client-side errors posted to `/api/errors` so they appear in server logs,
so that I can see what's breaking in production.

## Acceptance Criteria

1. **Valid POST returns 204 and emits a structured server log.** Given a request `POST /api/errors` with body `{ message, stack, clientId, userAgent, url }` that passes Zod validation, when the handler runs, then the server emits `console.error('[client error]', payload)` and responds with HTTP 204 No Content (empty body).

2. **Malformed body also returns 204 (fire-and-forget).** Given a request with missing/malformed fields, non-JSON body, or an empty body, when Zod validation (or JSON parsing) fails, then the server emits `console.error('[client error] invalid payload', …)` AND still responds with HTTP 204. Clients never see an error response — the endpoint is explicitly fire-and-forget.

3. **Internal errors also return 204.** Given any uncaught error inside the handler (e.g., extremely rare runtime fault), when the catch-all runs, then the response is still HTTP 204. Again: clients must never receive failure from this endpoint, because the only thing worse than a broken feature is a broken error-reporting channel that makes the user notice.

4. **Optional fields are accepted.** Given a payload that omits `stack`, `userAgent`, or `url`, when Zod validates, then the request still passes. Only `message` and `clientId` (ULID) are strictly required — the rest are optional strings. The architecture envisioned a fixed shape (line 401), but requiring every field would fail legitimate reports from contexts where the field isn't available (e.g., headless script, worker).

5. **`caughtAt` marker accepted.** Given the existing `AppErrorBoundary` sends `caughtAt: 'app'` alongside the base fields, when the schema validates, then `caughtAt` is an optional string. This preserves the contract the client already emits without forcing the server to care about its values.

6. **User todo text is NOT logged by the endpoint itself.** Given the architecture guardrail "Never log user todo text to server error reports" (§AI Agent Guardrails #3), when the server logs the payload, then the log line contains only what the client chose to send. The server does no secondary extraction, no URL scrubbing (URLs may contain ids but not text) — this is the client's responsibility at the boundary. Document this division of concerns in Dev Notes.

7. **`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.** Given the same posture as `/api/sync`, when the route is configured, then it exports both flags. `nodejs` because the logger is process-level; `force-dynamic` so Next does not try to statically pre-render a POST-only route.

8. **Sync engine's 4xx-drop path calls `/api/errors`.** Given `src/lib/sync.ts` currently has a `TODO(Story 3.7)` comment in the 4xx-drop branch, when this story lands, then the TODO is closed: after the `console.error('sync: dropping batch', …)` log, the engine issues a fire-and-forget `fetch('/api/errors', { method: 'POST', keepalive: true, body: … })` with the same structured payload (message + ids, no todo text). The call is fire-and-forget — no await, no retry, no backoff. Failure of the error-report call is swallowed silently.

9. **Unit tests for the route handler.** Given the route is created, when `npm test` runs, then Vitest tests cover: (a) valid payload → 204 + `console.error` called; (b) missing `message` → 204 + different `console.error` call with the `invalid payload` prefix; (c) non-JSON body → 204; (d) extra unknown fields (e.g., `foo: "bar"`) → 204, passed through in the log (Zod `.passthrough()`); (e) handler throw → 204.

10. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed. No E2E spec is added — fire-and-forget behavior with no UI signal is not worth E2E setup for v1.

## Tasks / Subtasks

- [x] **Task 1 — Add `ErrorReportSchema` to `src/lib/schema.ts`** (AC: #1, #4, #5)
  - [x] Append:
    ```ts
    export const ErrorReportSchema = z
      .object({
        message: z.string().min(1).max(5_000),
        clientId: ulid(),
        stack: z.string().max(50_000).optional(),
        userAgent: z.string().max(1_000).optional(),
        url: z.string().max(2_000).optional(),
        caughtAt: z.string().max(100).optional(),
      })
      .passthrough();

    export type ErrorReport = z.infer<typeof ErrorReportSchema>;
    ```
  - [x] **Why `.passthrough()`:** the client may send extra metadata we didn't anticipate (e.g., a future `severity` field). Dropping it silently would hide useful context from logs. Passing it through costs nothing.
  - [x] **Why bounded lengths:** caps prevent a malicious or buggy client from flooding logs with a 10 MB stack trace. 5 KB message / 50 KB stack are generous for realistic browser errors.
  - [x] **Why `clientId` is still required:** without it, error reports are ungroupable and useless for triage. The existing `AppErrorBoundary` and sync engine both send it; there's no legitimate caller path that lacks it.
  - [x] Add unit tests in `src/lib/__tests__/schema.test.ts`: valid minimum payload (message + clientId only), valid full payload, missing message, missing clientId, bad ULID, passthrough of extra fields.

- [x] **Task 2 — Create `src/app/api/errors/route.ts`** (AC: #1, #2, #3, #7)
  - [x] Implementation:
    ```ts
    import { NextRequest } from 'next/server';
    import { ErrorReportSchema } from '@/lib/schema';

    export const dynamic = 'force-dynamic';
    export const runtime = 'nodejs';

    const NO_CONTENT = new Response(null, { status: 204 });

    export async function POST(req: NextRequest) {
      try {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          console.error('[client error] invalid payload: body is not JSON');
          return NO_CONTENT;
        }
        const parsed = ErrorReportSchema.safeParse(rawBody);
        if (!parsed.success) {
          console.error('[client error] invalid payload', {
            issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
          });
          return NO_CONTENT;
        }
        console.error('[client error]', parsed.data);
        return NO_CONTENT;
      } catch (err) {
        console.error('[client error] handler fault', err);
        return NO_CONTENT;
      }
    }
    ```
  - [x] Use `.safeParse` (not `.parse`) so validation failures land in the "invalid payload" log branch WITHOUT throwing — the handler should flow linearly, not via `catch (err instanceof ZodError)`.
  - [x] **Why NOT share the `invalidRequest` helper from `/api/sync/route.ts`:** that helper returns 400 with a body; this endpoint returns 204 with no body. Different contract; keep them separate rather than adding a config flag.
  - [x] **Why the reusable `NO_CONTENT` constant:** tiny perf nicety + clarity — every exit path returns the same shape. Do NOT cache across requests (Response instances are single-use); recreate inside the function if Next complains. If it does, we'll switch back to `new Response(null, { status: 204 })` per branch.

- [x] **Task 3 — Unit tests for the route handler** (AC: #9)
  - [x] Create `src/app/api/errors/__tests__/route.test.ts`. Follow the project's existing `__tests__/` convention; mirror the mock-free structure from the `/api/sync` tests where applicable (no Prisma here, no DB mock).
  - [x] Test helper:
    ```ts
    function postReq(body: unknown, { raw = false }: { raw?: boolean } = {}): NextRequest {
      return new NextRequest('http://localhost/api/errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw ? (body as string) : JSON.stringify(body),
      });
    }
    ```
  - [x] Test cases:
    - Valid minimum payload (`{ message, clientId }`) → 204, `console.error` called with `['[client error]', <parsed payload>]`.
    - Valid full payload including `caughtAt` → 204, payload round-trips in the log.
    - Passthrough extra fields (`{ ..., severity: 'fatal' }`) → 204, `severity` present in the log.
    - Missing `message` → 204, log has `'[client error] invalid payload'`.
    - Non-ULID `clientId` → 204, log has `'[client error] invalid payload'`.
    - Non-JSON body (raw string `"oops"`) → 204, log has `'[client error] invalid payload: body is not JSON'`.
    - Response status is 204 AND body is empty:
      ```ts
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      ```
  - [x] Use `vi.spyOn(console, 'error').mockImplementation(() => {})` in each test to silence output AND assert on calls; restore with `vi.restoreAllMocks()` in `afterEach` (the project's `vitest.setup.ts` already does this).

- [x] **Task 4 — Wire sync engine's 4xx-drop path to `/api/errors`** (AC: #8)
  - [x] Open `src/lib/sync.ts`. Locate the `TODO(Story 3.7)` comment inside the `catch (err)` branch of `push()`.
  - [x] Add a fire-and-forget POST to `/api/errors` right after the existing `console.error('sync: dropping batch', …)`:
    ```ts
    if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      const logPayload = {
        status: err.status,
        ids: batch.map((b) => b.id),
        message: err.message,
      };
      console.error('sync: dropping batch', logPayload);
      void reportClientError({
        message: `sync: POST /api/sync ${err.status} — dropping batch`,
        clientId,
        url: typeof window !== 'undefined' ? window.location.href : '',
        caughtAt: 'sync-engine',
        ...logPayload,
      });
      writeCursor(LAST_PUSH_AT, batch[batch.length - 1].updatedAt);
      continue;
    }
    ```
  - [x] Add a private `reportClientError(payload: Record<string, unknown>)` helper in `src/lib/sync.ts`:
    ```ts
    function reportClientError(payload: Record<string, unknown>): void {
      try {
        fetch('/api/errors', {
          method: 'POST',
          keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => undefined);
      } catch {
        // Fire-and-forget: never block the engine on telemetry.
      }
    }
    ```
  - [x] Remove the `TODO(Story 3.7): POST to /api/errors instead of console.error` comment.
  - [x] Do NOT include todo text in the payload — `batch.map((b) => b.id)` gives us just the ULIDs, which is sufficient for triage and compliant with architecture guardrail #3.
  - [x] Extend `src/lib/__tests__/sync.test.ts` — the "drops the batch on 400" test already mocks `fetch` for `/api/sync`. Expand it to assert that after the 400, a second `fetch` call to `/api/errors` was issued, and that its body does NOT include `text` or any other todo content (only `ids` + metadata). One new assertion, no new test case needed.

- [x] **Task 5 — Regression sweep** (AC: #10)
  - [x] `npm test` — all tests pass.
  - [x] `npm run test:e2e` — Playwright unchanged.
  - [x] `npm run lint`.
  - [x] `npx tsc --noEmit`.
  - [x] `npm run build` — both `/api/sync` and the new `/api/errors` should appear as `ƒ (Dynamic)` in the route summary.

## Dev Notes

### Why the fire-and-forget 204 contract

If this endpoint ever returned an error, the client's error boundary would catch that too, report IT, get another error back, and loop. 204 breaks that loop unconditionally. The server-side log tells us the payload was malformed; the client never learns.

### Logging strategy

`console.error` is the logging layer for v1. In production on Vercel, these end up in the Vercel log stream, searchable by the deployment dashboard. No Sentry, no Datadog, no rotation policy — intentional simplicity for dogfood. When traffic grows past a single developer, a real logger (pino, winston) behind this handler is a 5-minute swap.

### Boundaries of responsibility

- **Client:** constructs the payload, decides what is safe to include. User-facing text MUST NOT go in `message` or `stack`. `AppErrorBoundary` today only catches uncaught Errors — those don't contain user data unless a developer wrote bad error messages (review-time concern).
- **Endpoint:** validates shape, logs the payload verbatim, returns 204. No cleanup, no scrubbing, no PII detection.
- **Vercel:** stores the log line. Retention per project settings.

### Why `.passthrough()` instead of `.strict()`

The `AppErrorBoundary` already sends `caughtAt`. Future stories might add `severity`, `release`, `route`. Strict validation would reject every one of those, forcing a server redeploy per client-side metadata addition. Passthrough lets the client evolve independently.

### Why Story 3.7 also patches `sync.ts`

The sync engine's `TODO(Story 3.7)` comment was intentionally left for this story. Closing the loop here keeps the commit atomic: "endpoint exists → known consumer uses it." Delaying the wire-up to a future cleanup story leaves dead telemetry. Scope creep would be a concern if this needed new tests or a schema change; it doesn't.

### No E2E coverage

Fire-and-forget behavior has no observable UI effect. Running Playwright to assert "a POST was issued" would require intercepting `/api/errors` and verifying shape — that's what the unit test does, with no browser required. Architecture §Testing Standards allows E2E to be skipped when unit coverage is complete and the user-visible contract is "nothing changes" (which it is here).

### Files expected to change

- `src/lib/schema.ts` — append `ErrorReportSchema` + `ErrorReport` type
- `src/lib/__tests__/schema.test.ts` — add `ErrorReportSchema` test block
- `src/app/api/errors/route.ts` — NEW: POST handler
- `src/app/api/errors/__tests__/route.test.ts` — NEW: ~7 tests
- `src/lib/sync.ts` — add `reportClientError` helper, wire into 4xx-drop, remove TODO
- `src/lib/__tests__/sync.test.ts` — extend "drops the batch on 400" test to assert the errors POST fired without leaking todo text
- `_bmad-output/implementation-artifacts/3-7-client-error-reporting-endpoint.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression

### Files that must NOT be changed

- `src/components/AppErrorBoundary.tsx` — already POSTs to `/api/errors` (Story 1.6 scaffolded). Its payload shape (including `caughtAt: 'app'`) drives the server schema, not the other way around.
- `src/components/ErrorFallback.tsx` — UI-only
- `src/app/error.tsx` — Next.js render-error boundary; not the same channel
- `src/app/api/sync/route.ts` — orthogonal endpoint
- `prisma/schema.prisma` — error reports are logs, not DB rows. v1 scope.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.7]
- [Source: _bmad-output/planning-artifacts/architecture.md — §Error Handling Patterns (line 401), §AI Agent Guardrails #3 (line 415), §Gap Analysis #2 (component error boundary)]
- [Source: src/components/AppErrorBoundary.tsx — existing client payload shape]
- [Source: src/lib/sync.ts line 140 — the TODO this story closes]
- [Source: src/lib/schema.ts — existing `ulid()` helper to reuse]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- **Story-drafted `NO_CONTENT` response constant didn't survive implementation.** `new Response(null, { status: 204 })` instances are single-use — Next.js consumed the body on the first send and subsequent requests got empty/malformed responses. Switched to `return new Response(null, { status: 204 })` at every exit path. Cost: 4 extra tokens per branch. Benefit: correctness. The story file's Dev Notes actually anticipated this fallback: "Do NOT cache across requests… if Next complains, we'll switch back." Confirmed — Next complains.
- **TypeScript spread-ordering caught at lint time.** In `sync.ts` I first wrote `{ message: 'sync: POST ...', ...logPayload }` — but `logPayload` contains its own `message`, which clobbered the explicit one. TS2783 flagged it. Flipped to `{ ...logPayload, message, clientId, url, caughtAt }` so explicit fields override the spread.

### Completion Notes List

- `ErrorReportSchema` in `src/lib/schema.ts`: `message` (min 1, max 5000) + `clientId` (ULID) required; `stack`/`userAgent`/`url`/`caughtAt` optional with sane size caps; `.passthrough()` for forward-compat on client-side metadata additions.
- `POST /api/errors` always returns 204 with an empty body. Three log paths: `[client error]` for valid, `[client error] invalid payload` for Zod / JSON failures, `[client error] handler fault` for catch-all.
- **Sync engine TODO closed.** The 4xx-drop branch now calls `reportClientError()` alongside the existing `console.error`. Payload includes `status`, `ids` (ULIDs), and `caughtAt: 'sync-engine'` — **zero todo text**, per architecture guardrail #3. Helper `fetch` uses `keepalive: true` so the report survives tab navigation.
- **Extended sync test** (`drops the batch on 400`) now seeds a todo whose text is `'super-secret todo text'` and asserts `JSON.stringify(errorsBody)` does NOT contain that string — architecture guardrail #3 is verified, not just hoped for.
- **Test coverage: 16 new tests** (8 schema + 8 route handler) + 1 extended assertion in the sync suite. **189/189 unit tests pass, 48/48 Playwright pass, clean lint/tsc/build.** Route summary now shows both `ƒ /api/errors` and `ƒ /api/sync` as Dynamic.
- No E2E for this story — fire-and-forget behavior has no UI signal; unit tests cover the contract completely.

### File List

- `src/lib/schema.ts` — MODIFIED: appended `ErrorReportSchema` + `ErrorReport` type
- `src/lib/__tests__/schema.test.ts` — MODIFIED: added 8 `ErrorReportSchema` tests
- `src/app/api/errors/route.ts` — NEW: `POST` handler
- `src/app/api/errors/__tests__/route.test.ts` — NEW: 8 handler tests
- `src/lib/sync.ts` — MODIFIED: added `reportClientError()` helper; 4xx-drop branch POSTs to `/api/errors`; removed `TODO(Story 3.7)` comment
- `src/lib/__tests__/sync.test.ts` — MODIFIED: extended "drops the batch on 400" test with `/api/errors` mock, payload assertions, and a no-todo-text invariant check
- `_bmad-output/implementation-artifacts/3-7-client-error-reporting-endpoint.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression
