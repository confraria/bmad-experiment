---
project: bmad-experiment
mode: system-level
tooling: [vitest, playwright]
author: confraria (via John, Master Test Architect hat)
date: 2026-04-21
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/epics.md
---

# bmad-experiment — Test Design

## Philosophy

Minimal tooling, maximal intent. **Vitest + Playwright, nothing else.** No Lighthouse CI, no axe-core in CI, no visual diff tools, no contract testing, no chaos engineering. If a test can't be written in Vitest or Playwright, we either hand-verify it or defer.

## Tooling

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | `src/lib/` pure logic (db helpers, sync engine, ULID, Zod schemas, clientId) |
| Component | Vitest + `@testing-library/react` | `src/components/` behavior in isolation |
| API / integration | Vitest with Next.js route handler invocation *or* Playwright API request context | `/api/sync`, `/api/errors` |
| End-to-end | Playwright | user journeys across the stack |

Playwright replaces a dedicated a11y/perf/visual toolchain: use its built-in APIs (`clock`, `route`, `context.setOffline`, axe via `@axe-core/playwright` as a dev dependency if we want occasional manual scans).

## Risk Assessment (HIGH only)

Score = Probability × Impact (each 1–3). HIGH ≥ 6. Full matrix in progress file; below is what matters for test design.

| ID | Risk | P | I | Score | Primary mitigation coverage |
|---|---|---|---|---|---|
| R1 | Last-write-wins loses a concurrent update within debounce window | 2 | 3 | 6 | Playwright 2-context cross-device scenarios + Vitest sync-engine tests |
| R2 | IndexedDB corruption or quota eviction | 2 | 3 | 6 | Vitest Dexie schema/migration tests + Playwright offline persistence tests |
| R4 | Service worker serves stale UI after deploy | 3 | 2 | 6 | Playwright SW update flow test (1 scenario) |
| R9 | Undo toast race (rapid deletes collapse pending undos) | 3 | 2 | 6 | Vitest component tests + Playwright journey with Playwright clock |
| R11 | Dexie/Prisma schema drift | 2 | 3 | 6 | Shared Zod schema (compile-time) + Vitest migration round-trip test |

## Coverage Plan

Target ≈ 40 scenarios total (lean). Each row is a discrete test or tightly grouped set.

### Vitest — Unit (`src/lib/`)

| Scenario | Priority |
|---|---|
| `db.todos.put/update/delete` round-trip — read back matches write | P0 |
| `updatedAt` bumped on every mutation via db helper | P0 |
| ULID generation is monotonic and unique (1000-iteration sanity check) | P1 |
| `clientId` generated once, persisted to localStorage, reused on remount | P1 |
| Dexie schema v1 → v2 migration (seed v1 data, open as v2, assert shape) | P1 |
| Zod `TodoSchema` rejects empty/overlong/non-string text | P1 |
| Zod `SyncRequestSchema` rejects missing clientId / bad timestamps | P1 |
| Sync engine: last-write-wins merge on overlapping `updatedAt` | P0 |
| Sync engine: soft-delete wins over concurrent non-delete update | P0 |
| Sync engine: exponential backoff formula (unit test pure logic, no network) | P1 |

### Vitest — Component (`src/components/`)

| Component | Scenarios | Priority |
|---|---|---|
| `AddTodoInput` | Enter submits + clears; empty Enter is no-op; placeholder present; focus retained after submit | P0 |
| `TodoItem` | Tap toggles complete; Space toggles when focused; strikethrough + secondary weight on complete state | P0 |
| `TodoList` | Renders active above completed; reactive to Dexie changes via `useLiveQuery` stub | P1 |
| `UndoToast` | 5s auto-dismiss (vi.useFakeTimers); Undo restores; new delete replaces current toast; dismiss on Escape | P0 |
| `EmptyState` | Shown when zero active todos; hides when first todo arrives | P1 |
| `OfflineIndicator` | Renders dot when offline; hidden when online | P1 |
| `HelpOverlay` | Opens on `?`, closes on Escape and outside click; lists all shortcuts | P2 |
| `<script>` in todo text renders as escaped text (R6) | — | P1 |

### Vitest — API / Integration (route handlers invoked directly)

