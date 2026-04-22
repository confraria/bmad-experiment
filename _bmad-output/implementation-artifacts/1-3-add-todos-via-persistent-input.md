# Story 1.3: Add Todos via Persistent Input

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to type a task, hit Enter, and see it instantly captured,
so that capturing a thought feels as fast as thinking it.

## Acceptance Criteria

1. **Mobile layout — persistent bottom input.** Given the viewport is ≤767px, when the app is rendered, then a single-line text input is pinned to the bottom edge (`fixed`-positioned, inside the iOS safe-area inset), shows placeholder `"Add a task…"`, and the tappable surface is ≥44×44px.

2. **Desktop layout — top, always-focused.** Given the viewport is ≥1024px, when the app is rendered, then the input sits at the top of the content column (within the ~600px-wide centered reading area), is auto-focused on mount, and remains focused after each successful submission.

3. **Submit writes to Dexie and clears the input.** Given a user types `"Buy milk"` and presses Enter, when the submit fires, then (a) the text is trimmed and validated via `NewTodoInputSchema`; (b) a new `Todo` is written to Dexie via the hardened `putTodo` helper from `src/lib/db.ts`; (c) the input value is cleared; (d) focus is retained on the input element; (e) on desktop, the next keystroke lands in the same input without the user clicking. The Dexie write is verifiable via `IDBDatabase.transaction('todos').objectStore('todos').count()` incrementing by one.

4. **Empty / whitespace-only submit is a no-op.** Given the input value is `""` or only whitespace, when the user presses Enter, then nothing happens — no Dexie write, no error, no flash, no visual state change. (`NewTodoInputSchema` already rejects post-trim empties; the component must not invoke `putTodo` in that case.)

5. **Reduced-motion is honored.** Given the OS preference `prefers-reduced-motion: reduce`, when a submission triggers any transition (e.g. input flash on commit), then transitions fall back to instant per the tokens wired in Story 1.1.

6. **Failures are swallowed silently, user input is preserved.** Given `putTodo` rejects (Dexie quota, storage unavailable, schema violation from a future-corrupt row), when the user presses Enter, then the error is logged via `console.error`, the input value is **not** cleared (the user can retry), and no toast/banner is surfaced — per the architecture guardrail "User never sees a red banner".

## Tasks / Subtasks

