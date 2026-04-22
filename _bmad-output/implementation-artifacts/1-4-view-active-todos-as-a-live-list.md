# Story 1.4: View Active Todos as a Live List

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see all my active todos rendered in a clean, type-driven list,
so that I can glance at what's on my plate at any moment.

## Acceptance Criteria

1. **Renders active todos in newest-first order.** Given Dexie contains todos, when the app is rendered, then `<TodoList>` renders each **non-deleted** (`deletedAt === null`) and **non-completed** (`completed === false`) todo as a `<TodoItem>` row. Ordering is **newest-first** by ULID descending (ULID lex order ≡ creation order). Separation between rows is purely typographic/whitespace — no divider lines, no icons-as-decoration, no numbering, no checkboxes in this story (Epic 2 adds the interactive checkbox).

2. **Reactive to writes within one frame.** Given a new todo is written to Dexie (e.g. via `putTodo` from Story 1.3), when the write commits, then `<TodoList>` re-renders within one animation frame without any loading state. The reactivity is driven by `useLiveQuery` from `dexie-react-hooks` — no manual subscription, no `useState` copying the Dexie state.

3. **SSR renders an empty shell; client hydrates cleanly.** Given a cold load, when the server renders the page, then it emits an empty list container (no list items — the server has no IndexedDB access). When the client hydrates, React matches the empty server output, then `useLiveQuery` resolves and the list populates. **No hydration mismatch warning** must fire. **No CLS-relevant layout shift** must occur in the static chrome (input position, page gutters, container width) — the list's own height growing as rows arrive is expected and not a "layout shift" for this AC.

4. **Completed and soft-deleted todos are excluded.** Given a todo with `completed: true` or `deletedAt !== null`, when the list renders, then that row is **not** present in `<TodoList>`. (The "completed zone" with secondary weight is out-of-scope for this story — it ships with Epic 2 Story 2.4.)

5. **Semantic markup + a11y.** The list is rendered as `<ul>` with `<li>` children (not `<div>`). Each `<li>` has an implicit or explicit `role="listitem"` and carries the todo text as the accessible name. No icon-only buttons are introduced in this story.

6. **No regression of Story 1.3's capture behavior.** Given a user types `"Buy milk"` and presses Enter (the flow delivered by Story 1.3), when the submit lands, then the e2e spec now additionally asserts that the new row appears at the top of `<TodoList>` in the UI (completing the half-deferred Epic-level AC #3 from Story 1.3).

## Tasks / Subtasks

