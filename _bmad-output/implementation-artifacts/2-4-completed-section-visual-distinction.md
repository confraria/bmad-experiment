# Story 2.4: Completed section visual distinction

Status: done

## Story

As a user,
I want completed todos to recede visually while remaining accessible,
so that my active list stays emotionally light without losing history.

## Acceptance Criteria

1. **Two visual zones — active above, completed below.** Given there are both active and completed todos, when `TodoList` renders, then active todos appear at the top with primary typographic weight, and completed todos appear below with strikethrough + secondary weight + reduced opacity.

2. **Zone separation via whitespace and typography only.** Given the two zones render together, when I look at the list, then the separation between zones is communicated by whitespace and typographic contrast only — no dividing lines, no "Active" / "Completed" section headers, no icons.

3. **Completing a todo moves it to the completed zone within ≤250ms.** Given I toggle a todo from active to completed, when the state changes, then the row visually moves from the active zone to the completed zone with a transition ≤250ms, respecting `prefers-reduced-motion`.

4. **EmptyState only when there are no todos at all.** Given all todos are completed (none are active), when the list renders, then completed todos remain visible in the completed zone and `EmptyState` is NOT shown.

5. **No regressions.** Given the existing capture, completion, delete, and undo flows, when this story lands, then all existing Vitest and Playwright tests still pass.

## Tasks / Subtasks