- [x] **Task 1 — Scaffold the composition root** (AC: #1, #2)
  - [x] Create `src/components/TodoApp.tsx` as a `"use client"` composition root. For this story it renders only `<AddTodoInput />` inside a responsive container (mobile: full-width with bottom padding; desktop: `max-w-[600px] mx-auto`). Story 1.4 will add `<TodoList />` here. _(Note: final DOM order places `<AddTodoInput />` **before** `<main>` so that on desktop the static input appears at the top of the content column; on mobile the input is `fixed bottom-0` and DOM order is visually inert.)_
  - [x] Update `src/app/page.tsx` to render `<TodoApp />`. `page.tsx` itself remains a Server Component (no `"use client"`); the client boundary moves into `TodoApp`.
  - [x] Verify `npm run build` still passes.

- [x] **Task 2 — Build `AddTodoInput`** (AC: #1, #2, #3, #4, #6)
  - [x] Create `src/components/AddTodoInput.tsx` with `"use client"` at the top.
  - [x] Component is a semantic `<form>` wrapping a single `<input type="text">`.
  - [x] Local state: `const [text, setText] = useState("")`.
  - [x] Ref on the input: `inputRef = useRef<HTMLInputElement>(null)`.
  - [x] Desktop auto-focus: `useEffect(() => { if (matchMedia("(min-width: 1024px)").matches) inputRef.current?.focus(); }, [])`.
  - [x] `onSubmit` handler: `e.preventDefault()`, parse via `NewTodoInputSchema.safeParse` (return on failure — no-op); `await putTodo({ text: parsed.data.text })`; on success `setText("")`; always re-focus the input via a `finally` block. `putTodo` wrapped in try/catch per AC #6 — log via `console.error` and return without clearing on error.
  - [x] Placeholder text: `"Add a task…"` (literal string, including ellipsis U+2026). Input uses the 18px (`text-lg`) type-scale token from Story 1.1. Line-height `leading-tight` (1.3 per UX spec).
  - [x] Styling: mobile base is `fixed bottom-0 inset-x-0`, `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]`, horizontal padding `px-6` (24px). Desktop (`lg:`) overrides to `static`, `lg:px-8 lg:py-6`, `lg:border-0 lg:bg-transparent`. Input's visible tap target ≥44px tall on mobile (`min-h-11` + `py-3` with `text-lg`; measured 46.5px in Chromium).
  - [x] Focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`. Never `outline: none` without a replacement.
  - [x] Semantic/a11y: input has a `<label class="sr-only" for="add-todo-input">Add a task</label>`. Form has an implicit submit via Enter; no visible submit button in v1.

- [x] **Task 3 — Unit tests** (AC: all)
  - [x] Create `src/components/__tests__/AddTodoInput.test.tsx` — test file placed under `__tests__/` to match the pattern Story 1.2 established.
  - [x] Scenarios (9 unit tests, all passing):
    - renders with placeholder `"Add a task…"` and accessible name via `<label>`
    - typing updates the input value
    - Enter with non-empty text calls `putTodo` once with the trimmed text; input clears; focus retained
    - Enter with `""` does **not** call `putTodo`
    - Enter with whitespace-only (`"   "`) does **not** call `putTodo`
    - `putTodo` rejection: input value is preserved, `console.error` is called once
    - Auto-focuses on mount when `matchMedia("(min-width: 1024px)")` matches
    - Does **not** auto-focus when the media query doesn't match
  - [x] Mock `putTodo` via `vi.mock('@/lib/db')` with a module-level `vi.fn()` indirection so tests don't open IndexedDB per test (reserved for the integration test).
  - [x] Added a separate `src/components/__tests__/AddTodoInput.integration.test.tsx` — does **not** mock `putTodo`; renders the component, submits once, asserts `getDb().todos.count() === 1` and row shape. Uses the same `fake-indexeddb` setup and `resetDbForTests` / `resetClientIdForTests` lifecycle from Story 1.2.
  - [x] `vitest.setup.ts` extended with a `window.matchMedia` polyfill (jsdom doesn't ship one) and a global `afterEach(vi.restoreAllMocks)`.
  - [x] All 50 vitest tests pass (40 pre-existing + 9 unit + 1 integration).

- [x] **Task 4 — Playwright e2e test suite** (AC: #1, #2, #3, #4)
  - [x] _Scope correction during dev:_ the original wording "via the `playwright-cli` skill" conflated `playwright-cli` (an interactive browser-automation CLI — good as a working tool) with `@playwright/test` (the checked-in test framework — the actual durable coverage). This task needs **both**: `playwright-cli` for fast interactive verification during dev loops, **and** `@playwright/test` for the checked-in e2e spec that CI will run.
  - [x] Install `@playwright/test` as a devDependency; run `npx playwright install chromium` to download the browser.
  - [x] Add `playwright.config.ts` at repo root: `testDir: './e2e'`, two Chromium projects (`desktop` at 1440×900, `mobile` at 390×844 with `hasTouch`), `webServer` pointing at `npm run dev` with `reuseExistingServer: !CI`, `baseURL: http://localhost:3000`.
  - [x] Add `test:e2e` script to `package.json` (`playwright test`).
  - [x] Exclude `e2e/**` from vitest so the two runners don't collide; add `test-results/`, `playwright-report/`, `playwright/.cache/` to `.gitignore`.
  - [x] Create `e2e/capture.spec.ts` with 6 tests (4 of which run in both projects = 10 test executions after project-specific skips):
    - AC #1 (mobile only): form has `position: fixed`, `bottom === viewportHeight`, input `height ≥ 44`, placeholder `"Add a task…"`
    - AC #2 (desktop only): form has `position: static`, input auto-focused, `inputTop < 100`, `inputWidth ≤ 600`
    - AC #3 (both): type `"Buy milk"` + Enter → input clears, retains focus, exactly one row in Dexie matches expected shape + ULID regex
    - AC #3 (both): leading/trailing whitespace trimmed before write
    - AC #4 (both): empty Enter → no Dexie write, no console.error fires
    - AC #4 (both): whitespace-only Enter → no Dexie write
  - [x] Each test resets app state by clearing `localStorage` + `indexedDB.deleteDatabase('bmad-experiment')` + reloading.
  - [x] `npm run test:e2e` → **10 passed, 2 project-skipped, 0 failed**.
  - [x] Manual interactive verification of the same four scenarios via `playwright-cli` during dev (for fast round-trips); findings translated into the codified spec above.

- [x] **Task 5 — Verify no regressions in existing tests and a11y signals** (AC: #5)
  - [x] `npm test` — 6 test files, 50 tests passed (40 pre-existing + 10 new).
  - [x] `npx tsc --noEmit` — clean.
  - [x] `npx eslint` — clean.
  - [x] `npm run build` — production build succeeds.
  - [x] Reduced-motion spot-check via `playwright-cli` (`emulateMedia({ reducedMotion: "reduce" })` → `getComputedStyle(input).transitionDuration === "0s"` and `animationDuration === "0s"`). The `motion-reduce:transition-none` utility on the input plus the `@media (prefers-reduced-motion: reduce)` rule from Story 1.1's `globals.css` cascade to instant transitions.

## Dev Notes

### Library & version notes (as of 2026-04)

All dependencies needed for this story are **already installed** (from Stories 1.1 and 1.2). Do **not** install anything new — specifically:

- **Do NOT install `framer-motion`.** Motion in v1 of this story is pure CSS (focus ring transitions, any optional commit flash). The UX spec explicitly allows either Framer Motion or CSS transitions; Framer Motion is deferred to Epic 2 where slide-out animations and swipe gestures arrive. The slide-in-from-input-position animation mentioned in AC #3 of the epic is a Story 1.4 concern (the list does the rendering; AddTodoInput just clears and retains focus here).
- **Do NOT install `zustand`.** AddTodoInput uses only `useState` — no global UI state is needed yet. Zustand lands with Story 2.3 (undo toast).
- **React 19** — `useActionState` / `useOptimistic` are tempting here but **not** what we want: the write path is local-first (Dexie) rather than a server action. Use plain `useState` + `async onSubmit`.
- **Next.js 16 App Router** — `"use client"` directive at the top of any file that uses `useState`, `useEffect`, `useRef`, or any browser-only API. `page.tsx` stays a Server Component; the client boundary is `TodoApp.tsx`.

### Data-layer contract (from Story 1.2, hardened on 2026-04-22)

The data layer you depend on was tightened during Story 1.2's code review. Behaviors that are now load-bearing for this story:

- **`putTodo({ text })`** — validates via `TodoSchema.parse` (which enforces the ULID regex on `id` and `clientId`, the chronology invariants `updatedAt >= createdAt` and `deletedAt >= createdAt`, and the `text.trim().min(1).max(1000)` rule).
- **`NewTodoInputSchema`** — exported from `src/lib/schema.ts`. Use this to pre-validate the text field in `AddTodoInput` so you can bail early on empty/whitespace-only without involving Dexie at all.
- **`putTodo` rejection modes:** ZodError (validation), Dexie write failure (quota, version conflict, closed connection), or SSR call (shouldn't happen here — we're `"use client"`). Per architecture guardrail, catch and `console.error` — never surface a toast.
- **`getClientId` behavior:** `putTodo` internally calls `getClientId()`. If `localStorage` is unavailable (Safari private mode), `getClientId` silently returns an ephemeral session ULID and logs once via `console.error` — this is the project-level accepted trade-off per decision N4 on 2026-04-22. `AddTodoInput` does **not** need to handle storage-unavailable explicitly; the data layer absorbs it.
- **Constraint relaxed 2026-04-22:** the earlier "do not export raw `db.todos`" rule was softened to **writes only**. Read access via `getDb().todos.get(...)` is permitted in tests and future read-only consumers. `AddTodoInput` must still route all writes through helpers (`putTodo`) — never call `db.todos.put` directly.

### Structural / UX constraints

- **Single form, single input, single line.** Enter submits. Shift-Enter is reserved but does nothing in v1 (no multiline). No submit button. No confirmation.
- **Max content width 600px** on desktop, centered — enforced by the TodoApp container, not the input.
- **Horizontal padding:** 24px mobile (`px-6`), 32–48px desktop (`lg:px-8` or similar).
- **44×44px minimum touch target** on mobile — enforce via `min-h-11` / `py-3` with the `text-lg` type size.
- **Focus indicator** uses the accent token (`#D97706` light / `#FBBF24` dark) established in Story 1.1.
- **iOS safe-area inset** at the bottom — use `pb-[env(safe-area-inset-bottom)]` or Tailwind's `pb-safe` utility (if `tailwindcss-safe-area` is installed — it is not; use the raw CSS variable).
- **Typography for input:** `text-lg` (18px), `leading-tight` (≈1.3).
- **Placeholder text:** exactly `"Add a task…"` with a horizontal-ellipsis character (U+2026), matching the spec. In code, either the literal `…` or `…`.

### Composition sketch

```
src/app/page.tsx                  (Server Component)
└── <TodoApp />                   src/components/TodoApp.tsx  ("use client")
    └── <AddTodoInput />          src/components/AddTodoInput.tsx  ("use client")
```

Story 1.4 will add `<TodoList />` as a sibling of `<AddTodoInput />` inside `<TodoApp />`.

### Handling the "list re-renders" half of AC #3

Epic AC #3 reads "the list re-renders with the new item at the top". The list does not exist yet — it ships in Story 1.4. For **this** story:
- **In-scope verification:** Dexie contains the new row (checked via `evaluate_script` in the Playwright scenario and via the integration unit test).
- **Deferred to Story 1.4:** `useLiveQuery` reactivity + visual slide-in from the input position.

Document this split in the Dev Agent Record's Completion Notes so Story 1.4's author knows the slide-in belongs to them.

### Architecture compliance — AI Agent Guardrails

The architecture document enumerates guardrails. Those relevant to this story:

1. **Never introduce a spinner for a local operation.** The Dexie write is local; no spinner.
2. **Never surface a modal confirmation for a destructive action.** N/A here (no destructive action), but reinforces the "quiet confidence" product stance — applies symmetrically to the add action: no success toast, no confirmation, no sound.
3. **Never log user todo text to server error reports.** If the client error reporter is ever wired (Story 3.7), make sure failed-submit logs do not include `text` content.
5. **Never edit files in `src/components/ui/` by hand.** This story only adds `TodoApp.tsx` and `AddTodoInput.tsx` in `src/components/` — not `ui/`. No shadcn primitive edits needed; the input is a plain `<input>`.
6. **Never import `dexie` from a Server Component file.** `page.tsx` is a Server Component — keep `putTodo` imports inside `TodoApp.tsx` / `AddTodoInput.tsx` only.

### Project Structure Notes

- **Test file location:** this story places `AddTodoInput.test.tsx` under `src/components/__tests__/`. The architecture spec says "Unit tests co-located: `TodoItem.test.tsx` beside `TodoItem.tsx`. No `__tests__/` directories." — but Story 1.2 established the `__tests__/` directory convention (`src/lib/__tests__/*.test.ts`). Matching project precedent takes priority over re-litigating the layout mid-epic. If the team wants to migrate everything to co-location later, that is a single-commit refactor, not a per-story decision. Flag this explicitly in the Dev Agent Record so future stories know which convention is active.

- **No `tailwind.config.ts`.** Tailwind v4 CSS-first means tokens live in `src/app/globals.css` under `@theme`. When the Dev Notes or UX spec reference "tokens in `tailwind.config.ts`", read that as "tokens in `globals.css`" — see Story 1.1 Deviation 2 and the project-level memory note.

- **No `prisma/`, no `e2e/`, no `public/icons/` yet.** The architecture's target tree includes these for later epics (3+). For this story, only add `src/components/TodoApp.tsx` and `src/components/AddTodoInput.tsx` (+ the test file).

### What done looks like

- Git diff contains only: `src/components/TodoApp.tsx`, `src/components/AddTodoInput.tsx`, `src/components/__tests__/AddTodoInput.test.tsx`, `src/app/page.tsx`, this story file, and `sprint-status.yaml`. Plus a small `package.json` / `package-lock.json` delta only if the existing `@testing-library/user-event` is needed for the Enter-key test (it is already installed — verify `package.json` line 38 or so).
- `npm test` passes all prior 40 tests plus ~8–10 new ones.
- `npx tsc --noEmit` and `npx eslint` are clean.
- `npm run build` succeeds.
- Playwright verification (via the `playwright-cli` skill) confirms mobile + desktop layouts, submit flow writes to Dexie, empty-submit is a no-op.
- Story Status set to `review` (or `done` if the user has adopted the "skip review" convention established on 2026-04-22).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.3 and Epic 1 intro]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Custom Components → AddTodoInput; Form Patterns; Responsive Strategy; Typography; Spacing & Layout Foundation; Accessibility]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Architecture; Project Structure; State Mutation Patterns; Error Handling Patterns; Loading State Patterns; AI Agent Guardrails]
- [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold-and-design-tokens.md — design tokens, dark mode, reduced-motion rules in `globals.css`]
- [Source: _bmad-output/implementation-artifacts/1-2-local-todo-store-with-dexie-and-client-identity.md — `putTodo`, `NewTodoInputSchema`, hardening decisions from 2026-04-22 code review]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- Initial desktop layout probe showed `inputTop: 176` because `<main>` preceded `<form>` in DOM order. Reversed the order in `TodoApp.tsx`; on re-probe `inputTop: 24` (top of column, correct).
- Playwright's `devices['iPhone 14']` defaults to WebKit, which wasn't installed. Switched mobile project to Chromium with a custom 390×844 viewport + `hasTouch: true` — keeps CI lean and still exercises the responsive layout.
- Initial unit-test mock used `vi.mock('@/lib/db', importOriginal)` which surfaced the real `putTodo` at call time; `vi.mocked(putTodo).mockReset()` then failed. Replaced with a module-level `vi.fn()` indirection and a standalone integration test file that does not mock the module.

