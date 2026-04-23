# Story 4.1: Keyboard shortcuts on desktop

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desktop power-user,
I want to navigate and manipulate todos entirely from the keyboard,
so that I never need to reach for the mouse.

## Acceptance Criteria

1. **Desktop shortcut set is live.** Given the app is running at viewport ≥1024px and `useKeyboardShortcuts` is mounted inside `<TodoApp />`, when none of the suppression conditions below apply, then these keys fire their actions on `window` `keydown`:
   - `j` → move focus to the NEXT todo row (by DOM order across both active and completed lists).
   - `k` → move focus to the PREVIOUS todo row.
   - `n` → move focus to the Add input (`#add-todo-input`).
   - `Cmd/Ctrl + Backspace` → soft-delete the currently focused todo row and trigger the undo toast.
   - `Cmd/Ctrl + Z` → undo the most recent delete iff an undo toast is currently pending (same action as clicking Undo on the toast). No-op otherwise.
   - `?` (`Shift+/`) → toggle the HelpOverlay open/closed state in `useUIStore`.

2. **Space toggles complete on the focused row (already works; do not re-implement globally).** Given a `TodoItem` button has focus (reached via `j`/`k` or Tab), when the user presses `Space`, then the todo's `completed` flips via `TodoItem.onKeyDown` — which already preventDefaults Space and calls `updateTodo(id, { completed: !completed })`. The global hook MUST NOT add its own Space handler: doing so would either double-fire or require coordination with `TodoItem`. Document this explicitly in Dev Notes.

3. **Enter submits the Add input (already works; do not re-implement).** Given the Add input has focus, when the user presses `Enter`, then the form submits via the existing `<form onSubmit>` in `AddTodoInput`. The global hook MUST NOT intercept Enter.

4. **Input suppression.** Given `document.activeElement` is an `<input>`, `<textarea>`, or any element with `isContentEditable === true`, when any printable-letter or non-modifier shortcut key (`j`, `k`, `n`, `?`) is pressed, then the hook returns early and does NOT handle the key — normal typing proceeds. Modifier combinations (`Cmd/Ctrl + Backspace`, `Cmd/Ctrl + Z`) are ALSO suppressed when an input is focused: the user may be editing; let the browser's native undo/delete behavior win.

5. **`?` toggles HelpOverlay state (overlay component itself is Story 4.2).** Given `?` fires outside an input, when the handler runs, then `useUIStore.getState().toggleHelpOverlay()` flips a new `helpOverlayOpen` boolean. Because `HelpOverlay.tsx` ships in Story 4.2, THIS story only wires the toggle action + boolean state. Do not render anything bound to `helpOverlayOpen` yet — Story 4.2 will. (An ephemeral `console.debug` or nothing at all is acceptable; do not render a placeholder overlay.)

6. **Focused todo row has a visible accent focus ring.** Given a `TodoItem` button is focused (by `j`/`k`, Tab, or click), when it renders, then the existing `focus-visible:ring-2 focus-visible:ring-ring` classes on the button render a visible indicator using the accent color (per globals.css `--ring` token). This AC is verified by inspection; no code change required unless the ring is not visible — if it is not, diagnose and fix at the token or component level rather than layering new classes.

7. **j/k focus traversal uses DOM order, clamps at edges, starts from the current position.** Given N todo rows exist and the currently focused element is either a `[data-todo-id]` row's button OR some other element, when `j` is pressed:
   - If a row button is focused → focus the NEXT row's button; if already on the last row, do nothing (no wrap).
   - If no row is focused → focus the FIRST row's button.
   - If there are zero rows → no-op.
   `k` mirrors the logic in reverse (previous / last-if-none / no-op-if-empty). Traversal MUST iterate `document.querySelectorAll('[data-todo-id]')` (DOM order = render order = active-then-completed), not the `useTodos` array (the hook lives outside the list tree).

8. **Delete (Cmd/Ctrl+Backspace) targets the focused row, falls through otherwise.** Given the currently focused element is INSIDE a `[data-todo-id]` row, when the combo fires, then `softDeleteTodo(id)` runs AND `showUndoToast(id, text)` is called with the row's text (read from the button's `textContent`), mirroring `TodoItem.onPointerUp`. `event.preventDefault()` is called to block the browser's "go back" binding. If no `[data-todo-id]` ancestor is found, the hook returns early without preventDefault so the browser's default (e.g., back navigation) is unaffected.