- [x] **Task 1 — Split `TodoList.tsx` into active and completed zones** (AC: #1, #2, #4)
  - [x] Import `useTodos` as before; the hook returns a flat `Todo[] | undefined` — no change to the hook.
  - [x] Derive `active` and `completed` arrays inline via `.filter()`.
  - [x] EmptyState guard unchanged — fires when `todos.length === 0`.
  - [x] Active zone: `<ul aria-label="Todos">` rendered when `active.length > 0`.
  - [x] Completed zone: second `<ul>` with `mt-6` (when both zones present) rendered when `completed.length > 0`.
  - [x] No divider, heading, or label between zones.

- [x] **Task 2 — Verify `TodoItem` completed styling is correct** (AC: #1, #3)
  - [x] Confirmed: `TodoItem` applies `line-through text-muted-foreground opacity-60` when `todo.completed` is true.
  - [x] Confirmed: CSS `transition-[color,opacity,text-decoration-color] duration-[var(--duration-base)] ease-out` is present (200ms ≤ 250ms AC).
  - [x] Confirmed: `globals.css` line 163–169 sets `transition-duration: 0ms !important` for `prefers-reduced-motion: reduce`.
  - [x] No code changes to `TodoItem.tsx` or `globals.css`.

- [x] **Task 3 — Update `TodoList` unit tests** (AC: #1, #4, #5)
  - [x] Updated "renders completed-but-not-deleted todos in the same list" → "renders active todos above completed todos in separate zones": expects `['active', 'already-done']` and `getAllByRole('list')` length 2.
  - [x] Added "completed-only list shows completed zone and NOT EmptyState".
  - [x] All 7 TodoList tests pass.

- [x] **Task 4 — Add e2e coverage in `e2e/complete.spec.ts`** (AC: #1, #3)
  - [x] Added Story 2.4 describe block with 3 cross-project scenarios (AC #1 DOM order, AC #2 dual-`<ul>`, AC #4 completed-only).
  - [x] All 3 new e2e scenarios pass on both mobile and desktop.

- [x] **Task 5 — Regression sweep** (AC: #5)
  - [x] `npm test` — 99 tests, 15 files, all pass
  - [x] `npm run test:e2e` — 34 passed, 10 skipped
  - [x] `npm run lint` — clean
  - [x] `npx tsc --noEmit` — clean
  - [x] `npm run build` — clean

## Dev Notes

### Only `TodoList.tsx` needs changing

The visual distinction for completed items (`line-through`, `opacity-60`, `text-muted-foreground`) was already implemented in Story 2.1. The only missing piece is the **zone layout**: currently both active and completed items are in a single `<ul>` in mixed order. Story 2.4 splits them into two separate `<ul>` elements with whitespace between.

**Do not touch:**
- `src/components/TodoItem.tsx` — completed styling is already correct
- `src/hooks/useTodos.ts` — returns flat array of non-deleted todos; split happens in `TodoList`
- `src/app/globals.css` — `prefers-reduced-motion` is already handled globally

### `useTodos` ordering and zone ordering

`useTodos` returns todos ordered by `id` (ULID) descending — i.e., newest-first. Within each zone, preserve this order:
- Active zone: newest-first (same as current)
- Completed zone: newest-first by creation time (ULID order)

No changes to `useTodos` needed. Just `.filter()` in `TodoList`.

### Transition is CSS-only, not a position animation

The ≤250ms AC refers to the **visual style transition** (strikethrough fading in, opacity dropping), not an animated position change. When a todo is toggled:
1. `updateTodo` writes to Dexie
2. `useLiveQuery` re-renders `TodoList`
3. The item moves from active zone to completed zone (instant DOM change)
4. The completed styling (strikethrough, opacity) transitions in over 200ms via the CSS `transition` on `TodoItem`'s `<button>`

`globals.css` at line 163–169 already sets `transition-duration: 0ms !important` for `prefers-reduced-motion: reduce`, so AC #3's reduced-motion clause is satisfied automatically.

No `animate()` calls, no `motion/react`, no FLIP animations needed.

### No section headers per AC #2

The UX spec typography table mentions "completed section header (desktop only) — text-xl". **The AC overrides this** explicitly: "no 'Active' / 'Completed' section headers". Do NOT add any `<h2>`, `<p>`, or label element between zones.

The two `<ul>` elements get no `aria-label` on the completed zone. Individual items communicate their state via `aria-pressed="true"` on the button.

### `EmptyState` guard — do NOT change the trigger condition

`EmptyState` shows when `!todos || todos.length === 0` — i.e., when there are no todos at all (including completed). If there are completed todos and no active todos, show the completed zone, not EmptyState. The current `if (!todos || todos.length === 0) return <EmptyState />` check is correct for this story — it fires when `todos` (the full array) is empty.

### The existing TodoList test that needs updating

`src/components/__tests__/TodoList.test.tsx` line 102–115: "renders completed-but-not-deleted todos in the same list" currently expects:
```ts
expect(items).toEqual(['already-done', 'active']);
```
This was correct when all todos were in one unsorted list (newest-first, so the completed one seeded second appeared first). With Story 2.4, the active item appears first (active zone), then the completed item (completed zone):
```ts
expect(items).toEqual(['active', 'already-done']);
```

Also update the test name to reflect the new behaviour: "renders active todos above completed todos in separate zones".

### Architecture guardrails

1. **No spinner for local Dexie operations.** Zone re-render is instant.
2. **No modal or confirmation.** The zone separation is purely presentational.
3. **Do not edit `src/components/ui/`.** No shadcn primitive changes.
4. **SSR-safe.** `TodoList` is already a client component (`'use client'`); no new server exposure.

### Files expected to change

- `src/components/TodoList.tsx` — split into two zones
- `src/components/__tests__/TodoList.test.tsx` — update 1 existing test + add 2 new tests
- `e2e/complete.spec.ts` — add Story 2.4 describe block with 3 scenarios
- `_bmad-output/implementation-artifacts/2-4-completed-section-visual-distinction.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

### Files that must NOT be changed

- `src/components/TodoItem.tsx` — completed styling already correct; no changes
- `src/hooks/useTodos.ts` — returns correct data; no changes
- `src/app/globals.css` — reduced-motion already handled; no changes
- `src/components/TodoApp.tsx` — no composition changes needed
- `src/components/ui/` — hands off shadcn primitives

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no surprises.

### Completion Notes List

- `TodoList.tsx` split into active zone (`<ul aria-label="Todos">`) and completed zone (second `<ul>` with `mt-6` when both zones present). No other files changed.
- `TodoList.test.tsx`: updated 1 existing test (order flipped to active-before-completed), added 1 new test (completed-only list). 7 total, all pass.
- `e2e/complete.spec.ts`: added Story 2.4 describe block with 3 cross-project scenarios (DOM order, dual-ul, completed-only). All pass.
- `prefers-reduced-motion` handled by existing `globals.css` global rule — no new code.
- 99 unit tests, 34 e2e tests, lint/tsc/build all clean.

### File List

- `src/components/TodoList.tsx`
- `src/components/__tests__/TodoList.test.tsx`
- `e2e/complete.spec.ts`
- `_bmad-output/implementation-artifacts/2-4-completed-section-visual-distinction.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-04-22: Story 2.4 implemented — TodoList split into active/completed zones with mt-6 whitespace separation, 2 new unit tests, 3 new e2e scenarios. Status: done.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2 / Story 2.4]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Journey 2 (Complete); Active vs. completed distinction; Motion Design Principles; Typography scale]
- [Source: _bmad-output/planning-artifacts/architecture.md — TodoList.tsx; useTodos; AI Agent Guardrails]
- [Source: src/components/TodoList.tsx — current single-zone implementation]
- [Source: src/hooks/useTodos.ts — flat array of non-deleted todos, ULID-descending order]
- [Source: src/components/TodoItem.tsx — completed styles: line-through, opacity-60, muted-foreground; CSS transition already 200ms]
- [Source: src/app/globals.css — --duration-base 200ms; prefers-reduced-motion rule at line 163–169]
- [Source: src/components/__tests__/TodoList.test.tsx — existing tests, 1 needs updating]
- [Source: e2e/complete.spec.ts — Story 2.1 tests to preserve; helpers: resetAppState, readTodos, addTodo]