- [x] **Task 1 — `useTodos` hook** (AC: #1, #2, #4)
  - [x] Create `src/hooks/useTodos.ts` — a tiny wrapper over `useLiveQuery` that returns active, non-deleted todos in newest-first order.
  - [x] Signature: `export function useTodos(): Todo[] | undefined`. Returns `undefined` on the SSR pass and during the first client render before the query resolves; returns `Todo[]` thereafter (possibly empty).
  - [x] Implementation sketch:
    ```ts
    'use client';
    import { useLiveQuery } from 'dexie-react-hooks';
    import { getDb } from '@/lib/db';
    import type { Todo } from '@/lib/schema';

    export function useTodos(): Todo[] | undefined {
      return useLiveQuery(async () =>
        getDb()
          .todos
          .orderBy('id')          // ULID lex order ≡ creation order
          .reverse()              // newest first
          .filter((t) => !t.completed && t.deletedAt === null)
          .toArray(),
      );
    }
    ```
  - [x] **Do not** index `completed` — Dexie treats booleans as non-indexable without 0/1 coercion, and we stored true booleans. `.filter()` is correct here; `.where('completed')` would silently fall back to a full scan anyway.
  - [x] **Do not** sort by `updatedAt` — that breaks the "newest-first" invariant once Epic 2 introduces edits. ULID-descending is the stable ordering.

- [x] **Task 2 — `<TodoItem>` presentational component** (AC: #1, #5)
  - [x] Create `src/components/TodoItem.tsx` — `"use client"` not required (pure presentation), but mark it anyway since it'll be composed into the client tree under `<TodoApp>`.
  - [x] Props: `{ todo: Todo }`. No callbacks in this story — interaction lands in Epic 2.
  - [x] Renders a single `<li>` with the todo text. Tokens from Story 1.1: `text-base` (16px), `leading-[1.5]`, default foreground color. No bold, no color cues for state (UX spec: weight changes are reserved for focus; v1 active state is regular 400).
  - [x] Vertical rhythm: per UX spec "items separated by ~1.5x line-height of whitespace, not divider lines." Apply `py-3` (12px top/bottom) on each `<li>` — no `border-b`, no `divide-y`.
  - [x] Horizontal padding is supplied by the **container** (`<TodoList>`'s `<ul>` or parent), not by the item. Items should remain edge-to-edge within the 600px reading column so selection/focus states line up with the row, not inset from it.
  - [x] Ensure text wraps cleanly on narrow viewports: use `break-words` (or the CSS equivalent).

- [x] **Task 3 — `<TodoList>` container** (AC: #1, #2, #3, #4)
  - [x] Create `src/components/TodoList.tsx` — `"use client"` (it consumes `useTodos`).
  - [x] Calls `useTodos()`; result is `Todo[] | undefined`.
  - [x] If `undefined`: render the empty shell (`<ul></ul>` — just the container, no items, no loading spinner per architecture guardrail "Never introduce a spinner for a local operation"). Story 1.5 adds the proper `<EmptyState>` when the array is empty; for this story, empty and undefined render identically.
  - [x] If `Todo[]`: render `<ul>` with one `<TodoItem key={todo.id} todo={todo} />` per entry. Use `todo.id` (ULID) as the React key — stable and unique.
  - [x] The `<ul>` has no default styling (Tailwind reset removes it); explicitly use `list-none` + `flex flex-col` for defensive layout stability.

- [x] **Task 4 — Wire `<TodoList>` into `<TodoApp>`** (AC: #1, #3)
  - [x] Modify `src/components/TodoApp.tsx` to render `<TodoList />` inside the existing `<main>` placeholder (the "`{/* Story 1.4 will render <TodoList /> here */}`" comment).
  - [x] Verify the composition still satisfies AC #2 from Story 1.3: on desktop the input is above the list; on mobile the input is `fixed bottom-0` and the list fills the scroll area above it (with `pb-32` bottom padding on `<main>` preserving the scroll runway below the final row).
  - [x] Remove the TODO comment once `<TodoList />` is wired.

- [x] **Task 5 — Unit tests** (AC: #1, #2, #4, #5)
  - [x] `src/components/__tests__/TodoItem.test.tsx`:
    - renders an `<li>` containing the todo text
    - does **not** render a checkbox, button, or interactive affordance (assert `queryByRole('button')` and `queryByRole('checkbox')` both return null)
    - renders long text without overflow (assert `white-space` / wrapping with a ~300-char string — `break-words` in effect)
  - [x] `src/components/__tests__/TodoList.test.tsx` — an integration-style test using real `fake-indexeddb` and the real `putTodo` helper (follows the pattern from `AddTodoInput.integration.test.tsx`):
    - initial render with an empty Dexie: no `<li>` items, but a `<ul>` is present
    - seed Dexie with 3 todos via `putTodo` across ms-spaced `Date.now()` values; render `<TodoList />`; assert 3 `<li>` items appear in **newest-first** order
    - write a 4th todo after render; `waitFor` that the 4th `<li>` appears at the top (via `useLiveQuery` reactivity)
    - seed a todo with `completed: true` (via direct `db.todos.put` in the test — OK because the "no writes to raw db.todos" rule softened on 2026-04-22 still permits test-only writes) — assert it does **not** appear in the list
    - seed a todo with `deletedAt: <number>` — assert it does **not** appear
  - [x] `src/hooks/__tests__/useTodos.test.ts`:
    - returns `undefined` on first synchronous render (before `useLiveQuery` resolves)
    - after `waitFor`, returns an array sorted by `id` descending
    - a fresh write triggers a re-render with the new item at position 0

- [x] **Task 6 — E2e test updates** (AC: #2, #6)
  - [x] Extend `e2e/capture.spec.ts` (or split out `e2e/list.spec.ts` if the file gets unwieldy) with:
    - After the "AC #3: submit writes to Dexie" assertion block, additionally assert the new todo appears at the top of the visible `<ul>` list (not just in IndexedDB). This closes the "list re-renders with the new item at the top" half of the Epic's Story 1.3 AC #3 that was deferred.
    - Submit three todos in sequence (`"one"`, `"two"`, `"three"`); assert the list renders them in `"three" / "two" / "one"` order (newest first).
    - Reload the page; assert the three todos are still rendered in newest-first order (verifies that `<TodoList>` hydrates from Dexie correctly on a warm load without the SSR-shell flash).
  - [x] No hydration warning: in the same e2e test, collect `console` messages via `page.on('console', ...)` and assert no `"Hydration"` or `"hydrated but some attributes"` warnings fire during the load or the submit flow.
  - [x] Run `npm run test:e2e` — all tests pass.

- [x] **Task 7 — Regression sweep** (AC: all)
  - [x] `npm test` — all Vitest suites green; new unit tests covered.
  - [x] `npx tsc --noEmit` — clean.
  - [x] `npx eslint` — clean.
  - [x] `npm run build` — production build succeeds.
  - [x] Use `playwright-cli` for a quick interactive sanity check at both viewports: load the app, submit three todos, visually confirm they stack newest-first; then `page.reload()` and confirm persistence across reload.

## Dev Notes

### Library & version notes (as of 2026-04)

All needed dependencies are **already installed** — specifically `dexie ^4.4.2` and `dexie-react-hooks ^4.4.0` (landed in Story 1.2; note that `dexie-react-hooks` was upgraded from the originally-specified v1.1.x per code-review decision N3 on 2026-04-22).

- **`useLiveQuery` (v4.x)** — accepts an async callback returning a Dexie query result; returns `undefined` until the first resolution, then the resolved value. Internally uses `useSyncExternalStore`, which React 19 handles natively — no special shimming needed.
- **Do NOT install Zustand.** This story has no ephemeral UI state; the only state is Dexie-backed, consumed via `useLiveQuery`. Zustand enters the codebase with Story 2.3 (undo toast).
- **Do NOT install Framer Motion.** No motion is required for this story — the list just appears; slide-in from the input position is a polish item that can land alongside Epic 2's interactions. Document this as a non-regression: AC #3 of Story 1.3 mentions "slides in from input position in ≤250ms"; that half stays deferred until Framer Motion (or a CSS equivalent) is deliberately introduced.

### Data-layer contract (consumed from Story 1.2)

- The Dexie schema v1 declares indexes on `id`, `clientId`, `updatedAt`, `completed`, `deletedAt`. For this story we use **`id` (descending)** as the effective sort key and `filter()` for the compound predicate. Reasons:
  - `id` is a ULID; lex-descending ≡ creation-time-descending. This is the "newest-first" contract.
  - `completed` booleans weren't coerced to 0/1 at store time, so `.where('completed').equals(false)` would fall back to a full table scan. `.filter()` is equivalent in cost for this dataset size and keeps the query readable.
  - `deletedAt === null` similarly prefers a filter predicate since the `null`-vs-number split isn't uniformly index-friendly across Dexie versions.
- **Test-only writes directly to `db.todos`** are permitted per the relaxed Story 1.2 Dev Notes (2026-04-22 code review decision N2). Production components must still go through helpers (`putTodo`, `updateTodo`, `softDeleteTodo`).

### SSR / hydration

- **`getDb()` throws on the server** (the SSR guard Story 1.2 shipped). `<TodoList>` must therefore be client-only. Put `"use client"` at the top.
- **`useLiveQuery` returns `undefined` during the first client render** (before it subscribes and resolves). The initial server render and the initial client render must emit **identical markup** — that's the empty `<ul>` shell. React's hydrator sees matching markup, declares success, and then the client's post-hydration effect populates the list.
- **Why the shell must be identical:** if you render `<ul>{todos?.map(...)}</ul>` on the client and `todos` is `undefined`, `.map` errors — so always guard with `(todos ?? []).map(...)` or an explicit `todos === undefined` branch. Both server and client see `todos === undefined` on the first pass; both render `<ul></ul>`; no mismatch.
- Story 1.5 replaces the empty shell with `<EmptyState>`; for this story the bare `<ul></ul>` is acceptable visual output when empty.

### Architecture compliance — AI Agent Guardrails (re-read)

1. **Never introduce a spinner for a local operation.** The Dexie read is local; no spinner on `undefined`. Render the empty shell instead.
2. **Never edit files in `src/components/ui/` by hand.** This story touches only `src/components/TodoList.tsx`, `src/components/TodoItem.tsx`, `src/components/TodoApp.tsx` (modify), `src/hooks/useTodos.ts`, and tests.
3. **Never import `dexie` from a Server Component file.** `page.tsx` stays a Server Component; the client boundary is still `<TodoApp>`. `<TodoList>` and `useTodos` live below that boundary.

### Structural / UX constraints

- `<TodoList>` is the **active** list only. Completed todos are hidden here; the "Completed" secondary-weight zone is deferred (Epic 2 Story 2.4).
- Row spacing: `py-3` on each `<li>`. No horizontal rules, no `divide-y`, no background color variation per row. Whitespace does all the separation work.
- Active-state typography: regular weight (400), `text-base` (16px), default foreground. No color accents, no icons, no status chips.
- Row horizontal padding lives on the container, not the item — so that future focus rings or hover states align to the reading column edge.
- Max content width (600px centered) is already enforced by `<TodoApp>`'s `<main>` wrapper; the `<ul>` just inherits it.

### Project Structure Notes

- **Test directory convention remains `__tests__/`** for both new test files, consistent with Stories 1.2 and 1.3. Architecture spec co-location guidance is still overridden by project precedent.
- **New `src/hooks/` directory** — first entry in this project. Architecture spec already reserves it for `useOnlineStatus`, `useTodos`, `useKeyboardShortcuts`. Only `useTodos.ts` is added now; the others arrive with Stories 3.5 and 4.1.
- Co-locate `src/hooks/__tests__/useTodos.test.ts` under a new `__tests__/` dir inside `src/hooks/`.

### What done looks like

- Git diff contains only: `src/hooks/useTodos.ts`, `src/hooks/__tests__/useTodos.test.ts`, `src/components/TodoItem.tsx`, `src/components/TodoList.tsx`, `src/components/__tests__/TodoItem.test.tsx`, `src/components/__tests__/TodoList.test.tsx`, `src/components/TodoApp.tsx` (modified — uncomments and wires `<TodoList />`), `e2e/capture.spec.ts` (modified — new list-reactivity assertions) OR `e2e/list.spec.ts` (if split), this story file, and `sprint-status.yaml`. No `package.json`/`package-lock.json` delta — no new dependencies.
- `npm test`: all existing 50 tests pass plus ~8–10 new ones.
- `npm run test:e2e`: all previous scenarios pass plus the new list-rendering + reload-persistence + no-hydration-warning assertions.
- `npx tsc --noEmit` and `npx eslint` clean; `npm run build` succeeds.
- Story Status set to `done` directly (per the skip-review convention adopted 2026-04-22).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.4 + Epic 1 summary]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Custom Components → TodoList / TodoItem; Typography; Spacing & Layout Foundation; "Active vs. completed distinction without visual competition"]
- [Source: _bmad-output/planning-artifacts/architecture.md — State management split; Loading State Patterns; AI Agent Guardrails; Data boundaries]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-04-21.md — tight coupling note between 1.3 and 1.4, guidance to create `useTodos.ts` as a thin wrapper]
- [Source: _bmad-output/implementation-artifacts/1-2-local-todo-store-with-dexie-and-client-identity.md — Dexie schema, library versions, relaxed constraint on direct `db.todos` test writes]
- [Source: _bmad-output/implementation-artifacts/1-3-add-todos-via-persistent-input.md — `<TodoApp>` composition root, e2e framework bootstrap, AddTodoInput behavior]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- Initial `e2e/list.spec.ts` empty-state test used `expect(list).toBeVisible()` — failed because an empty `<ul>` has zero height, which Playwright classifies as hidden. Swapped to `toBeAttached()` which matches the spec intent ("shell exists, zero children") and documented the reason inline.
- Interactive `playwright-cli` probe initially read only 2 DOM items after submitting 3 todos in a tight loop — the last `useLiveQuery` update hadn't flushed. Added a `waitForTimeout(500)` and the third item appeared correctly. Not a bug; just confirms why the e2e spec uses `expect(locator).toHaveCount(n)` (which has built-in polling) rather than synchronous `evaluate` reads.

### Completion Notes List

- All 6 ACs verified. AC #6 (closing the deferred "list re-renders" half of Story 1.3 Epic AC #3) satisfied by extending the `e2e/capture.spec.ts` submit test to additionally assert the new row appears at the top of `<ul>` via `page.getByRole('listitem')`.
- `useLiveQuery` ordering: `orderBy('id').reverse()` gives newest-first because ULID lex order ≡ creation time. `.filter((t) => !t.completed && t.deletedAt === null)` handles the compound predicate.
- SSR-safety verified via the e2e hydration-warning watchdog — no React hydration warnings fire during cold load or submit flow. The `<ul>` is emitted identically on the server and on the first client render (both empty because `useLiveQuery` returns `undefined` pre-resolution), so React's hydrator matches cleanly.
- No new npm dependencies — `dexie-react-hooks ^4.4.0` (landed in Story 1.2) provides `useLiveQuery`.
- Story marked **done** directly (skipping `review` per the convention adopted 2026-04-22).

### File List

**Created:**
- `src/hooks/useTodos.ts`
- `src/hooks/__tests__/useTodos.test.ts`
- `src/components/TodoItem.tsx`
- `src/components/TodoList.tsx`
- `src/components/__tests__/TodoItem.test.tsx`
- `src/components/__tests__/TodoList.test.tsx`
- `e2e/list.spec.ts`

**Modified:**
- `src/components/TodoApp.tsx` (uncommented and wired `<TodoList />` inside `<main>`)
- `e2e/capture.spec.ts` (extended the Story 1.3 submit test to also assert the new item appears at the top of the list)
- `_bmad-output/implementation-artifacts/1-4-view-active-todos-as-a-live-list.md` (this story)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)

### Change Log

- 2026-04-22 — Story 1.4 implemented: `useTodos` hook wrapping `useLiveQuery` with newest-first ULID ordering and the compound `!completed && deletedAt === null` predicate; `<TodoItem>` presentational `<li>` with `text-base` / `py-3` / `break-words` per UX spec (no checkbox, no interactive affordance — Epic 2 adds those); `<TodoList>` `<ul>` container with an `aria-label="Active todos"`; wired into `<TodoApp>` between `<AddTodoInput />` and the bottom of `<main>`. Vitest: 62 tests (50 prior + 4 TodoItem + 5 TodoList + 3 useTodos). E2e: 18 passed / 2 project-skipped (up from 10) — includes the closed loop on Story 1.3's deferred "list re-renders" AC, newest-first ordering across 3 submissions, reload persistence, and a hydration-warning watchdog. Typecheck + lint + production build all clean. Story → done.