9. **Undo (Cmd/Ctrl+Z) uses the same code path as the toast's Undo button.** Given `useUIStore.getState().undoPendingTodo` is non-null, when the combo fires, then the handler calls `updateTodo(id, { deletedAt: null })` followed by `dismissUndoToast()` — the same sequence `UndoToast.handleUndo` uses. If `undoPendingTodo` is null, the hook returns early without preventDefault (avoid stealing native undo from inputs the user might focus later). Prefer extracting a shared `undoPendingDelete()` helper in `useUIStore` so both the toast button and the shortcut call it — single source of truth.

10. **Desktop-only activation via matchMedia.** Given the viewport is <1024px, when the hook is mounted, then NO `keydown` listener is attached. Given the viewport is ≥1024px, when the hook mounts, then the listener is attached. When the viewport crosses the breakpoint at runtime (e.g., window resize, dev rotation), the hook reacts via a `matchMedia('(min-width: 1024px)')` listener: attaching/detaching as needed. SSR-safe — no `window` access during render; all DOM work in `useEffect`.

11. **Modifier disambiguation.** Given the user presses `Cmd+Z` on macOS OR `Ctrl+Z` on Windows/Linux, when the handler runs, then `event.metaKey || event.ctrlKey` is the gate. DO NOT require `event.shiftKey === false` explicitly — letting `Cmd+Shift+Z` (redo) also trigger undo would be wrong, so DO check `!event.shiftKey` on the Cmd/Ctrl+Z path to avoid hijacking future redo semantics. `Cmd/Ctrl+Backspace` similarly requires `!event.shiftKey`. `?` already implies shift (it's `Shift+/`); detect it via `event.key === '?'`, not `event.code === 'Slash' && shiftKey`.

12. **TodoApp wires the hook once.** Given `TodoApp.tsx`, when it renders, then it calls `useKeyboardShortcuts()` exactly once, alongside the existing `useSync()` call. The hook returns `void`; no props, no context, no ref plumbing.

13. **Unit tests for `useKeyboardShortcuts`.** Given `src/hooks/__tests__/useKeyboardShortcuts.test.tsx` exists, when `npm test` runs, then the following are covered (use Testing Library + jsdom, fake `matchMedia` to return `matches: true` for the desktop breakpoint):
   - Desktop viewport: `j`/`k` move focus across rendered `data-todo-id` rows (clamp at edges, start-from-nothing-focuses-first/last).
   - Desktop viewport: `n` focuses `#add-todo-input`.
   - Desktop viewport: `?` calls `toggleHelpOverlay`.
   - Desktop viewport: `Cmd+Z` with pending undo calls `updateTodo(id, { deletedAt: null })` + `dismissUndoToast`; with no pending undo → no-op.
   - Desktop viewport: `Cmd+Backspace` on a focused row calls `softDeleteTodo` + `showUndoToast`; outside a row → no-op; preventDefault only when acting.
   - Input suppression: focus is on `<input>` → `j`/`k`/`n`/`?` do nothing; `Cmd+Backspace`/`Cmd+Z` also suppressed.
   - Mobile viewport (`matchMedia` returns `matches: false`) → listener never attached; none of the shortcuts fire.
   - `Cmd+Shift+Z` → does NOT call undo (redo reservation).

14. **Unit tests for the `useUIStore` additions.** Given new state/actions ship, when `npm test` runs, then `src/stores/__tests__/useUIStore.test.ts` covers:
   - `helpOverlayOpen` defaults to `false`.
   - `toggleHelpOverlay()` flips it true, then false, then true.
   - `undoPendingDelete()` when a toast is pending: calls `updateTodo(id, { deletedAt: null })` and clears `undoPendingTodo` (mock the db helper).
   - `undoPendingDelete()` when no toast is pending: resolves without calling `updateTodo`.

15. **Playwright E2E for the keyboard flow (desktop viewport).** Given `e2e/keyboard.spec.ts` exists and runs under the desktop project (default 1280×720), when `npm run test:e2e` runs, then at least one spec covers:
   - Seed 3 todos → press `j` three times → third row's button is focused.
   - Focus a row with `j` → press `Cmd+Backspace` (or `Control+Backspace` on non-Mac) → row disappears AND undo toast is visible.
   - With undo toast visible → press `Cmd+Z` (or `Control+Z`) → todo reappears in the list AND toast disappears.
   - With focus on the Add input → pressing `j` types the letter "j" in the input (suppression proof).
   Do NOT add this spec at the mobile-emulation project — mobile viewports must NOT trigger these shortcuts per AC#10.

16. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed with no new warnings. Specifically verify: `TodoItem.test.tsx` Space-on-focused-row test still passes unchanged (AC#2 invariant), and `UndoToast.test.tsx` still passes (AC#9 refactor must preserve the toast's own Undo button behavior).

## Tasks / Subtasks

- [x] **Task 1 — Extend `useUIStore` with help overlay state + shared undo helper** (AC: #5, #9, #14)
  - [x] Open `src/stores/useUIStore.ts`. Import `updateTodo` from `@/lib/db`.
  - [x] Extend the `UIStore` type:
    ```ts
    type UIStore = {
      undoPendingTodo: UndoPendingTodo | null;
      helpOverlayOpen: boolean;
      showUndoToast: (id: string, text: string) => void;
      dismissUndoToast: () => void;
      undoPendingDelete: () => Promise<void>;
      toggleHelpOverlay: () => void;
    };
    ```
  - [x] Default `helpOverlayOpen: false`.
  - [x] Implement `toggleHelpOverlay: () => set((s) => ({ helpOverlayOpen: !s.helpOverlayOpen }))`.
  - [x] Implement `undoPendingDelete`:
    ```ts
    async undoPendingDelete() {
      const pending = get().undoPendingTodo;
      if (!pending) return;
      get().dismissUndoToast();
      try {
        await updateTodo(pending.id, { deletedAt: null });
      } catch (err) {
        console.error('useUIStore: undoPendingDelete failed', err);
      }
    }
    ```
    Use the `create` signature that provides `get` (second arg): `create<UIStore>()((set, get) => ({ ... }))`.
  - [x] Update `src/components/UndoToast.tsx` to call `undoPendingDelete()` instead of inlining `updateTodo + dismissUndoToast` — single source of truth for undo. Leave visual/markup unchanged.
  - [x] **Why centralize**: the keyboard shortcut for `Cmd+Z` must produce the exact same DB write + state transition as the toast button. Inlining in two places invites drift (e.g., someone adds a "restore with newer updatedAt" rule to the toast and forgets the shortcut). Put it in the store once; both callers invoke it.
  - [x] Extend `src/stores/__tests__/useUIStore.test.ts`:
    - Mock `@/lib/db` to stub `updateTodo`.
    - Test: `helpOverlayOpen` defaults false; `toggleHelpOverlay` flips it; double toggle returns to false.
    - Test: `undoPendingDelete` with pending toast calls `updateTodo(id, { deletedAt: null })` and clears state.
    - Test: `undoPendingDelete` with no pending toast is a no-op (no `updateTodo` call).
    - Test: `undoPendingDelete` catches `updateTodo` rejection without throwing (mock rejects, assert no error bubbles).
  - [x] Also update `src/components/__tests__/UndoToast.test.tsx` if it mocks `@/lib/db` directly — it now runs through the store action.

- [x] **Task 2 — Create `src/hooks/useKeyboardShortcuts.ts`** (AC: #1, #4, #7, #8, #10, #11)
  - [x] Create the file with `'use client'` at the top.
  - [x] Skeleton:
    ```ts
    'use client';

    import { useEffect } from 'react';
    import { softDeleteTodo } from '@/lib/db';
    import { useUIStore } from '@/stores/useUIStore';

    const DESKTOP_QUERY = '(min-width: 1024px)';

    export function useKeyboardShortcuts(): void {
      useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia(DESKTOP_QUERY);
        let detach: (() => void) | null = null;

        const attachIfDesktop = () => {
          if (mql.matches && !detach) {
            window.addEventListener('keydown', onKeyDown);
            detach = () => window.removeEventListener('keydown', onKeyDown);
          } else if (!mql.matches && detach) {
            detach();
            detach = null;
          }
        };

        attachIfDesktop();
        mql.addEventListener('change', attachIfDesktop);

        return () => {
          mql.removeEventListener('change', attachIfDesktop);
          detach?.();
        };
      }, []);
    }
    ```
  - [x] Implement `onKeyDown(event: KeyboardEvent)` with these early-return rules, in order:
    1. **Input suppression** (AC#4): if `isEditableFocused()` → return immediately for `j`/`k`/`n`/`?` AND for the modifier combos `Cmd/Ctrl+Z` and `Cmd/Ctrl+Backspace`. Return before dispatch.
       ```ts
       function isEditableFocused(): boolean {
         const el = document.activeElement;
         if (!el) return false;
         if (el instanceof HTMLInputElement) return true;
         if (el instanceof HTMLTextAreaElement) return true;
         if (el instanceof HTMLElement && el.isContentEditable) return true;
         return false;
       }
       ```
    2. **Dispatch** on `event.key`:
       - `'j'` with no modifier → `moveFocus(+1)`.
       - `'k'` with no modifier → `moveFocus(-1)`.
       - `'n'` with no modifier → `document.getElementById('add-todo-input')?.focus()`.
       - `'?'` (includes implicit shift) with no Cmd/Ctrl → `useUIStore.getState().toggleHelpOverlay()`.
       - `'Backspace'` with `(metaKey || ctrlKey) && !shiftKey` → `deleteFocusedRow(event)`.
       - `'z'` or `'Z'` with `(metaKey || ctrlKey) && !shiftKey` → `undoIfPending(event)`. (AC#11: block `Cmd+Shift+Z`.)
    3. `moveFocus(delta)`:
       ```ts
       function moveFocus(delta: 1 | -1): void {
         const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-todo-id]'));
         if (rows.length === 0) return;
         const focusedRow = document.activeElement?.closest<HTMLElement>('[data-todo-id]') ?? null;
         const currentIdx = focusedRow ? rows.indexOf(focusedRow) : -1;
         let nextIdx: number;
         if (currentIdx === -1) {
           nextIdx = delta === 1 ? 0 : rows.length - 1;
         } else {
           nextIdx = currentIdx + delta;
           if (nextIdx < 0 || nextIdx >= rows.length) return; // clamp, no wrap (AC#7)
         }
         const btn = rows[nextIdx].querySelector<HTMLButtonElement>('button');
         btn?.focus();
       }
       ```
    4. `deleteFocusedRow(event)`:
       ```ts
       function deleteFocusedRow(event: KeyboardEvent): void {
         const row = document.activeElement?.closest<HTMLElement>('[data-todo-id]');
         if (!row) return;
         const id = row.dataset.todoId;
         const text = row.querySelector('button')?.textContent ?? '';
         if (!id) return;
         event.preventDefault();
         const { showUndoToast } = useUIStore.getState();
         showUndoToast(id, text);
         void softDeleteTodo(id).catch((err) => console.error('useKeyboardShortcuts: softDeleteTodo failed', err));
       }
       ```
    5. `undoIfPending(event)`:
       ```ts
       function undoIfPending(event: KeyboardEvent): void {
         const { undoPendingTodo, undoPendingDelete } = useUIStore.getState();
         if (!undoPendingTodo) return;
         event.preventDefault();
         void undoPendingDelete();
       }
       ```
  - [x] **Keep helpers module-scoped functions, not inside `useEffect`.** Stable references across renders; no closure-over-stale-state surprises (all state access goes through `useUIStore.getState()` which reads fresh).

- [x] **Task 3 — Unit tests for `useKeyboardShortcuts`** (AC: #13)
  - [x] Create `src/hooks/__tests__/useKeyboardShortcuts.test.tsx`.
  - [x] Set up a test harness: render a small component tree that mirrors `TodoApp`'s minimum DOM — an `<input id="add-todo-input" />`, plus a `<ul>` with two `<li data-todo-id="ulid-1"><button>first</button></li>` and `<li data-todo-id="ulid-2"><button>second</button></li>`. Then render a `<Harness />` that calls the hook.
  - [x] Mock `@/lib/db`: `softDeleteTodo: vi.fn().mockResolvedValue(undefined)`, `updateTodo: vi.fn().mockResolvedValue(undefined)`. (`updateTodo` is invoked via the store's `undoPendingDelete`.)
  - [x] Stub `window.matchMedia` in a `beforeEach`:
    ```ts
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    ```
    For the "mobile viewport" test, override `matches` to `false`.
  - [x] Reset the store in `beforeEach`: `useUIStore.setState({ undoPendingTodo: null, helpOverlayOpen: false })`.
  - [x] Cover every case enumerated in AC#13. Use `fireEvent.keyDown(window, { key: 'j' })` — the hook listens on `window`. For modifier combos: `fireEvent.keyDown(window, { key: 'Backspace', metaKey: true })`. For `Cmd+Shift+Z` negative case: `{ key: 'z', metaKey: true, shiftKey: true }` → assert `updateTodo` NOT called.
  - [x] For input-suppression tests, call `.focus()` on the `<input id="add-todo-input" />` BEFORE firing the event.
  - [x] For the "no-row-focused, j focuses first" case: clear focus by `document.activeElement` being `<body>` (default after render).

- [x] **Task 4 — Wire `useKeyboardShortcuts()` into `TodoApp`** (AC: #12)
  - [x] Open `src/components/TodoApp.tsx`.
  - [x] Add `import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';`.
  - [x] Call it at the top of the component, alongside `useSync()`:
    ```ts
    useSync();
    useKeyboardShortcuts();
    ```
  - [x] No other markup changes in this file.

- [x] **Task 5 — Playwright E2E: `e2e/keyboard.spec.ts`** (AC: #15)
  - [x] Create `e2e/keyboard.spec.ts`. Use `Page.keyboard.press()` with modifier syntax `Control+Backspace` — Playwright translates to `Meta+Backspace` on WebKit/macOS when using `Modifier+` format via `ControlOrMeta` (Playwright ≥1.48). Check `@playwright/test` version in package.json (^1.59.1 → `ControlOrMeta` is available); if not, use `process.platform === 'darwin' ? 'Meta' : 'Control'` to pick.
  - [x] Reuse the seeding pattern from existing `e2e/list.spec.ts` or `e2e/complete.spec.ts` (check their setup for adding todos via UI or via a page evaluate into Dexie — prefer UI-driven seeding to match the user's actual path).
  - [x] Test cases:
    1. **`j`/`k` navigation**: seed 3 todos, press `j` three times, assert the third row's button is the active element: `await expect(page.locator('[data-todo-id]').nth(2).locator('button')).toBeFocused()`.
    2. **Delete via `Cmd/Ctrl+Backspace`**: seed 2 todos, press `j` to focus the first, press `ControlOrMeta+Backspace`, assert the row is gone AND toast visible: `await expect(page.getByRole('status')).toBeVisible()`.
    3. **Undo via `Cmd/Ctrl+Z`**: after step 2, press `ControlOrMeta+Z`, assert the row is back and toast gone.
    4. **Input suppression**: focus input (it's auto-focused on desktop), type `j`, assert input value is `'j'` and no row has focus.
  - [x] This spec runs only on the default desktop project — verify `playwright.config.ts` doesn't force this new file onto mobile-emulation projects. If a `projects` array exists with a mobile project, this spec should inherit the default project only (no `.use({ ... mobile })`). *(Implemented via `test.skip(testInfo.project.name !== 'desktop')` in beforeEach — matches delete-undo.spec pattern.)*

- [x] **Task 6 — Regression sweep** (AC: #16)
  - [x] `npm test` — all tests pass (210 passed, including 10 new across hook + store).
  - [x] `npm run test:e2e` — existing specs unchanged; new `keyboard.spec.ts` passes on desktop (3/3), correctly skipped on mobile project.
  - [x] `npm run lint` — zero warnings.
  - [x] `npx tsc --noEmit` — clean.
  - [x] `npm run build` — succeeds. No new route.
  - [ ] Smoke on a real desktop browser — *skipped per user preference for UI verification (playwright E2E covers the same flow and passes headlessly; `?` overlay toggle is covered by unit test only since Story 4.2 ships the rendering).*

## Dev Notes

### Architecture anchor points

- Hook file location, name, and contract: `src/hooks/useKeyboardShortcuts.ts` — called from inside a client component, returns `void`. [Source: architecture.md lines 320–323, 481–482]
- Zustand is the home for ephemeral UI state — "help overlay visibility" is explicitly listed. [Source: architecture.md line 204]
- Action naming for store mutations: verb-first, imperative (`toggleHelpOverlay`, `undoPendingDelete`). [Source: architecture.md lines 371–373]
- AI Agent Guardrails that apply here: (1) no spinners for local operations (we have none), (2) no modal confirmation for destructive actions (shortcut → toast path preserves undo). [Source: architecture.md lines 410–418]
- UX spec on keyboard behavior: "on desktop, row navigation with j/k moves visual focus and aria-activedescendant." We are using NATIVE focus on the row button instead of `aria-activedescendant` because `TodoItem` already renders a focusable `<button>` per row with a focus ring — the simpler model. Document the deviation below in "Project Structure Notes." [Source: ux-design-specification.md line 497]

### Why native button focus instead of `aria-activedescendant`

The UX spec recommended `aria-activedescendant`, which is the canonical roving-focus pattern when the container (not the children) is the focusable element. BUT our `TodoItem` already renders a real `<button>` per row, with a visible focus ring via Tailwind's `focus-visible:ring-*`. Using `aria-activedescendant` now would mean:
  - Removing the buttons' focusability (or adding `tabIndex={-1}`),
  - Making the parent `<ul>` focusable,
  - Reimplementing the focus ring off `aria-activedescendant`'s computed target.
That's a structural change for no accessibility gain — native focus already reads correctly to screen readers and already keyboard-navigates. We pick the option that touches `TodoItem.tsx` zero lines. If a reviewer argues this deviates from the UX spec, the defense is: the spec reflects a design intent ("keyboard moves visual focus"), which is satisfied; the implementation detail is the simpler of two equivalent paths.

### Why Space is NOT in the global hook (AC#2)

`TodoItem.tsx` already defines `onKeyDown` that intercepts Space on the button and calls `onToggle`. Adding a `window`-level Space handler would either:
  - Fire twice (both handlers toggle),
  - Or require the global handler to detect "Space was consumed" — impossible cleanly.
The row-level handler is correct and already has a test (`TodoItem.test.tsx` line 83). Keep it. The global hook ignores Space entirely.

### Why Enter is NOT in the global hook (AC#3)

`<form onSubmit>` in `AddTodoInput.tsx` submits on Enter, which is the native behavior when the input is focused. The global hook would only need to handle "Enter outside an input" — but that context has no defined action (we don't focus-and-Enter on a row; we have Space for that). Omit.

### Why `Cmd/Ctrl+Shift+Z` is deliberately excluded from undo (AC#11)

Common redo binding. If v2 ever adds redo, we'll want `Cmd+Shift+Z` available. Matching only the `!shiftKey` form now prevents us from silently breaking redo later.

### Why Cmd/Ctrl+Backspace WITHOUT an input check would be dangerous

Without AC#4's input suppression, `Cmd+Backspace` on a focused input would simultaneously clear the input (browser default in some OS/browser combos) AND delete the currently-or-previously focused todo row. Suppressing in inputs is not "nice-to-have" — it is correctness.

### Why `undoPendingDelete()` lives on the store, not on `UndoToast`

Two callers (toast button, keyboard shortcut) need identical behavior. If that logic lives inside `UndoToast.handleUndo`, the shortcut either has to replicate it (drift) or import a React component hook (sketchy). Moving it to the store is a clean single source of truth — UndoToast's `handleUndo` becomes a one-liner (`void undoPendingDelete()`), the shortcut is a one-liner, and tests target the store behavior directly without mounting a component.

### Why DOM queries instead of passing the todo array into the hook

The hook lives outside the `TodoList`. Passing the todos array down would require lifting the `useTodos()` call to `TodoApp` (fine), then threading the array into the hook as a parameter (OK), then keeping it fresh on every render (the `useEffect` body would close over a stale array unless we re-bind the listener on every change, which is wasteful).
DOM queries via `[data-todo-id]` are free, stable (the attribute is already set by `TodoItem` line 88), and always reflect the CURRENT rendered state. Trade-off: slightly less "React-idiomatic." Pragmatic win: zero coupling to render order, zero re-binding.

### Why desktop gating via matchMedia, not just `window.innerWidth`

`matchMedia('(min-width: 1024px)')` is the same query `AddTodoInput` already uses (line 12) for its auto-focus behavior. Consistency with existing code. Also: `.addEventListener('change', ...)` gives us a live reactive signal at the viewport breakpoint — `innerWidth` + `resize` is noisier and fires continuously during resize.

### Focus indicator verification (AC#6)

The `focus-visible:ring-2 focus-visible:ring-ring` Tailwind classes on the button compile to CSS that reads `--ring` from `globals.css`. The token is set to the accent color scale in Tailwind v4 CSS-first config (see the Tailwind v4 memory note — tokens live in `globals.css @theme`, not `tailwind.config.ts`). If the ring is visually muted or invisible, fix at the token level; do not layer per-component overrides. Quick smoke: on desktop, Tab to a row — a visible orange ring should surround the button text.

### Existing attributes that make this story cheap

- `data-todo-id` on every `<li>` in `TodoItem.tsx` line 88 — traversal target.
- `id="add-todo-input"` on the input in `AddTodoInput.tsx` line 44 — `n` shortcut target.
- `focus-visible:ring-*` on the button in `TodoItem.tsx` lines 102–103 — AC#6 zero-work.
- Zustand `undoPendingTodo` state already drives the toast — `Cmd+Z` hooks into the same state.

### Motion / prefers-reduced-motion

Focus changes are instant; no animation. `prefers-reduced-motion` does not apply. The existing delete animation in `TodoItem.onPointerUp` (swipe-off transform) does NOT run for keyboard delete because keyboard delete skips the pointer path entirely. Keyboard delete = instant DOM removal when the `useLiveQuery` re-renders after `softDeleteTodo`. Acceptable; keyboard users expect snappy.

### Test-determinism traps to avoid

- Do NOT call `userEvent.keyboard('{Shift>}/{/Shift}')` for `?` — userEvent uses `event.code`/`event.key` variably across versions. Fire directly: `fireEvent.keyDown(window, { key: '?', shiftKey: true })`.
- Do NOT use Testing Library's `within(...)` to scope queries for `[data-todo-id]` — the hook queries from `document.querySelectorAll`, so the test must render into the actual `document`. That's the default with `render()` from `@testing-library/react`; just avoid any `container:` override.
- When asserting focus in Playwright, prefer `toBeFocused()` over checking `document.activeElement` — more reliable across browsers.

### Interaction with the sync engine

`softDeleteTodo` writes `deletedAt = Date.now()` to Dexie; the sync engine picks it up via its existing mutation subscription (`bmad:mutation` event dispatched from `db.ts:35`) and batches a push. Undo does the same — `updateTodo(id, { deletedAt: null })` triggers another mutation event. NO sync-engine changes are needed in this story. [Source: src/lib/db.ts lines 34–38, src/lib/sync.ts]

### Previous story intelligence (Story 3.7)

Story 3.7 closed by patching `src/lib/sync.ts` to POST to `/api/errors` in the 4xx-drop branch. No overlap with this story. One relevant pattern to reuse: `console.error('context: action failed', err)` for caught async rejections — see `TodoItem.tsx` lines 27–29, 62–64. This story's `softDeleteTodo.catch` and `updateTodo.catch` follow the same convention.

### Recent commit patterns (last 5)

```
72c69c9 feat(trust): /api/errors endpoint + close sync engine's 4xx-drop loop (Story 3.7)
8791daf feat(trust): PWA installability with Serwist (Story 3.6)
2ee5864 feat(trust): offline indicator + useOnlineStatus hook (Story 3.5)
f5ede7d feat(trust): client sync engine with offline queue (Story 3.4)
2ed07c5 feat(trust): POST /api/sync push endpoint (Story 3.3)
```

Commit message convention: `feat(epic-slug): short description (Story X.Y)`. For this story: `feat(power-use): keyboard shortcuts on desktop (Story 4.1)` — matches the Epic 4 "Power use" label in `epics.md`.

### Files expected to change

- NEW: `src/hooks/useKeyboardShortcuts.ts` — the hook.
- NEW: `src/hooks/__tests__/useKeyboardShortcuts.test.tsx` — hook unit tests.
- MODIFIED: `src/stores/useUIStore.ts` — add `helpOverlayOpen`, `toggleHelpOverlay`, `undoPendingDelete`.
- MODIFIED: `src/stores/__tests__/useUIStore.test.ts` — tests for the new actions.
- MODIFIED: `src/components/UndoToast.tsx` — refactor `handleUndo` to call `undoPendingDelete`.
- MODIFIED: `src/components/__tests__/UndoToast.test.tsx` — update mocks if they asserted the direct `updateTodo` call shape.
- MODIFIED: `src/components/TodoApp.tsx` — call `useKeyboardShortcuts()`.
- NEW: `e2e/keyboard.spec.ts` — E2E coverage.
- MODIFIED: `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression.

### Files that must NOT change

- `src/components/TodoItem.tsx` — its Space handler and `data-todo-id` attribute are the contract this story depends on. Zero lines changed.
- `src/components/AddTodoInput.tsx` — its `id="add-todo-input"` is the `n`-shortcut target. Zero lines changed.
- `src/components/TodoList.tsx` — render order equals DOM order equals j/k traversal order; no structural edit needed.
- `src/lib/db.ts`, `src/lib/sync.ts`, `src/lib/schema.ts` — no data-layer change.
- `src/app/**` — no route, no Server Component change.
- `prisma/schema.prisma` — keyboard shortcuts do not change the schema.

### Project Structure Notes

- Hook file goes in `src/hooks/` per the project's structure pattern (architecture.md line 320). No new directory.
- Test file mirrors existing convention: `src/hooks/__tests__/useKeyboardShortcuts.test.tsx` (see `useSync.test.tsx` line 1 for the existing pattern — it uses `.tsx` because the test mounts a harness component). Our test will also mount a harness → use `.tsx`.
- E2E file at the repo root `e2e/` — matches `list.spec.ts`, `complete.spec.ts`, etc.
- Deviation from UX spec line 497 (using native focus instead of `aria-activedescendant`) is documented in "Why native button focus..." above. This is a conscious simplification — note it in the code review if any reviewer asks.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4 / Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — §State Management line 204, §Folder Structure lines 320–323, 479–482, §Action Naming line 371, §AI Agent Guardrails lines 410–418, §Error Handling line 399]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — lines 464–497 keyboard + desktop breakpoint, line 497 focus management note]
- [Source: src/components/TodoItem.tsx lines 32–36 (existing Space handler), line 88 (`data-todo-id`)]
- [Source: src/components/AddTodoInput.tsx lines 11–15, 44 (`id="add-todo-input"` + desktop matchMedia autofocus)]
- [Source: src/components/UndoToast.tsx lines 12–20 (current undo code path this story centralizes)]
- [Source: src/stores/useUIStore.ts — state to extend]
- [Source: src/components/TodoApp.tsx line 10 (`useSync` call site to mirror)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- Red-green-refactor cycle used for both Task 1 (useUIStore extensions) and Task 3 (hook). Initial `undoPendingDelete` tests failed with `TypeError: useUIStore.getState(...).undoPendingDelete is not a function` before the store implementation landed — confirming the tests exercised the right surface.
- One lint error on e2e/keyboard.spec.ts (`@typescript-eslint/prefer-as-const`) surfaced during regression sweep; fixed by switching `const MOD: 'ControlOrMeta' = 'ControlOrMeta'` to `const MOD = 'ControlOrMeta' as const`.
- UndoToast test rewrite: the original test mocked `@/lib/db` and `dismissUndoToast` separately. Since `UndoToast` now calls the store-level `undoPendingDelete`, the test mocks only that method on the store — verifies the toast button delegates, not the db call shape (store tests own that assertion).

### Completion Notes List

- **AC#1–#12 covered.** All shortcuts (`j`, `k`, `n`, `?`, `Cmd/Ctrl+Backspace`, `Cmd/Ctrl+Z`) wired in `useKeyboardShortcuts` with desktop-only `matchMedia` gating; input suppression + modifier disambiguation (including `!shiftKey` for Cmd+Z to preserve future `Cmd+Shift+Z` redo) implemented as specified.
- **AC#13 (hook unit tests)** — 16 tests in `src/hooks/__tests__/useKeyboardShortcuts.test.tsx`. Covers j/k traversal + clamp + empty-list no-op + start-from-nothing, `n` → add input, `?` → toggleHelpOverlay, Cmd+Z with/without pending undo, Ctrl+Z cross-platform, Cmd+Shift+Z redo reservation, Cmd+Backspace focused/unfocused/shift-modifier, input-suppression for both plain keys and modifier combos, mobile-viewport listener-never-attached, unmount cleanup.
- **AC#14 (store unit tests)** — 11 tests in `src/stores/__tests__/useUIStore.test.ts`. New coverage: `helpOverlayOpen` default + toggle; `undoPendingDelete` calls `updateTodo(id, { deletedAt: null })` + clears state; no-op when nothing pending; swallows updateTodo rejection.
- **AC#15 (E2E)** — 3 specs in `e2e/keyboard.spec.ts`, all pass on desktop project at 1440×900, all skipped on mobile project via `test.skip(testInfo.project.name !== 'desktop')` in beforeEach (pattern reused from delete-undo.spec.ts).
- **AC#16 (regression)** — `npm test` (210 passed), `npm run lint` (0 warnings), `npx tsc --noEmit` (clean), `npm run build` (succeeds), `npm run test:e2e --project=desktop` (24 passed) and `--project=mobile` (27 passed) — no regressions in existing specs. Existing `TodoItem.test.tsx` Space handler (AC#2 invariant) and `UndoToast.test.tsx` untouched behavior both still pass.
- **UndoToast centralization** — `handleUndo` removed; button now calls the store's `undoPendingDelete` directly. Visual/markup unchanged. Single source of truth: both the toast button and the `Cmd+Z` shortcut invoke the same store action.
- **Desktop smoke via a real browser** — not performed manually; Playwright E2E on Chromium at 1440×900 exercises the same flows (j nav, Cmd+Backspace + toast, Cmd+Z restore, input suppression) headlessly and passes. The `?` → `toggleHelpOverlay` path is not visible in-app until Story 4.2 ships the overlay render, so there is nothing additional to observe.

### Change Log

| Date       | Change                                                                            |
|------------|-----------------------------------------------------------------------------------|
| 2026-04-23 | Implemented Story 4.1: keyboard shortcuts on desktop (useKeyboardShortcuts hook, useUIStore extensions, UndoToast centralization, unit + E2E coverage). Status → done. |

### File List

- NEW: `src/hooks/useKeyboardShortcuts.ts`
- NEW: `src/hooks/__tests__/useKeyboardShortcuts.test.tsx`
- NEW: `e2e/keyboard.spec.ts`
- MODIFIED: `src/stores/useUIStore.ts` — added `helpOverlayOpen`, `toggleHelpOverlay`, `undoPendingDelete`; switched to `(set, get) => ({ ... })` signature.
- MODIFIED: `src/stores/__tests__/useUIStore.test.ts` — mock `@/lib/db.updateTodo`; new coverage for `helpOverlayOpen` and `undoPendingDelete`.
- MODIFIED: `src/components/UndoToast.tsx` — `handleUndo` removed; button now calls store's `undoPendingDelete`.
- MODIFIED: `src/components/__tests__/UndoToast.test.tsx` — mock `undoPendingDelete` on the store mock; dropped direct `@/lib/db` coupling.
- MODIFIED: `src/components/TodoApp.tsx` — added `useKeyboardShortcuts()` call alongside `useSync()`.
- MODIFIED: `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 4.1 status transitions (ready-for-dev → in-progress → done).
