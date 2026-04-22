# Story 1.5: Empty State as the Onboarding

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a first-time user,
I want a clean, non-performative empty state that invites me to start typing,
so that no onboarding, tour, or welcome copy is needed.

## Acceptance Criteria

1. **Empty state shows only the input.** Given Dexie contains zero active todos (either a first-time install or a state where every todo is completed or soft-deleted), when the app is rendered, then the **only** visible UI is `<AddTodoInput>` with its placeholder `"Add a task…"`. No illustration, no "Welcome!" copy, no tutorial, no empty-state graphic, no helper text, no badge count, no "You have 0 tasks" sentence, no SVG icon. Silence is the feature.

2. **The `<ul>` is not emitted when the list is empty.** Given the above, when the client renders, then `<TodoList>` renders **no `<ul>` container** (and therefore no `aria-label="Active todos"`) — the DOM contains nothing where the list would be. The Story 1.4 e2e assertion that the `<ul>` is attached on empty Dexie is superseded by this story and must be updated to assert the `<ul>` is **not** attached.

3. **First add replaces the empty state without content shift.** Given a user adds their first todo from the empty state, when the new row appears, then `<AddTodoInput>` does not shift position (mobile: `fixed bottom-0` is unchanged; desktop: `<AddTodoInput>` is the first child of `<TodoApp>` and the list appears in `<main>` below it). No layout thrash, no jump, no height recalculation of static chrome.

4. **SSR renders the same nothing.** Given a cold load, when the server renders `<TodoList>`, then it emits nothing (no `<ul>`) because `useLiveQuery` returns `undefined` pre-hydration. When the client hydrates and `useLiveQuery` resolves to `[]`, it continues to render nothing — server output and the first client render are identical, so no hydration mismatch warning fires.

5. **Extraction: named `<EmptyState>` component.** Given the empty branch is currently inlined in `<TodoList>` as "render an empty `<ul>`", when this story lands, then the zero-items branch is extracted into `src/components/EmptyState.tsx` — a named component that returns `null` (today) but is the single future-edit point if the product ever decides to add a deliberately-styled placeholder. `<TodoList>` chooses between `<EmptyState />` and the `<ul>` based on whether `todos` has ≥1 entry.

