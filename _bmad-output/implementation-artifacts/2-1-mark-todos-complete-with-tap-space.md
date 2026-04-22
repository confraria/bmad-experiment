# Story 2.1: Mark todos complete with tap/Space

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to mark a todo complete with a single tap or Space key,
so that clearing items feels effortless.

## Acceptance Criteria

1. **Tap toggles completion on the full row.** Given I am on mobile and see a todo row, when I tap anywhere on that row, then the app flips `completed` to `true` for an active todo (or back to `false` for a completed todo), writes the change through `updateTodo(...)`, and bumps `updatedAt` to `Date.now()`.

2. **Desktop keyboard toggle works through native button semantics.** Given I am on desktop and a todo row has focus, when I press Space, then the same toggle applies without any custom global keyboard shortcut wiring.

3. **Completed todos remain visible in-place for this story.** Given a row was toggled complete, when Dexie re-renders the list, then that row stays visible in the current single list and adopts the completed visual treatment in-place. **Do not** create the separate completed zone yet; Story 2.4 owns that layout split and movement between zones.

4. **Completed visual treatment matches the UX system.** Given a row is completed, when it renders, then it shows a strikethrough plus secondary emphasis (`text-muted-foreground` and/or reduced opacity) with a calm eased transition of `200ms`. Given `prefers-reduced-motion` is enabled, the state change is visually instant.

5. **Only soft-deleted rows disappear.** Given a todo is completed but not deleted, when the list renders, then it is still present. Given a todo is soft-deleted (`deletedAt !== null`), when the list renders, then it is excluded.

6. **No regressions to capture / empty-state / persistence.** Given the existing add + list flow, when completion toggling lands, then the app still keeps the input stable, still persists through reload, and still renders no spinner/loading UI for local operations.

## Tasks / Subtasks

