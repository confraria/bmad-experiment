# Story 2.3: Undo toast for deletions

Status: done

## Story

As a user,
I want a 5-second window to undo an accidental delete,
so that deletes feel safe and never anxious.

## Acceptance Criteria

1. **Soft-delete → `UndoToast` appears.** Given a todo is swipe-deleted, when the sweep animation completes and `softDeleteTodo` is called, then an `UndoToast` appears at the bottom of the screen (bottom-center on mobile, bottom-left on desktop) showing the deleted todo's text and an "Undo" action button. The toast auto-dismisses after exactly 5 seconds with no user action.

2. **Tapping "Undo" before timeout restores the todo.** Given the `UndoToast` is visible, when the user taps "Undo", then `deletedAt` is set to `null` via `updateTodo(id, { deletedAt: null })`, `updatedAt` is refreshed, the toast dismisses immediately, and the todo reappears in the list at its natural sort position.

3. **Second delete replaces existing toast; prior deletion finalizes.** Given the `UndoToast` is showing for item A, when the user swipes item B before the toast dismisses, then the existing toast is immediately replaced with item B's toast (no stacking), the 5-second timer resets, and item A remains soft-deleted (no undo available).

4. **Timer elapses without undo — item stays deleted.** Given the `UndoToast` auto-dismisses after 5 seconds, when no undo is triggered, then the soft-deleted item remains with `deletedAt` set and does not reappear in the list. No further action is taken on timeout.

5. **No regressions.** Given the existing capture, list, completion, and swipe-delete flows, when this story lands, then all existing Vitest and Playwright tests still pass.

## Tasks / Subtasks

- [x] **Task 1 — Install Zustand** (AC: all)
  - [x] Run `npm install zustand`. Zustand is referenced throughout the architecture doc as the ephemeral UI state library but was NOT included in the project scaffold. Verify it appears in `package.json` under `dependencies`.
  - [x] Do NOT install `@zustand/middleware` or any extra Zustand plugins — vanilla `create` from `zustand` is all that's needed.

- [x] **Task 2 — Create `src/stores/useUIStore.ts`** (AC: #1, #2, #3, #4)
  - [x] Create the directory `src/stores/` and the file `src/stores/useUIStore.ts`.
  - [x] Define the store with Zustand's `create<T>()`. The store shape:
    ```ts
    type UndoPendingTodo = { id: string; text: string };

    type UIStore = {
      undoPendingTodo: UndoPendingTodo | null;
      showUndoToast: (id: string, text: string) => void;
      dismissUndoToast: () => void;
    };
    ```
  - [x] Manage the 5-second timer using a **module-level closure variable** (NOT Zustand state):
    ```ts
    let _undoTimerId: ReturnType<typeof setTimeout> | null = null;
    ```
  - [x] `showUndoToast(id, text)` — clears any existing timer, sets a new 5000ms `setTimeout` that calls `set({ undoPendingTodo: null })` and nulls the closure var, then calls `set({ undoPendingTodo: { id, text } })`.
  - [x] `dismissUndoToast()` — clears the existing timer (if any), nulls the closure var, calls `set({ undoPendingTodo: null })`.
  - [x] Use action naming convention from architecture: verb-first imperative (`showUndoToast`, `dismissUndoToast`).
  - [x] Export the hook as a named export: `export const useUIStore = create<UIStore>(...)`.

- [x] **Task 3 — Create `src/components/UndoToast.tsx`** (AC: #1, #2, #4)
  - [x] New file at `src/components/UndoToast.tsx`. Mark `'use client'` at the top.
  - [x] Read `undoPendingTodo` and `dismissUndoToast` from `useUIStore`.
  - [x] If `undoPendingTodo` is `null`, return `null` — nothing renders.
  - [x] When visible, render a `fixed` positioned container:
    - Mobile (default): `bottom-4 left-1/2 -translate-x-1/2` (bottom-center)
    - Desktop: `md:left-4 md:translate-x-0` (bottom-left override)
    - `z-50` to stay above list content
    - Use design tokens from `globals.css`: `bg-[var(--popover)]`, `text-[var(--popover-foreground)]`, `border border-[var(--border)]`, `rounded-[var(--radius)]`
  - [x] Layout: text content on the left (truncated to single line with `max-w-xs overflow-hidden text-ellipsis whitespace-nowrap`), "Undo" action button on the right.
  - [x] "Undo" button: `type="button"`, `onClick={handleUndo}`. Use ghost/text style — muted, never demanding attention (per UX spec pattern).
  - [x] No "close" button — auto-dismiss only (per AC #4 and UX spec).
  - [x] `aria-live="polite"` and `role="status"` on the container for screen-reader accessibility.
  - [x] `handleUndo()` function:
    1. Store local reference to `undoPendingTodo.id` before async boundary.
    2. Call `dismissUndoToast()` immediately (dismiss first, then restore — optimistic).
    3. Call `await updateTodo(id, { deletedAt: null })` wrapped in try/catch.
    4. Log errors via `console.error('UndoToast: updateTodo failed', err)` — never include `todo.text` in error logs.

- [x] **Task 4 — Wire `TodoItem.tsx` to trigger the toast** (AC: #1, #3)
  - [x] Import `useUIStore` from `@/stores/useUIStore`.
  - [x] Add `const showUndoToast = useUIStore((s) => s.showUndoToast);` inside the component (selector pattern — not destructuring the whole store).
  - [x] In `onPointerUp`, inside the commit path (after the threshold check), call `showUndoToast(todo.id, todo.text)` **before** `softDeleteTodo`. Updated commit path.
  - [x] Do NOT call `showUndoToast` on the spring-back (below-threshold) path.
  - [x] Preserve all existing behaviour: `isSwiping` guard on `onToggle`, `isPointerDown` guard on `onPointerMove`, no `setPointerCapture`, no `<motion.li>`.

- [x] **Task 5 — Compose `UndoToast` into `TodoApp.tsx`** (AC: #1)
  - [x] Import `UndoToast` from `'./UndoToast'`.
  - [x] Add `<UndoToast />` after the `<main>` block inside `TodoApp`'s outer `<div>`.
  - [x] Do NOT place it in `layout.tsx` — it belongs to the client app shell, not the server root layout.

- [x] **Task 6 — Unit tests for `useUIStore`** (AC: #1, #2, #3, #4)
  - [x] File: `src/stores/__tests__/useUIStore.test.ts`. Create the `__tests__/` subdirectory under `src/stores/`.
  - [x] Use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach` to control the 5-second timer.
  - [x] Reset store state between tests via `dismissUndoToast()` + `setState`.
  - [x] All 6 store tests implemented and passing.

- [x] **Task 7 — Unit tests for `UndoToast`** (AC: #1, #2, #4)
  - [x] File: `src/components/__tests__/UndoToast.test.tsx`. Follow existing `__tests__/` subdirectory convention.
  - [x] Mock `@/lib/db` and `@/stores/useUIStore` with per-test state injection.
  - [x] All 6 UndoToast tests implemented and passing.

- [x] **Task 8 — Update `TodoItem` unit tests** (AC: #1, #3)
  - [x] Added `useUIStore` mock with `mockShowUndoToast`.
  - [x] Swipe-past-threshold test verifies `showUndoToast` called with `(todo.id, todo.text)`.
  - [x] Swipe-below-threshold test verifies `showUndoToast` NOT called.
  - [x] All 10 TodoItem tests pass.

- [x] **Task 9 — Add undo e2e scenarios to `e2e/delete-undo.spec.ts`** (AC: #1, #2, #3, #4)
  - [x] Added Story 2.3 describe block with 4 mobile-only scenarios (AC #1–#4), all passing.
  - [x] Existing Story 2.2 tests untouched and still passing.
  - [x] Used `page.clock.install()` + `page.clock.fastForward(5000)` for AC #4 auto-dismiss test.

- [x] **Task 10 — Regression sweep** (AC: #5)
  - [x] `npm test` — 98 tests, 15 files, all pass
  - [x] `npm run test:e2e` — 28 passed, 10 skipped (mobile-only desktop skips)
  - [x] `npm run lint` — clean
  - [x] `npx tsc --noEmit` — clean
  - [x] `npm run build` — clean static build

## Dev Notes

### Zustand is NOT installed — install first

`zustand` does not appear in `package.json`. The architecture doc says it was part of the scaffold (`npm install zustand`), but it was not done. **Install it before writing any store code:**

```bash
npm install zustand
```

Import as:
```ts
import { create } from 'zustand';
```

### Use module-level closure for the timer ID

Do NOT store the timer ID in Zustand state. Zustand triggers re-renders on state changes; the timer ID is purely internal plumbing that consumers don't need to know about. Store it in a module-level variable before `create()`:

```ts
let _undoTimerId: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIStore>((set) => ({
  undoPendingTodo: null,
  showUndoToast(id, text) {
    if (_undoTimerId) clearTimeout(_undoTimerId);
    _undoTimerId = setTimeout(() => {
      set({ undoPendingTodo: null });
      _undoTimerId = null;
    }, 5000);
    set({ undoPendingTodo: { id, text } });
  },
  dismissUndoToast() {
    if (_undoTimerId) clearTimeout(_undoTimerId);
    _undoTimerId = null;
    set({ undoPendingTodo: null });
  },
}));
```

### Restoration uses `updateTodo`, NOT a separate `restoreTodo`

There is no `restoreTodo` function in `src/lib/db.ts`. Restore a soft-deleted item using the existing `updateTodo`:

```ts
await updateTodo(id, { deletedAt: null });
```

The `isReviving` code path in `updateTodo` handles the case where `deletedAt` is being set to `null` — it also refreshes `updatedAt`. Do NOT write a new DB function.

### The project uses Sonner, NOT Radix Toast

The architecture doc references `npx shadcn@latest add toast` — but the actual scaffold ran `npx shadcn@latest add sonner` instead (newer shadcn/ui default). The file `src/components/ui/sonner.tsx` exists; `toast.tsx` does NOT.

**For Story 2.3, do NOT use Sonner's `toast()` API for UndoToast.** Build a custom `<UndoToast />` component positioned with Tailwind `fixed` utility. Reasons:
1. Sonner's programmatic `toast()` API is fire-and-forget; it doesn't integrate with Zustand reactively.
2. Custom component gives full control over `bottom-center` (mobile) / `bottom-left` (desktop) positioning via responsive Tailwind classes.
3. Zustand store remains the single source of truth for undo state.

The `<Toaster />` from `sonner.tsx` can be added to `layout.tsx` in a future story if needed — this story doesn't require it.

### Motion and pointer event constraints from Story 2.2 (DO NOT REGRESS)

These are hard lessons from Story 2.2. The current `TodoItem.tsx` already implements the correct patterns. **Do not alter them while adding `showUndoToast`:**

1. **No `<motion.li>`** — `motion/react`'s `motion.li` activates an internal tap gesture recognizer that calls `preventDefault()` on pointer events. In Playwright mobile (`hasTouch: true`), this silently blocks `click` on the inner `<button>`. Use plain `<li ref={liRef}>` + imperative `animate(liRef.current!, ...)`.

2. **No `setPointerCapture`** — Calling `setPointerCapture` on the `<li>` causes Playwright's mobile simulation to dispatch `click` events to the capturing `li` rather than the inner `<button>`, silently swallowing completion toggles. Do NOT add it back.

3. **`isPointerDown` guard** — `onPointerMove` must check `if (!isPointerDown.current) return` to prevent pre-pointerdown cursor movement from triggering `isSwiping = true`.

### Selector pattern for Zustand in components

Use the selector pattern (not full store destructuring) to avoid unnecessary re-renders:

```ts
// Correct — component only re-renders when showUndoToast ref changes (never):
const showUndoToast = useUIStore((s) => s.showUndoToast);

// Also fine in UndoToast:
const undoPendingTodo = useUIStore((s) => s.undoPendingTodo);
const dismissUndoToast = useUIStore((s) => s.dismissUndoToast);
```

### Testing Zustand stores — reset between tests

Zustand store state persists across tests in the same Vitest worker. Reset it in `beforeEach`:

```ts
beforeEach(() => {
  // Clear any pending timer first, then reset state
  useUIStore.getState().dismissUndoToast();
  useUIStore.setState({ undoPendingTodo: null });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

### Playwright clock control for 5-second timer

For the auto-dismiss e2e test, install the fake clock BEFORE navigating to the page:

```ts
test('AC #4: toast auto-dismisses after 5 seconds', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

  await page.clock.install(); // must come before goto()
  await resetAppState(page);

  await addTodo(page, 'Will auto-dismiss');
  // ... get todoId, swipeTodo ...

  await expect(page.getByRole('status')).toBeVisible();

  await page.clock.fastForward(5000);

  await expect(page.getByRole('status')).toHaveCount(0);
});
```

### UndoToast positioning tokens

Use CSS variables already defined in `src/app/globals.css`:
- Background: `bg-[var(--popover)]`
- Text: `text-[var(--popover-foreground)]`
- Border: `border border-[var(--border)]`
- Radius: `rounded-[var(--radius)]`
- Shadow: `shadow-lg` (Tailwind, no token needed)

Positioning classes:
```tsx
className="fixed bottom-4 left-1/2 -translate-x-1/2 md:left-4 md:translate-x-0 z-50 flex items-center gap-3 px-4 py-3 shadow-lg ..."
```

### Architecture guardrails

1. **Never log todo text to error reports.** `console.error` calls must not include `todo.text` or `undoPendingTodo.text`.
2. **Never show a spinner for a local Dexie operation.** Undo is a fast local write; no loading state.
3. **Never confirm destructive actions with a modal.** The undo toast IS the safety net (per architecture guardrail #2).
4. **Do not edit `src/components/ui/`.** This story has no reason to touch shadcn primitives.
5. **SSR safety**: `useUIStore` and `UndoToast` are client components (`'use client'`). `TodoApp.tsx` already has `'use client'`. No server component exposure.

### Files expected to change

- `package.json` + `package-lock.json` — `zustand` dependency added
- `src/stores/useUIStore.ts` — NEW: Zustand store for ephemeral UI state
- `src/stores/__tests__/useUIStore.test.ts` — NEW: store unit tests
- `src/components/UndoToast.tsx` — NEW: undo toast component
- `src/components/__tests__/UndoToast.test.tsx` — NEW: toast component tests
- `src/components/TodoItem.tsx` — add `showUndoToast` call to swipe commit path
- `src/components/__tests__/TodoItem.test.tsx` — update swipe tests + add `useUIStore` mock
- `src/components/TodoApp.tsx` — add `<UndoToast />` to composition
- `e2e/delete-undo.spec.ts` — add Story 2.3 scenarios (new describe block only; do not alter 2.2 tests)
- `_bmad-output/implementation-artifacts/2-3-undo-toast-for-deletions.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

### Files that must NOT be changed

- `src/lib/db.ts` — `softDeleteTodo` and `updateTodo` are correct; do not modify
- `src/hooks/useTodos.ts` — already filters deleted items; no change needed
- `src/components/TodoList.tsx` — no changes needed
- `src/components/ui/` — hands off shadcn primitives
- `src/app/layout.tsx` — no `<Toaster />` needed for this story

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- No regressions or surprises. The TypeScript mock cast `(useUIStore as ReturnType<typeof vi.fn>)` raised a TS2352 error because `UseBoundStore` doesn't overlap with `MockInstance`. Fixed with double-cast `as unknown as ReturnType<typeof vi.fn>` plus `any` selector param. This is test-only; production code is clean.

### Completion Notes List

- Installed `zustand` v5 (was missing from scaffold).
- Created `src/stores/useUIStore.ts` with Zustand `create<UIStore>()`: `undoPendingTodo`, `showUndoToast`, `dismissUndoToast`. Timer managed via module-level closure variable (`_undoTimerId`) — not Zustand state.
- Created `src/components/UndoToast.tsx`: renders a `fixed` toast (bottom-center mobile, bottom-left desktop) with the deleted todo's text and an "Undo" button. Returns `null` when no pending undo. No close button; auto-dismisses via store timer.
- Updated `src/components/TodoItem.tsx`: added `showUndoToast` selector; calls `showUndoToast(todo.id, todo.text)` in both the animated and prefers-reduced-motion commit paths before `softDeleteTodo`. No changes to gesture logic.
- Updated `src/components/TodoApp.tsx`: added `<UndoToast />` after `<main>`.
- 6 store unit tests, 6 UndoToast unit tests, 10 TodoItem unit tests (3 updated + 7 existing) — all pass (98 total).
- 4 new e2e scenarios in `e2e/delete-undo.spec.ts` (AC #1–#4) — all pass on mobile project.
- All 2 existing Story 2.2 e2e tests still pass.
- lint, tsc, build all clean.

### File List

- `package.json`
- `package-lock.json`
- `src/stores/useUIStore.ts`
- `src/stores/__tests__/useUIStore.test.ts`
- `src/components/UndoToast.tsx`
- `src/components/__tests__/UndoToast.test.tsx`
- `src/components/TodoItem.tsx`
- `src/components/__tests__/TodoItem.test.tsx`
- `src/components/TodoApp.tsx`
- `e2e/delete-undo.spec.ts`
- `_bmad-output/implementation-artifacts/2-3-undo-toast-for-deletions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-04-22: Story 2.3 implemented — Zustand useUIStore, UndoToast component, TodoItem wired to trigger toast on swipe-delete, TodoApp composition, 12 new unit tests, 4 new mobile e2e undo scenarios. Status: review.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2 / Story 2.3]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Journey 3 (Delete with undo); UndoToast spec; Interaction Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — Zustand/useUIStore; UndoToast; AI Agent Guardrails; Requirements to Structure Mapping]
- [Source: _bmad-output/implementation-artifacts/2-2-delete-todos-via-swipe-mobile.md — Debug Log (setPointerCapture regression, motion.li event interception, isPointerDown guard)]
- [Source: src/lib/db.ts — `softDeleteTodo()`, `updateTodo(id, { deletedAt: null })` restoration contract]
- [Source: src/components/TodoItem.tsx — current swipe implementation (no motion.li, no setPointerCapture)]
- [Source: src/components/TodoApp.tsx — current composition structure]
- [Source: src/components/ui/sonner.tsx — Sonner Toaster (not used for UndoToast but present in project)]
- [Source: e2e/delete-undo.spec.ts — existing Story 2.2 helpers: resetAppState, readTodos, addTodo, swipeTodo]
- [Source: playwright.config.ts — mobile project: hasTouch true, 390px viewport]
