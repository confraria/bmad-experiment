# Story 3.5: Online/offline detection and indicator

Status: done

## Story

As a user,
I want a small, unobtrusive signal when I'm offline,
so that I know the app is operating locally without any alarm.

## Acceptance Criteria

1. **`useOnlineStatus` tracks browser online/offline events.** Given `src/hooks/useOnlineStatus.ts`, when the hook runs, then it returns a boolean `online`. It subscribes to `window.addEventListener('online' | 'offline')` on mount and removes both listeners on unmount. Initial state on SSR is `true` (server can't know); first client-side effect reconciles to `navigator.onLine`.

2. **No hydration mismatch.** Given the server renders a page where the user is offline, when the client hydrates, then React does not log a hydration mismatch warning. The `OfflineIndicator` renders with `opacity: 0` on both server and first client render, then the `useEffect` updates the state and the CSS transition fades the dot in.

3. **`OfflineIndicator` renders a 6×6 px neutral dot, top-right.** Given the hook returns `online === false`, when the component renders, then a 6×6 px circle appears `fixed top-3 right-3` (12 px from each edge) with a neutral color (`bg-muted-foreground` or equivalent token). No label, no banner, no toast, no animation beyond the fade.

4. **Fade ≤ 200 ms both directions.** Given `online` transitions true → false or false → true, when the CSS transition runs, then the opacity animates between 0 and 1 over ≤ 200 ms. The element stays mounted in both states so the transition works in both directions; `opacity` + `visibility` (or pointer-events suppression) keep it inert when invisible.

5. **`prefers-reduced-motion` honoured.** Given the user has `prefers-reduced-motion: reduce`, when `online` changes, then the opacity change is instant (no transition). This is covered by the existing global `globals.css` rule; no per-component override is needed — verify the rule applies to the indicator's transition.

6. **Accessibility — not announced repeatedly.** Given the dot is a passive status indicator, when it appears, then it uses `role="status"` with `aria-label="Offline"` so assistive tech users are informed once. The text is NOT visually rendered. Do NOT use `aria-live="assertive"` (too disruptive) or `role="alert"`.

7. **Sync engine already flushes on reconnect (no change needed).** Story 3.4 wired `startSync()` to listen for the `online` event and call `scheduleSync()`. Confirm no regression — when `online` fires, the engine schedules a tick. No new code needed in `sync.ts` for this story.

8. **CRUD operations work unchanged while offline.** Given the indicator is visible, when the user adds / toggles / deletes a todo, then all local operations succeed at the same speed and with the same feedback as when online (local Dexie writes are unaffected; the push is queued by the sync engine and flushes on reconnect).

9. **`useSync` still mounts exactly once even across `useOnlineStatus` updates.** Given the parent `TodoApp` re-renders when `useOnlineStatus` changes (because it adds the `OfflineIndicator` child), when React re-runs, then `useSync()`'s effect does not re-fire (empty deps). Indirectly verified by the existing `useSync.test.tsx` "does not re-call startSync on re-render" case — no new test needed.

10. **Unit + E2E tests.**
    - Unit: `useOnlineStatus.test.ts` covers `online`/`offline` event handling + cleanup.
    - Unit: `OfflineIndicator.test.tsx` renders the dot based on the hook value.
    - E2E: `e2e/offline.spec.ts` uses Playwright's `context.setOffline(true/false)` to assert the dot's visibility transitions and that a todo added while offline is still present after reload (local persistence still holds).

11. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed.

## Tasks / Subtasks

- [x] **Task 1 — Create `src/hooks/useOnlineStatus.ts`** (AC: #1, #2)
  - [x] Implementation:
    ```ts
    'use client';
    import { useEffect, useState } from 'react';

    export function useOnlineStatus(): boolean {
      // Default to true on SSR + first client render to avoid hydration mismatch.
      // The effect below reconciles to the real navigator.onLine.
      const [online, setOnline] = useState(true);

      useEffect(() => {
        if (typeof navigator !== 'undefined') {
          setOnline(navigator.onLine);
        }
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }, []);

      return online;
    }
    ```
  - [x] No Zustand store. The architecture doc mentions Zustand for "offline indicator" (line 204), but this hook is already encapsulated and has a single consumer — YAGNI on the store indirection.

- [x] **Task 2 — Unit tests for `useOnlineStatus`** (AC: #1, #10)
  - [x] Create `src/hooks/__tests__/useOnlineStatus.test.ts`. Use `@testing-library/react`'s `renderHook` + `act`.
  - [x] Test cases:
    - Initial value is `true` (no events fired yet).
    - After mount, reconciles to `navigator.onLine` (stub via `Object.defineProperty`).
    - `window.dispatchEvent(new Event('offline'))` → hook returns `false`.
    - `window.dispatchEvent(new Event('online'))` → hook returns `true`.
    - On unmount, event listeners are detached (spy on `removeEventListener`).

- [x] **Task 3 — Create `src/components/OfflineIndicator.tsx`** (AC: #3, #4, #5, #6)
  - [x] Implementation:
    ```tsx
    'use client';
    import { useOnlineStatus } from '@/hooks/useOnlineStatus';

    export function OfflineIndicator() {
      const online = useOnlineStatus();
      return (
        <div
          role="status"
          aria-label="Offline"
          aria-hidden={online}
          className={[
            'pointer-events-none fixed right-3 top-3 z-40 h-1.5 w-1.5 rounded-full bg-muted-foreground',
            'transition-opacity duration-200',
            online ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
        />
      );
    }
    ```
  - [x] **Why `h-1.5 w-1.5`:** Tailwind v4 `1.5` = 6 px. Matches UX spec "6×6 px".
  - [x] **Why `right-3 top-3`:** 12 px inset. UX spec says "top-right corner" without specifying exact px — 12 px matches shadcn/Tailwind design conventions and stays clear of scrollbar overlays.
  - [x] **Why `bg-muted-foreground`:** neutral color that adapts to light/dark themes. Not `bg-destructive`, not red — UX spec §271: "Offline state via a single neutral dot."
  - [x] **Why `pointer-events-none`:** it's a status indicator; never interactive. Even at `opacity-0` this keeps it inert.
  - [x] **Why `aria-hidden={online}`:** screen readers only announce it when offline. `role="status"` + `aria-label="Offline"` is announced once when it enters the accessibility tree; flipping `aria-hidden` when online removes it cleanly.
  - [x] **Why `z-40`:** above content but below the undo toast (which uses `z-50`). Two indicators won't visually conflict since they occupy opposite corners.

- [x] **Task 4 — Wire into `TodoApp.tsx`** (AC: #3)
  - [x] Add `<OfflineIndicator />` at the end of the `TodoApp` JSX, after `<UndoToast />`.
  - [x] No structural changes to the layout; the indicator is `fixed`, so it detaches from flow.

- [x] **Task 5 — Unit tests for `OfflineIndicator`** (AC: #3, #6, #10)
  - [x] Create `src/components/__tests__/OfflineIndicator.test.tsx`.
  - [x] Mock `useOnlineStatus` at the module level:
    ```ts
    let mockOnline = true;
    vi.mock('@/hooks/useOnlineStatus', () => ({
      useOnlineStatus: () => mockOnline,
    }));
    ```
  - [x] Test cases:
    - Renders the element with `opacity-0` when online.
    - Renders the element with `opacity-100` when offline.
    - Element is always present in the DOM regardless of state (so fade works).
    - `role="status"` and `aria-label="Offline"` are set.
    - `aria-hidden="true"` when online, `aria-hidden="false"` when offline.

- [x] **Task 6 — E2E test for offline behavior** (AC: #3, #8, #10)
  - [x] Create `e2e/offline.spec.ts`. Check existing specs for the project's Playwright helper patterns (look at `e2e/delete-undo.spec.ts`).
  - [x] Test cases:
    - `goto('/')` → dot is NOT visible (default online).
    - `context.setOffline(true)` → dot appears within ~300 ms (accounting for the fade).
    - Add a todo while offline → todo appears in the list immediately.
    - `context.setOffline(false)` → dot disappears.
    - Reload the page (still offline? no — after re-online). Assert the todo is still in the list (local persistence).
  - [x] Use `page.locator('[role="status"][aria-label="Offline"]')` — avoid brittle class-name selectors.
  - [x] Use `expect(locator).toBeVisible()` / `toBeHidden()` — Playwright's `toBeVisible` respects `opacity` AND `visibility`. Since our element stays mounted with `opacity-0`, use `toHaveCSS('opacity', '1')` or `toHaveCSS('opacity', '0')` instead. Document the chosen assertion in a comment.

- [x] **Task 7 — Regression sweep** (AC: #11)
  - [x] `npm test` — all tests pass.
  - [x] `npm run test:e2e` — Playwright includes the new spec and all prior specs still pass.
  - [x] `npm run lint`.
  - [x] `npx tsc --noEmit`.
  - [x] `npm run build`.

## Dev Notes

### Hydration-safe pattern: default `true`, reconcile in `useEffect`

`navigator.onLine` does not exist on the server. The hook defaults to `true` so the server and the first client render produce identical output (`opacity-0`, `aria-hidden="true"`). The `useEffect` then calls `setOnline(navigator.onLine)` — if the user is offline on first load, React re-renders with the real value and the dot fades in. No hydration mismatch.

### `navigator.onLine` caveats (acceptable for v1)

`navigator.onLine === true` means "the browser has a network interface connected" — NOT "the browser can reach the internet." A user on captive portal Wi-Fi can report `online: true` while being effectively offline. For v1 this is acceptable: the sync engine's backoff handles the "online but unreachable" case silently, and the user's experience is still "I see my todos, I type, they save locally." If we find users commonly hit this, a follow-up story could add a heartbeat ping; out of scope here.

### Why no Zustand store for this

The architecture decisions doc (line 204) lists "offline indicator" as a Zustand concern. That was written before we knew the consumer graph. In practice: `useOnlineStatus` has ONE consumer (`OfflineIndicator`), and the sync engine already consumes `navigator.onLine` directly (not via the hook). Adding a Zustand store would be a pure indirection with no reuse benefit. We can introduce it later if a second consumer emerges.

### Fade transition + `prefers-reduced-motion`

`globals.css` already contains:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0ms !important;
  }
}
```
The `transition-opacity duration-200` class on the indicator is covered by this global rule. No per-component override needed. Verify in `OfflineIndicator.test.tsx` that the class is applied; the runtime override is browser-level and untestable in jsdom.

### E2E — `context.setOffline`

Playwright's `BrowserContext.setOffline(boolean)` is the canonical way to simulate offline. It fires the `offline`/`online` events on the page AND blocks all network requests. In contrast, `page.route(...).abort()` only blocks requests; it doesn't fire events or set `navigator.onLine`. Use `setOffline` here.

### The sync engine already flushes on reconnect (Story 3.4)

`src/lib/sync.ts` line ~158: `window.addEventListener('online', scheduleSync)` is set up in `startSync()`. When the browser comes back online, the engine's debounced tick fires → pull + flush queued writes. This story does not modify `sync.ts`. If E2E shows the reconnect path doesn't actually push, that's a Story 3.4 bug — report it, don't paper over it here.

### Files expected to change

- `src/hooks/useOnlineStatus.ts` — NEW
- `src/hooks/__tests__/useOnlineStatus.test.ts` — NEW
- `src/components/OfflineIndicator.tsx` — NEW
- `src/components/__tests__/OfflineIndicator.test.tsx` — NEW
- `src/components/TodoApp.tsx` — add `<OfflineIndicator />` after `<UndoToast />`
- `e2e/offline.spec.ts` — NEW
- `_bmad-output/implementation-artifacts/3-5-online-offline-detection-and-indicator.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression

### Files that must NOT be changed

- `src/lib/sync.ts` — already handles `online` reconnect from Story 3.4
- `src/lib/db.ts` — CRUD is unaffected by online state
- `src/stores/useUIStore.ts` — not adding offline here (see Dev Notes §"Why no Zustand store")
- `src/app/globals.css` — `prefers-reduced-motion` rule is already correct

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.5]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — §Offline dot (line 461), §Additional Patterns, §Trust visual language (line 115)]
- [Source: _bmad-output/planning-artifacts/architecture.md — §Project Directory Structure (`OfflineIndicator.tsx`, `useOnlineStatus.ts`), §Error Handling Patterns (passive indicators not modals)]
- [Source: _bmad-output/implementation-artifacts/3-4-client-sync-engine-with-offline-queue.md — `online` event listener already wired in `startSync()`]
- [Source: src/components/TodoApp.tsx — integration point]
- [Source: src/app/globals.css — global `prefers-reduced-motion` rule]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- Initial hook used `useState` + `useEffect` with synchronous `setState` inside the effect. ESLint's `react-hooks/set-state-in-effect` flagged it (cascading renders). Rewrote using `useSyncExternalStore` — React's idiomatic API for subscribing to external state like `navigator.onLine`, with first-class SSR support via the third `getServerSnapshot` argument. Cleaner code (10 LOC shorter) and lint-clean.
- The `useSyncExternalStore` rewrite required updating tests: the old version had explicit `setState(true|false)` in event handlers, so dispatching a bare `Event('offline')` was enough to flip the state. The new version reads `navigator.onLine` on every snapshot, so tests must mutate `navigator.onLine` BEFORE dispatching the event. This is actually more faithful to real browser behavior — browsers always set `navigator.onLine` first, then fire the event.
- First E2E pass failed: `getByRole('status', { name: 'Offline' })` excludes `aria-hidden="true"` elements by default, so the locator couldn't find the dot when online. Switched to `page.locator('[aria-label="Offline"]')` which ignores the accessibility tree — the aria-label is always present regardless of aria-hidden.
- Playwright placeholder match `/what needs doing/i` was a lazy guess. Actual placeholder is `"Add a task…"`. Replaced with exact string.

### Completion Notes List

- `useOnlineStatus` hook uses `useSyncExternalStore` — zero effects, SSR-safe, automatically handles cleanup. 10 LOC.
- `OfflineIndicator`: 6×6 px `bg-muted-foreground` dot, `fixed top-3 right-3 z-40`. Always mounted; `opacity-0 ⇄ opacity-100` with `transition-opacity duration-200` so the fade works both directions. `role="status" aria-label="Offline" aria-hidden={online}` announces once to screen readers when offline, silent when online.
- `prefers-reduced-motion` handled globally in `globals.css`; no per-component override.
- `OfflineIndicator` wired into `TodoApp.tsx` after `<UndoToast />`.
- **Unit tests: 11 new** (5 hook + 6 component). Full suite: 173/173 pass.
- **E2E tests: 4 new** in `e2e/offline.spec.ts` — appearance, disappearance, CRUD-while-offline + persistence across reload, 6×6 px footprint. All green on both desktop and mobile projects; total 42/42 Playwright pass.
- Sync engine untouched (Story 3.4 already handles `online` reconnect).

### File List

- `src/hooks/useOnlineStatus.ts` — NEW: `useSyncExternalStore`-based hook
- `src/hooks/__tests__/useOnlineStatus.test.ts` — NEW: 5 tests
- `src/components/OfflineIndicator.tsx` — NEW: passive status dot
- `src/components/__tests__/OfflineIndicator.test.tsx` — NEW: 6 tests
- `src/components/TodoApp.tsx` — MODIFIED: `<OfflineIndicator />` appended
- `e2e/offline.spec.ts` — NEW: 4 E2E tests (×2 projects = 8 runs)
- `_bmad-output/implementation-artifacts/3-5-online-offline-detection-and-indicator.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression
