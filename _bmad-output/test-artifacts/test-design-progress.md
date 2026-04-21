---
workflowStatus: 'completed'
mode: 'system-level'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
finalOutput: _bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md
deviationsFromTemplate: |
  Consolidated the two system-level template documents (architecture + QA) into a single lean test design doc per user's "don't go overboard" feedback.
  Skipped handoff template generation — not needed since epics+stories already exist.
  Scope narrowed to Vitest + Playwright only; no Lighthouse CI, axe-in-CI, visual diffs, contract testing, or chaos engineering.
lastSaved: '2026-04-21'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad/tea/config.yaml
detectedStack: 'fullstack'
playwrightUtilsProfile: 'full-ui-api'
contractTesting: 'not-applicable'
---

# Test Design Progress

## Step 01 — Mode Detection

**Mode selected:** System-Level

**Rationale:** PRD + Architecture (ADR) + UX spec + Epics/Stories all present. Workflow priority rule: when both PRD/ADR and Epic/Stories exist, prefer System-Level Mode first. Epic-Level can run afterward if tactical per-epic plans are needed.

**Prerequisite inputs confirmed:**
- PRD: `_bmad-output/planning-artifacts/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` (bonus context)
- Epics/Stories: `_bmad-output/planning-artifacts/epics.md` (bonus context)

No blockers. Proceeding to step 02 (load context).

## Step 02 — Context Loaded

**Stack:** `fullstack` (Next.js App Router + Vitest + Playwright + Prisma/Turso, per architecture doc). Greenfield — no existing tests.

**Artifacts loaded:** PRD, architecture, UX spec, epics (all four planning docs).

**Config flags:** `tea_use_playwright_utils: true` → full UI+API profile. `tea_pact_mcp: none`. Contract testing not applicable (single-service architecture). `tea_browser_automation: auto`.

**Knowledge fragments engaged:** ADR quality readiness · Test levels framework · Risk governance · Probability & impact · Test quality DoD · Test priorities matrix · Playwright utils (full UI+API).

Proceeding to step 03 (risk and testability assessment).

## Step 03 — Testability Review & Risk Assessment

### Testability Concerns (Actionable)

1. **clientId determinism in tests** — localStorage-based clientId must be reset or injected per test for deterministic sync scenarios.
2. **Service worker cache interference** — Serwist SW can return stale responses in Playwright runs; SW must be disabled or `skipWaiting` forced in test config.
3. **IndexedDB isolation** — Dexie persists across Playwright contexts; each test needs fresh IDB state via `context.addInitScript` or cleanup hooks.
4. **Sync queue observability** — No external observability. Add a `window.__syncState` debug hook (NODE_ENV-gated) exposing queue depth, lastSyncAt, and pending operations for e2e tests.
5. **Undo toast timing** — 5s timeout is internal; use Playwright's `clock` API to fast-forward time rather than `waitForTimeout`.
6. **Server test DB isolation** — Tests must use SQLite in-memory or clientId-isolated prod data; shared dev Turso risks cross-test pollution.

### Testability Assessment Summary (Strong)

- Dexie CRUD helpers → straightforward fixture seeding.
- Playwright `page.route()` → clean network interception for `/api/sync`.
- Zod schemas at every boundary → typed, validatable contracts.
- React ErrorBoundary + `/api/errors` → minimal observability.
- Sync engine's Dexie-hook-based design → deterministically observable via test hooks.

### Architecturally Significant Requirements (ASRs)

- **ASR-1 [ACTIONABLE]** — Local-first optimistic UI (NFR1). Every mutation must be verified as network-independent.
- **ASR-2 [ACTIONABLE]** — Offline-first sync with last-write-wins (FR6 + FR8). Conflict resolution + queue replay are core.
- **ASR-3 [ACTIONABLE]** — PWA installability (NFR3). Verifiable via Lighthouse PWA audit.
- **ASR-4 [ACTIONABLE]** — WCAG 2.1 AA + prefers-reduced-motion (NFR4 + NFR6). axe-core in CI + manual screen reader pass.
- **ASR-5 [ACTIONABLE]** — clientId-based data identity for v2 migration (NFR7). Every persisted todo must carry clientId.
- **ASR-6 [FYI]** — Dark mode parity (NFR5). Visual parity not automated v1; manual check.

### Risk Assessment Matrix

Score = Probability × Impact (each 1–3). High ≥ 6.

| ID | Cat | Risk | P | I | Score | Level |
|----|-----|------|---|---|-------|-------|
| R1 | DATA | Last-write-wins loses a concurrent update within debounce window | 2 | 3 | 6 | HIGH |
| R2 | DATA | IndexedDB corruption or browser quota eviction | 2 | 3 | 6 | HIGH |
| R4 | TECH | Service worker serves stale UI after deploy | 3 | 2 | 6 | HIGH |
| R9 | DATA | Undo toast race (rapid deletes collapse older pending undos) | 3 | 2 | 6 | HIGH |
| R11 | TECH | Dexie/Prisma schema drift — client and server out of sync | 2 | 3 | 6 | HIGH |
| R3 | PERF | First-render jank on mobile 3G/4G | 2 | 2 | 4 | Medium |
| R5 | TECH | SSR/Client Component boundary violations (Dexie in RSC) | 2 | 2 | 4 | Medium |
| R8 | OPS | DATABASE_URL drift between preview and prod | 2 | 2 | 4 | Medium |
| R10 | PERF | Sync queue unbounded growth during long offline | 2 | 2 | 4 | Medium |
| R13 | OPS | Prod error observability limited to `/api/errors` + Vercel logs | 2 | 2 | 4 | Medium |
| R6 | SEC | XSS via user-entered todo text | 1 | 3 | 3 | Low (mitigated) |
| R7 | BUS | First data loss → user abandonment | 1 | 3 | 3 | Low-probability, high-impact |
| R15 | TECH | iOS Safari PWA inconsistency | 3 | 1 | 3 | Low (graceful degradation) |
| R14 | PERF | Bundle size creep | 2 | 1 | 2 | Low |
| R12 | SEC | clientId collision (ULID) | 1 | 2 | 2 | Low (ULID guarantees) |

### Mitigations for High Risks

- **R1 / R2 / R11** → comprehensive sync conflict + schema migration test suite; shared Zod schemas catch drift at build time.
- **R4** → Serwist versioning + SW update flow test; user-visible "new version" indicator deferred to v2.
- **R9** → queue toast actions atomically; explicit concurrent-delete test scenario.

Proceeding to step 04 (coverage plan).

## Step 04 — Coverage Plan & Execution Strategy

### Coverage Matrix

**Area 1 — Data Layer (Dexie + schema + identity):** CRUD helpers [Unit/P0 · FR1–5], schema migration [Unit/P1 · R2 R11], ULID monotonicity [Unit/P1 · ASR-5], clientId persistence [Unit+E2E/P1 · ASR-5], Zod rejection of bad input [Unit/P1 · R6].

**Area 2 — Local-first mutations (ASR-1 / NFR1):** add appears in <1 frame no network [E2E/P0], complete toggle no network in flight [E2E/P0], delete no network blocker [E2E/P0], all CRUD with network disabled [E2E/P0].

**Area 3 — Sync Engine (HIGH risk — R1 R2 R4 R11):** GET sync delta [API/P0], GET sync initial (since=0) [API/P0], POST LWW winner [API/P0 · R1], POST soft-delete wins [API/P0 · R1], Zod rejection of bad sync payload [API/P0], no stack traces leaked [API/P0], client pull on mount [Integration/P0], client queues offline [E2E/P0 · R2], client flushes on reconnect [E2E/P0], exponential backoff on 5xx/429 [Integration/P1], drop + log on 4xx-other [Integration/P2], cross-device (2 contexts) [E2E/P0 · R1], schema drift client v2 ↔ server v1 [Integration/P1 · R11].