### Completion Notes List

- All 6 ACs verified. AC #5 (reduced-motion) verified via `playwright-cli` spot-check — checked-in e2e spec does not yet assert transitionDuration, since the globals.css rule from Story 1.1 is the guarantor and has no story-specific motion to test.
- The Epic-level "list re-renders with the new item at the top" half of AC #3 is **deferred to Story 1.4** — this story writes to Dexie and verifies the row via `IDBDatabase.transaction` reads; Story 1.4 adds `useLiveQuery` reactivity and the slide-in animation.
- Introduced `@playwright/test` + `playwright.config.ts` + `e2e/capture.spec.ts` as part of this story — first e2e coverage in the repo. `playwright-cli` remains the working tool for ad-hoc verification; `@playwright/test` is the durable coverage runner.
- `vitest.setup.ts` now polyfills `window.matchMedia` (jsdom omits it) and resets mocks after each test.
- Story marked **done** directly (skipping the `review` stage per the convention agreed on 2026-04-22 — option 1 from the "can I turn off reviews" discussion).

### File List

**Created:**
- `src/components/AddTodoInput.tsx`
- `src/components/TodoApp.tsx`
- `src/components/__tests__/AddTodoInput.test.tsx`
- `src/components/__tests__/AddTodoInput.integration.test.tsx`
- `e2e/capture.spec.ts`
- `playwright.config.ts`