- [x] **Task 1 — Reframe the list contract from "active only" to "all non-deleted todos"** (AC: #3, #5, #6)
  - [x] Update `src/hooks/useTodos.ts` so it returns **all non-deleted todos** ordered by ULID-descending (`id` descending), not just active todos. Keep `deletedAt === null` filtering; remove the `!completed` filter.
  - [x] Update `src/components/TodoList.tsx` so the empty branch is based on `todos.length === 0`, not "zero active todos". This intentionally supersedes Story 1.5's earlier active-only empty-state assumption.
  - [x] Rename the list's accessible label from `"Active todos"` to a neutral label such as `"Todos"` because completed rows now remain visible in the same list.
  - [x] Keep ordering stable by ULID/newest-first for this story. **Do not** re-sort by `updatedAt`, and **do not** split active vs. completed zones yet.

- [x] **Task 2 — Make `<TodoItem>` the interactive completion surface** (AC: #1, #2)
  - [x] Refactor `src/components/TodoItem.tsx` from static text-only `<li>` content to a semantic interactive row: `<li>` containing a full-width `<button type="button">`.
  - [x] Preserve `data-todo-id={todo.id}` on the outer `<li>` for e2e selectors.
  - [x] The button must fill the row (`w-full`, min 44px target, text-left) so the entire row is the hit target on mobile.
  - [x] Use native button activation for click/tap and Space. Avoid custom document-level keyboard handlers; only add element-level key handling if native semantics prove insufficient in tests.
  - [x] On activation, call `updateTodo(todo.id, { completed: !todo.completed })`.
  - [x] Follow the project's existing mutation-failure pattern from `AddTodoInput`: catch write failures, log with a component-scoped `console.error(...)`, and leave the UI driven by persisted Dexie state rather than optimistic local state.

- [x] **Task 3 — Apply completed-state styling and motion without over-engineering** (AC: #3, #4)
  - [x] Add completed-state classes to the row button/text so completed items visibly recede via strikethrough plus muted emphasis, while active items remain `text-foreground`.
  - [x] Use the existing design tokens from `src/app/globals.css`: `--duration-base` / 200ms, calm easing, and the global reduced-motion override already in place.
  - [x] Keep the transition CSS-first for this story. **Do not introduce a motion library solely for this toggle.** If later stories need gesture animation, prefer the modern `motion` package (`motion/react`) rather than legacy `framer-motion`, but that is not required to satisfy Story 2.1.
  - [x] Do **not** add icons, badges, visible checkboxes, divider lines, or color-only state cues.

- [x] **Task 4 — Update unit/integration coverage for the new row behavior** (AC: #1, #2, #3, #4, #5)
  - [x] Update `src/components/__tests__/TodoItem.test.tsx` to assert:
    - [x] the row renders a button inside the `<li>`
    - [x] click toggles `completed` via `updateTodo`
    - [x] Space on the focused row toggles completion
    - [x] completed rows render the completed-state classes and active rows do not
  - [x] Update `src/components/__tests__/TodoList.test.tsx` to assert:
    - [x] completed-but-not-deleted todos still render
    - [x] soft-deleted todos still do not render
    - [x] the list accessibility label is updated from `"Active todos"` to the new neutral label
    - [x] the empty branch still renders nothing when there are zero non-deleted todos
  - [x] Update `src/hooks/__tests__/useTodos.test.ts` so the hook now returns both active and completed todos (still excluding soft-deleted rows), preserving ULID-descending order.
  - [x] Add or adjust `src/lib/__tests__/db.test.ts` only if needed to close a gap around toggling completed → incomplete with `updatedAt` refresh; do not duplicate coverage that already exists.

- [x] **Task 5 — Add end-to-end coverage for Journey 2 ("Complete")** (AC: #1, #2, #3, #4, #6)
  - [x] Create `e2e/complete.spec.ts` (preferred, matches architecture/test-design naming) rather than overloading `capture.spec.ts` or `list.spec.ts`.
  - [x] Add a mobile scenario: seed or create a todo, tap the row, assert the visual completed treatment appears, reload, and assert the row is still present and still completed.
  - [x] Add a desktop scenario: focus the row, press Space, assert the same completed treatment, then press Space again and assert it returns to active styling.
  - [x] In at least one scenario, verify through IndexedDB inspection that `completed` flips and persists across reload.
  - [x] Assert no hydration or local-operation loading-state regressions are introduced during this flow.

- [x] **Task 6 — Regression sweep** (AC: #6)
  - [x] `npm test`
  - [x] `npm run test:e2e`
  - [x] `npm run lint`
  - [x] `npx tsc --noEmit`
  - [x] `npm run build`

## Dev Notes

### Story-shaping decision: 2.1 supersedes the old "active-only" list assumption

Story 1.4 intentionally hid completed rows because Epic 2 had not started yet. That assumption no longer holds. For Story 2.1, completed rows must remain visible so the user can immediately perceive the state change instead of watching the item disappear. The **separate completed zone** remains deferred to Story 2.4; for now the row stays in the current list and changes appearance in place.

Concretely, that means:

- `useTodos()` now means "todos visible in the list" rather than "active todos only"
- `EmptyState` is shown only when there are **zero non-deleted todos**
- the list label can no longer say `"Active todos"`
- ordering should remain stable by ULID-descending; reordering belongs to Story 2.4

### Interaction semantics

- Prefer **native button semantics** over ARIA-heavy custom roles. A `<button type="button">` inside the `<li>` gives click/tap + Space behavior for free and keeps the row keyboard-operable without global listeners.
- Keep the row as the touch target (`min-h-11` or equivalent 44px minimum).
- Preserve semantic list structure: `<ul>` / `<li>` remains the container pattern; the interactive element lives **inside** the list item.
- A completed row should still be announced accessibly through its text. If extra state signaling is needed, prefer `aria-pressed` on the row button over custom checkbox role gymnastics.

### Visual treatment guardrails

- Active state stays typographically primary: regular weight, `text-base`, `text-foreground`.
- Completed state should combine:
  - `line-through`
  - reduced emphasis via `text-muted-foreground` and/or reduced opacity
  - a calm 200ms transition using existing tokens / global reduced-motion behavior
- No bounce, no spring, no slide, no icon, no visible checkbox chrome in this story.
- Do **not** split the UI into Active/Completed sections yet. Story 2.4 owns:
  - active-above-completed layout
  - whitespace-only zone separation
  - animated movement between zones

### Dependency guidance

- All required app dependencies are already present for Story 2.1.
- **Do not add a motion dependency just for this row-state transition.** The project already has motion tokens and a global `prefers-reduced-motion` override in `src/app/globals.css`.
- If Epic 2 later needs a gesture/exit animation library (likely Story 2.2), prefer **`motion`** with imports from `motion/react` instead of legacy `framer-motion`. Current stable package research points there, while the architecture document's Framer Motion references are older wording.

### Relevant code surfaces

- `src/lib/db.ts` — `updateTodo(...)` is the existing mutation helper and already refreshes `updatedAt`.
- `src/hooks/useTodos.ts` — current active-only filter must be widened to visible non-deleted todos.
- `src/components/TodoItem.tsx` — current static row becomes the interactive completion surface.
- `src/components/TodoList.tsx` — current active-only label/branching assumptions must be updated.
- `src/components/EmptyState.tsx` — logic should remain unchanged; the call-site condition changes.
- `e2e/capture.spec.ts` and `e2e/list.spec.ts` — existing flows must keep passing unchanged.

### Testing conventions and precedent

- Keep using the project's established `__tests__/` directory convention; do not switch to co-located `Component.test.tsx` beside the component in this story.
- Prefer real Dexie-backed integration tests where existing stories already do so.
- For e2e, architecture and test-design both already reserve **Journey 2** for `e2e/complete.spec.ts`; follow that naming rather than folding everything into older files.

### Architecture compliance — re-read before coding

1. **Never introduce a spinner for a local operation.** Completion is a local Dexie mutation; the UI should update reactively without loading UI.
2. **Keep SSR safety intact.** Dexie access stays under the client boundary; do not move mutations into a Server Component.
3. **Do not touch `src/components/ui/` unless the story truly requires it.** Story 2.1 can be satisfied with a semantic row button and does not need the generated checkbox primitive.
4. **Color is not the only state signal.** Completed rows need strikethrough and reduced emphasis, not color alone.

### What done looks like

- Git diff should primarily touch:
  - `src/hooks/useTodos.ts`
  - `src/hooks/__tests__/useTodos.test.ts`
  - `src/components/TodoItem.tsx`
  - `src/components/TodoList.tsx`
  - `src/components/__tests__/TodoItem.test.tsx`
  - `src/components/__tests__/TodoList.test.tsx`
  - optionally `src/lib/__tests__/db.test.ts` if toggle coverage needs one more case
  - `e2e/complete.spec.ts`
  - this story file
  - `sprint-status.yaml`
- No new visible delete affordance, no undo toast, no completed-zone split.
- Completed items remain in the list after reload.
- Existing capture/list/error flows remain intact.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2 / Story 2.1 / Story 2.4]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Typography System; Accessibility Considerations; Custom Components; Responsive Design & Accessibility]
- [Source: _bmad-output/planning-artifacts/architecture.md — Cross-Cutting Concerns; Frontend Architecture; Requirements to Structure Mapping; Data flow]
- [Source: _bmad-output/planning-artifacts/prd.md — FR3 mark complete/incomplete with visual status change]
- [Source: _bmad-output/implementation-artifacts/1-4-view-active-todos-as-a-live-list.md — active-only list assumptions to supersede]
- [Source: _bmad-output/implementation-artifacts/1-5-empty-state-as-the-onboarding.md — empty-state branch assumptions to supersede]
- [Source: src/app/globals.css — motion tokens, reduced-motion override, color tokens]
- [Source: src/lib/db.ts — `updateTodo(...)` mutation contract]

## Dev Agent Record

### Agent Model Used

GPT-5.4 (model ID: gpt-5.4)

### Debug Log References

- Story scope intentionally resolves the Story 1.4 / 2.1 / 2.4 tension by keeping completed rows visible **in place** now and deferring the separate completed zone to Story 2.4.
- The Epic 1 retrospective mentioned "Install and Configure Framer Motion" in Story 2.1, but current project tokens already satisfy this story's motion needs. The story therefore keeps 2.1 CSS-first and reserves any `motion/react` dependency decision for swipe/gesture work in Story 2.2 if still needed.
- JSDOM did not reliably synthesize native Space-button activation in the unit test, so the row now handles Space explicitly on `keydown` while still remaining a native button for click/tap/focus semantics in the browser.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- `useTodos()` now returns all non-deleted rows, which lets completed items remain visible in-place without prematurely introducing Story 2.4's separate completed zone.
- `<TodoItem>` is now a full-row toggle button with `aria-pressed`, Dexie-backed completion writes via `updateTodo(...)`, and completed styling (`line-through`, muted foreground, reduced opacity).
- Added Journey 2 browser coverage in `e2e/complete.spec.ts` for mobile tap completion persistence and desktop Space toggle round-tripping, while keeping the touched Story 1.5 list assertion aligned to the new `"Todos"` label.
- Full regression sweep passed: `npm test` (83), `npm run test:e2e` (22 passed / 4 skipped), `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

### File List

- `_bmad-output/implementation-artifacts/2-1-mark-todos-complete-with-tap-space.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `e2e/complete.spec.ts`
- `e2e/list.spec.ts`
- `src/components/TodoItem.tsx`
- `src/components/TodoList.tsx`
- `src/components/__tests__/TodoItem.test.tsx`
- `src/components/__tests__/TodoList.test.tsx`
- `src/hooks/useTodos.ts`
- `src/hooks/__tests__/useTodos.test.ts`

### Change Log

- 2026-04-22 — Story created and marked ready-for-dev for Epic 2 kickoff.
- 2026-04-22 — Story implemented: completed todos now stay visible in the main list, `TodoItem` rows toggle completion via full-row button interaction (tap + desktop Space), the list label is now `"Todos"`, and completed styling is applied in-place with CSS-first 200ms motion that honors reduced-motion settings. Added Vitest coverage for the interactive row/list contract and Playwright Journey 2 coverage in `e2e/complete.spec.ts`. Story → review.