**Area 4 — PWA / Offline (ASR-3 · R4):** Lighthouse PWA audit [CI/P1], manifest fields [Unit/P1], SW precache shell [E2E/P1], SW update flow [E2E/P1 · R4], SW disabled in dev [Smoke/P2], OfflineIndicator appears/hides [Comp+E2E/P1].

**Area 5 — Component behavior (UX-DRs):**
- AddTodoInput — Enter/empty/placeholder/focus/mobile-vs-desktop [Comp/P0]
- TodoItem — tap + Space toggle, swipe threshold, strikethrough on complete [Comp/P0]
- TodoList — active above completed, reactive [Comp/P1]
- UndoToast — 5s via Playwright clock, Undo restores, replace-on-new-delete [Comp/P0 · R9]
- EmptyState [Comp/P1]
- OfflineIndicator [Comp/P1]
- HelpOverlay — desktop only, `?` opens, Escape dismisses [Comp/P2]

**Area 6 — User Journeys (UX spec J1–J5):** J1 Capture [E2E/P0], J2 Complete [E2E/P0], J3 Delete+Undo [E2E/P0 · R9], J3b finalize after 5s [E2E/P0], J4 Return session [E2E/P0], J5 Network failure mid-add [E2E/P0 · R7].

**Area 7 — Accessibility (ASR-4):** axe-core zero violations on primary screens [E2E/P0], full desktop keyboard flow [E2E/P0 · FR10], prefers-reduced-motion instant [Comp/P1], focus indicators AA [Comp/P1], 200% zoom reflow [E2E/P1], dark mode contrast [Visual/P2].

**Area 8 — Performance (NFR1 · R3 · R14):** Lighthouse Perf ≥90 mobile+desktop [CI/P1], bundle size budget [CI/P1 · R14], TTI ≤3s on 4G [CI/P2 · R3], zero CLS on SSR→hydration [E2E/P1].

**Area 9 — Error handling (R13):** route-level error boundary [E2E/P1], component-level boundary isolates subtree [Comp/P1], `/api/errors` 204 on well-formed [API/P2], silent accept of malformed [API/P2].

**Area 10 — Security (R6 · R12):** `<script>` in todo text rendered escaped [Comp/P1 · R6], CORS blocks off-origin [API/P2], text length cap 400 on overflow [API/P2].

### Test Counts by Priority

- P0: ~30 scenarios
- P1: ~20 scenarios
- P2: ~12 scenarios
- P3: ~3 scenarios (exploratory / visual)
- **Total:** ~65 scenarios

### Execution Strategy (PR / Nightly / Weekly)

- **PR (every commit, target <15 min):** all Unit + Component + API + curated P0 E2E (J1–J3, cross-device sync, offline gate), axe-core scan, Lighthouse mobile audit, typecheck, lint.
- **Nightly:** full E2E suite including all journeys, SW update flow, schema drift, full keyboard + a11y matrix, 2-context cross-device scenarios.
- **Weekly:** performance regression tracking, visual diff dark/light mode, iOS Safari real-device pass, exploratory chaos (rapid offline/online toggling, long-offline queue growth).

### Resource Estimates (Ranges)

AI-assisted authoring assumed:
- P0 (~30 scenarios): ~25–40 hours
- P1 (~20 scenarios): ~15–25 hours
- P2 (~12 scenarios): ~8–15 hours
- P3 (~3 scenarios): ~2–5 hours
- Infrastructure (Playwright config, fixtures, clientId helpers, SW disable, IDB cleanup, clock utils): ~8–12 hours
- **Total range: ~58–97 hours** of test-authoring effort.

### Quality Gates

- P0 pass rate = 100%. Any P0 failure blocks merge.
- P1 pass rate ≥ 95%. New regressions below threshold block merge.
- All 5 HIGH risks have dedicated mitigation test coverage (R1, R2, R4, R9, R11) — traced in traceability matrix.
- Lighthouse Performance ≥ 90 mobile + desktop; PWA = 100.
- axe-core zero violations on primary screens.
- `src/lib/` ≥ 90% line coverage; every component has at least one happy-path + one edge-case test; every UX journey (J1–J5) has at least one E2E scenario.

Proceeding to step 05 (generate output).