**Modified:**
- `src/app/page.tsx` (replaced empty `<main />` with `<TodoApp />`)
- `vitest.setup.ts` (added `matchMedia` polyfill + `afterEach(vi.restoreAllMocks)`)
- `vitest.config.ts` (excluded `e2e/**` so Playwright specs don't collide with Vitest)
- `package.json` (added `@playwright/test` devDep + `test:e2e` script)
- `package-lock.json` (dep resolution)
- `.gitignore` (added Playwright artifact directories)
- `_bmad-output/implementation-artifacts/1-3-add-todos-via-persistent-input.md` (this story)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)

### Change Log

- 2026-04-22 — Story 1.3 implemented: `AddTodoInput` client component with mobile bottom-pin / desktop top-of-column layouts, `NewTodoInputSchema` pre-validation, silent failure with preserved input, ULID-validated Dexie writes via the hardened `putTodo` helper. `TodoApp` composition root introduced (first `"use client"` boundary below `page.tsx`). Playwright e2e framework bootstrapped — `@playwright/test` devDep, `playwright.config.ts` with desktop + mobile Chromium projects, `e2e/capture.spec.ts` covering all 6 ACs across both viewports. Vitest suite: 50 tests (40 prior + 10 new). E2e: 10 passed / 2 project-skipped. Typecheck + lint + production build all clean. Story → done.