6. **No regressions of Stories 1.3 or 1.4.** Given the existing capture + list behaviors, when the new empty branch lands, then all prior Vitest suites (62 tests) and Playwright e2e specs (after updating the one Story 1.4 assertion noted in AC #2) pass. `npm run build`, `npx tsc --noEmit`, and `npx eslint` stay clean.

## Tasks / Subtasks

- [x] **Task 1 — Extract `<EmptyState>` component** (AC: #1, #5)
  - [x] Create `src/components/EmptyState.tsx`. Mark `"use client"` for consistency with its siblings (it lives under the `<TodoApp>` client boundary).
  - [x] Initial implementation is literally `export function EmptyState() { return null; }`. No JSX, no markup, no className.
  - [x] Document intent inline — one short comment explaining *why* this renders `null` (UX spec: "Silence is a feature. Fill [empty states] with polish, not content.") so a future edit doesn't casually add a "Welcome!" block.

- [x] **Task 2 — Branch `<TodoList>` on zero items** (AC: #2, #4, #5)
  - [x] Modify `src/components/TodoList.tsx`: when `useTodos()` returns `undefined` OR an empty array, render `<EmptyState />`. When it returns a non-empty array, render the existing `<ul>` with `<TodoItem>` children.
  - [x] Keep the hydration guarantee: server renders `<EmptyState />` (null) because `useLiveQuery` is `undefined` on the SSR pass; first client render renders `<EmptyState />` (null) too. Once `useLiveQuery` resolves client-side, the component either stays on `<EmptyState />` (empty array) or swaps to `<ul>`.
  - [x] Do **not** render a hidden `<ul>` for "consistency" — the spec is that the empty branch emits nothing.

- [x] **Task 3 — Unit tests** (AC: #1, #2, #4, #5)
  - [x] `src/components/__tests__/EmptyState.test.tsx`:
    - renders nothing (`container.firstChild` is `null`)
    - function is pure — calling it twice returns the same output
  - [x] Update `src/components/__tests__/TodoList.test.tsx`:
    - change the "renders a `<ul>` with zero items when Dexie is empty" scenario to assert there is **no** `<ul>` (query by role `list` returns null) and there are no list items.
    - add a new scenario: seed one todo, write it, assert the `<ul>` appears; then mark/delete it via a test-only direct `db.todos` write so the list becomes empty again; assert the `<ul>` disappears. This exercises the `[] → <ul> → []` transition and the component's reactivity to becoming empty.

- [x] **Task 4 — E2e updates** (AC: #1, #2, #3)
  - [x] Update `e2e/list.spec.ts` `"AC #1: empty state renders an empty <ul>"` test:
    - Rename to `"Story 1.5 AC #1 + #2: empty state renders nothing where the list would be"`.
    - Assert `page.getByRole('list', { name: 'Active todos' })` has `toHaveCount(0)` (attached assertion was the old behavior; now we want zero).
    - Keep `expect(page.getByRole('listitem')).toHaveCount(0)` and `expect(page.getByRole('progressbar')).toHaveCount(0)`.
    - Assert `page.locator('#add-todo-input')` is still visible — the input surface is the *entire* empty state.
  - [x] Add a new test to `e2e/list.spec.ts`: `"AC #3: adding the first todo does not shift the input"`.
    - Reset state; record `inputBoundingBox = await input.boundingBox()`.
    - Submit one todo; assert the list now has exactly 1 row.
    - Re-record the input's bounding box; assert `{ x, y, width, height }` are unchanged (allow 0.5px of float tolerance).
    - Run this assertion in both `desktop` and `mobile` projects (no `test.skip` — the invariant holds on both viewports).

- [x] **Task 5 — Regression sweep** (AC: #6)
  - [x] `npm test` — all Vitest suites pass (expected delta: +2 EmptyState tests, +1 modified TodoList test, +1 new TodoList transition test).
  - [x] `npm run test:e2e` — all Playwright specs pass (with the 1.4 assertion updated per Task 4).
  - [x] `npx tsc --noEmit` — clean.
  - [x] `npx eslint` — clean.
  - [x] `npm run build` — clean.
  - [x] Quick `playwright-cli` sanity: open the app with fresh state, confirm the input is the only visible element (no `<ul>` in DOM), submit one todo, confirm `<ul>` appears and input bounding box is unchanged.

## Dev Notes

### Philosophy — read this first

This is a deliberately **tiny** story. The UX spec is unusually emphatic:

> "Onboarding tours, welcome modals, empty-state tutorials." **— explicitly rejected.**
>
> "The empty state is the tutorial. A single input field says 'Add a task…' and that is enough."
>
> "Silence is a feature. Empty states, pauses, and blank space communicate calm. Fill them with polish, not content."

The right implementation is therefore a named component that renders `null`. Two LLM temptations to resist:

1. **"Just add a subtle little something — maybe a single-line hint, or a faint divider, or a tiny icon."** No. Read the UX spec section "Avoid At All Costs" and the emotional-design principle "Silence is a feature." If we ever add content here, it will be a deliberate product decision, not a dev's reflex to fill dead space.
2. **"The empty `<ul>` from Story 1.4 is already invisible — this story is redundant, just close it."** Also no. Story 1.4's empty `<ul>` is *incidentally* invisible due to zero height; this story makes the absence *intentional* by extracting a named component, which localizes any future design decision to one file. It also cleans up the e2e assertion (no reason for the DOM to carry an empty list container).

### What NOT to add

- No `<EmptyState>` props. The component has no inputs and no variants.
- No "Add your first task" headline, no "Get started" button (the input IS the get-started affordance), no arrow pointing at the input, no keyboard-hint copy ("press Enter to save" — the placeholder already signals that).
- No illustration, SVG, Lottie animation, emoji, or icon.
- No `aria-live` region announcing "Your list is empty" — the input's `<label>` is already announced by screen readers; adding a second announcement is redundant and arguably condescending.
- No dark/light variants — there's nothing to theme.
- No motion on the empty-to-populated transition (Framer Motion is still deferred; the bare DOM swap is fine).

### Implementation sketch

```tsx
// src/components/EmptyState.tsx
'use client';

/**
 * Renders nothing. The UX spec explicitly rejects onboarding copy or
 * tutorial illustrations — the AddTodoInput placeholder is the entire
 * empty-state affordance. This component exists to name the branch so
 * any future product decision to add polish lands in exactly one file.
 */
export function EmptyState() {
  return null;
}
```

```tsx
// src/components/TodoList.tsx — updated branch
import { useTodos } from '@/hooks/useTodos';
import { TodoItem } from './TodoItem';
import { EmptyState } from './EmptyState';

export function TodoList() {
  const todos = useTodos();
  if (!todos || todos.length === 0) return <EmptyState />;
  return (
    <ul className="flex w-full list-none flex-col" aria-label="Active todos">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
```

### Why not keep the empty `<ul>` for "DOM stability"

Counter-arguments and rebuttals:

- **"A stable `<ul>` prevents layout shift when items appear."** In this layout, `<AddTodoInput>` is positioned independently (fixed on mobile, first-child on desktop) — a missing or present empty `<ul>` inside `<main>` does not change the input's position. The invariant is covered by AC #3 + its e2e test.
- **"Keeping the `<ul>` gives screen readers a list landmark."** An *empty* `aria-label`-ed list landmark ("Active todos list, zero items") is noise, not signal. SR users still hear the input's label; that's sufficient orientation.
- **"React's keying is easier if the `<ul>` always exists."** No key churn applies — the `<ul>` only ever has zero or more `<TodoItem>` children, each keyed by ULID. When the list transitions from empty to populated, React mounts the `<ul>` and its children; the reverse mount/unmount is fine.

### Architecture compliance — AI Agent Guardrails (re-read)

1. **Never introduce a spinner for a local operation.** `useLiveQuery` resolving from undefined → [] stays quiet; `<EmptyState>` returns null. No spinner, no skeleton.
2. **Never surface a modal confirmation for a destructive action.** N/A.
5. **Never edit files in `src/components/ui/` by hand.** Not touched.
6. **Never import `dexie` from a Server Component file.** `page.tsx` still server; `<EmptyState>` lives below the client boundary (and doesn't even import Dexie).

### Project Structure Notes

- Test file placement continues to use `src/components/__tests__/` (matches Stories 1.2–1.4 precedent).
- No new hooks, no new npm dependencies.

### What done looks like

- Git diff contains only: `src/components/EmptyState.tsx` (new), `src/components/__tests__/EmptyState.test.tsx` (new), `src/components/TodoList.tsx` (modified), `src/components/__tests__/TodoList.test.tsx` (modified — one scenario rewritten, one added), `e2e/list.spec.ts` (modified — one assertion flipped, one new test), this story file, and `sprint-status.yaml`. **No `package.json` delta.**
- Vitest: 62 prior + 2 new (EmptyState) + 1 new (TodoList empty→populated→empty transition) = 65 tests.
- Playwright e2e: 18 prior → 18 kept (one test renamed + one assertion flipped) + 1 new (input does not shift on first add, runs in both projects) → 20 passing executions.
- Story Status set to `done` directly per the skip-review convention (2026-04-22).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.5]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — "First-time use", "Silence is a feature" (Emotional Design Principles), "Explicitly reject" list, Custom Components → EmptyState]
- [Source: _bmad-output/planning-artifacts/architecture.md — AI Agent Guardrails; Loading State Patterns]
- [Source: _bmad-output/implementation-artifacts/1-4-view-active-todos-as-a-live-list.md — current `<TodoList>` implementation that this story refactors]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- `npx tsc --noEmit` surfaced a pre-existing type error in `e2e/list.spec.ts` (Story 1.4): `msg.type() === 'warn'` — Playwright's `ConsoleMessage.type()` enumerates `'warning'`, not `'warn'`. Collapsed the triple-OR to a clean `error || warning` guard. Not a Story 1.5 bug but fixed in-flight since the sweep caught it.
- All Story 1.5 changes are code-trivial (EmptyState returns null; TodoList branches on zero items); the heavier work was test discipline — rewriting the Story 1.4 empty-state e2e assertion and adding the input-bounding-box invariant test in both projects.

### Completion Notes List

- All 6 ACs verified. The empty branch now renders **nothing** — no `<ul>`, no list landmark, no list items. The `AddTodoInput` is the complete empty-state affordance.
- E2e test naming: I kept the Story-1.5 tests physically inside the `"Story 1.4 — View active todos…"` describe block in `e2e/list.spec.ts` so `list.spec.ts` stays a single cohesive file about the list's behavior over its lifecycle. The tests are clearly titled with the `"Story 1.5 AC #n"` prefix.
- No new npm dependencies, no new hooks, no new CSS tokens.
- Story marked **done** directly per the skip-review convention (2026-04-22).

### File List

**Created:**
- `src/components/EmptyState.tsx`
- `src/components/__tests__/EmptyState.test.tsx`

**Modified:**
- `src/components/TodoList.tsx` (branch on `!todos || todos.length === 0` → `<EmptyState />`)
- `src/components/__tests__/TodoList.test.tsx` (flipped the empty-state assertion; added empty→populated→empty transition test)
- `e2e/list.spec.ts` (replaced the Story-1.4 "empty ul attached" assertion with Story 1.5's "no ul at all"; added the input-bounding-box stability test across both projects; fixed a pre-existing TS error from the Story-1.4 `'warn'` console-type comparison)
- `_bmad-output/implementation-artifacts/1-5-empty-state-as-the-onboarding.md` (this story)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)

### Change Log

- 2026-04-22 — Story 1.5 implemented: `<EmptyState>` component (returns `null` by design per UX spec's "silence is a feature" principle); `<TodoList>` now branches on zero-items and renders `<EmptyState />` instead of an empty `<ul>`; updated Story 1.4 e2e assertion and added a new input-bounding-box stability test proving the first-add does not shift `<AddTodoInput>` on either viewport. Vitest: 65 tests (62 prior + 2 EmptyState + 1 TodoList transition). E2e: 20 passed / 2 project-skipped (up from 18). Also fixed a pre-existing TS type error in `e2e/list.spec.ts` (Playwright `ConsoleMessage.type()` returns `'warning'`, not `'warn'`). Typecheck + lint + production build all clean. Story → done.