| Scenario | Priority |
|---|---|
| `GET /api/sync?since=<ts>&clientId=X` returns only deltas since timestamp | P0 |
| `GET /api/sync?since=0` returns full client history | P0 |
| `POST /api/sync` LWW: greater `updatedAt` wins | P0 (R1) |
| `POST /api/sync` soft-delete wins over non-delete update | P0 (R1) |
| Malformed payload → 400 with `{ error: { code, message } }` and no stack trace | P0 |
| `POST /api/errors` returns 204 on well-formed body | P2 |
| `POST /api/errors` returns 204 on malformed body (fire-and-forget) | P2 |

### Playwright — E2E (user journeys)

| # | Journey | Scenarios | Priority |
|---|---|---|---|
| J1 | Capture | Open empty app → type → Enter → persisted across reload | P0 |
| J2 | Complete | Open with seeded todos → tap → visual state change → reload verifies | P0 |
| J3 | Delete + Undo | Swipe → toast appears → click Undo before timeout → restored | P0 (R9) |
| J3b | Delete finalize | Swipe → Playwright clock advances 5s → toast dismissed → stays deleted on reload | P0 |
| J4 | Return session | Write → reload → state persists → new tab sees same state | P0 |
| J5 | Network failure mid-add | `context.setOffline(true)` → add → visible → set online → verify sync POST fires | P0 (R7) |
| J6 | Cross-device sync | Two browser contexts w/ same clientId → write in A → assert appears in B after sync | P0 (R1) |
| J7 | Offline CRUD | Set offline → complete, delete, add multiple → go online → verify all sync | P0 (R2) |
| J8 | Desktop keyboard full flow | n → type → Enter → j/k navigate → Space complete → Cmd+Backspace delete → Cmd+Z undo → ? opens help | P0 (FR10) |
| J9 | Help overlay | `?` opens; Escape dismisses; outside click dismisses | P2 |
| J10 | SW update flow | Install SW, deploy new build, verify new shell served on next load | P1 (R4) |

## Execution Strategy

- **PR (every commit):** all Vitest (unit + component + API) + Playwright P0 subset (J1–J5, J7). Target <10 min wall time via Playwright sharding (2–3 shards).
- **Nightly / pre-release:** full Playwright suite including J6 (cross-device), J8 (keyboard), J10 (SW update).
- **Manual / on-demand:** dark mode visual parity, iOS Safari real-device pass, one-off axe scan via `@axe-core/playwright` if a11y concerns surface.

## Quality Gates

- P0 pass rate = 100%. Any P0 failure blocks merge.
- P1 pass rate ≥ 95%.
- All 5 HIGH risks have at least one dedicated test scenario (R1 → J6, R2 → J7, R4 → J10, R9 → J3/J3b, R11 → Vitest migration test).
- `src/lib/` line coverage ≥ 85% (via Vitest `--coverage`).
- Every component in `src/components/` has at least one Vitest component test.

## Testability Hooks to Ship

Items the app itself must expose so tests stay clean (not extra tooling):

1. **`window.__clientId` setter** (NODE_ENV=test only) — force a fixed clientId for deterministic sync tests.
2. **`window.__syncState`** (NODE_ENV=test only) — read queue depth, `lastSyncAt`, in-flight state.
3. **Service worker disabled** in `npm run dev` and when `PLAYWRIGHT_TEST=1` is set.
4. **IndexedDB reset helper** exported from `src/lib/db.ts` for test setup hooks.
5. **Deterministic ULID seed** (test-only) when `process.env.NODE_ENV === 'test'`.

## Resource Estimate (Range)

AI-assisted authoring assumed. Single engineer.

- Vitest unit + component + API (≈25 scenarios): **~15–25 hours**
- Playwright E2E (≈10–11 scenarios) + test infra (clientId helper, IDB reset, SW disable, clock utils): **~15–25 hours**
- **Total: ~30–50 hours**

## Open Assumptions

- Dev uses local SQLite (not a shared Turso instance) so sync tests don't pollute prod data.
- Playwright tests run against `npm run build && npm start` (production build), not dev server, to include the service worker.
- We skip Lighthouse + axe in CI; if a11y regressions appear, we run a one-off `@axe-core/playwright` scan manually.

## What We Explicitly Are Not Doing (v1)

- No Lighthouse CI gates.
- No axe-core in CI (manual scans only if needed).
- No visual regression tooling.
- No contract testing (no microservices).
- No chaos / fault injection suite.
- No performance regression tracking beyond "don't ship a bundle over ~200KB gz" — checked manually at release.
- No mutation testing, no Stryker.
- No E2E across real iOS — once-before-ship manual pass on a real iPhone.
