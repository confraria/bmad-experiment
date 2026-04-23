---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-04-21'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/architecture.md
---

# bmad-experiment - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-experiment, decomposing the requirements from the PRD, UX Design specification, and Architecture document into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Create new todo items from a short text description via a persistent input surface.
FR2: Display all active and completed todos in a single persistent list view.
FR3: Mark todos as complete or incomplete, with visual state distinction between the two states.
FR4: Delete todo items, with a ≥5-second undo window before finalization.
FR5: Persist todo data locally so it survives page refresh, tab close, and browser restart.
FR6: Synchronize todo data across devices belonging to the same client (no authentication in v1; `clientId`-scoped).
FR7: Render a responsive, touch-friendly UI identical in functionality across desktop (Chrome/Safari/Firefox) and mobile (iOS Safari, Chrome Android).
FR8: Handle network failures gracefully — every CRUD operation must succeed locally regardless of connectivity.
FR9: Surface clear empty, offline, and error states without blocking the user's primary task.
FR10: Expose keyboard shortcuts on desktop (add, navigate, complete, delete, undo, help overlay).
FR11: Provide a discoverable desktop help overlay listing all keyboard shortcuts.

### NonFunctional Requirements

NFR1: All user-visible mutations must feel instantaneous — no loading spinner for any local operation.
NFR2: Application must function fully offline; network is a background sync layer, not a dependency.
NFR3: App must be installable as a PWA with standalone display mode, custom launch icon, and offline capability.
NFR4: Accessibility must meet WCAG 2.1 AA baseline in both light and dark modes.
NFR5: Light and dark modes follow OS preference and are polished to equal quality.
NFR6: Motion adheres to 150–250 ms eased transitions; `prefers-reduced-motion` falls back to instant transitions.
NFR7: Data model must support non-breaking migration to multi-user authentication in v2.
NFR8: Stack uses conventional, boring, maintainable choices suitable for a single developer.
NFR9: SSR-safe rendering for fast first paint; client-only APIs (IndexedDB, service worker) gated after hydration.
NFR10: No third-party analytics, tracking, streaks, gamification, push notifications, or in-app marketing.

### Additional Requirements

- Starter template: `npx create-next-app@latest` with TypeScript, Tailwind, App Router, src-dir, ESLint, import alias `@/*`. Followed by `npx shadcn@latest init` and `npx shadcn@latest add toast checkbox`. This is Epic 1 Story 1.
- PWA layer via `@serwist/next serwist`; service worker disabled in dev.
- Local store: Dexie v4 for IndexedDB with reactive queries via `dexie-react-hooks`.
- Server persistence: Prisma + Turso libSQL (prod) / local SQLite (dev).
- Ephemeral UI state: Zustand with immer middleware.
- Motion: Framer Motion with LazyMotion for tree-shaking.
- ID generation: ULID (client-generated, sortable, conflict-free).
- Shared data contracts: Zod schemas in `src/lib/schema.ts`, imported by both client and server.
- Single API endpoint: `/api/sync` (GET for pull, POST for push) — no granular REST CRUD.
- Sync conflict resolution: latest-write-wins by `updatedAt`; soft-delete wins against concurrent update.
- Error-reporting endpoint: `/api/errors` fire-and-forget client error sink.
- CI pipeline: lint, typecheck, Vitest, Playwright (headless), Lighthouse CI (mobile + desktop), axe-core, Prisma migration dry-run. GitHub Actions.
- Deployment: Vercel (app) + Turso (DB). Preview deploys on every PR.
- No hard rate-limiting in v1; rely on Vercel's built-in DDoS protection.

### UX Design Requirements

UX-DR1: Implement Tailwind design tokens — custom 10-step neutral scale (light + dark), single accent color (warm amber #D97706 light / #FBBF24 dark), 4-size type scale (text-xs 13px, text-base 16px, text-lg 18px, text-xl 20px), spacing based on line-height rhythm, motion duration constants (150ms, 200ms, 250ms).
UX-DR2: Build `AddTodoInput` component — persistent input surface. Mobile: bottom-pinned bar. Desktop: top of list, always-focused. Single-line text input, Enter submits, empty submit is no-op, placeholder "Add a task…".
UX-DR3: Build `TodoItem` component — entire row is the tap/click target (not the checkbox). Swipe-left gesture on mobile triggers delete. Supports focus, hover, and completed visual states. Text strike-through + secondary weight on completion.
UX-DR4: Build `TodoList` component — two visual zones (Active primary weight, Completed secondary weight). Completed items recede but remain visible and recoverable. No section dividers, only typographic + whitespace separation.
UX-DR5: Build `UndoToast` component — transient bottom toast (center on mobile, bottom-left on desktop), 5-second auto-dismiss, single "Undo" action, no close button. Restores the deleted item to its original position on undo; finalizes deletion on timeout.
UX-DR6: Build `EmptyState` component — shown when no todos exist. Renders only the input and placeholder; no illustration, no welcome copy, no tutorial.
UX-DR7: Build `OfflineIndicator` component — single 6x6px neutral dot in corner when offline. No label, no banner, no toast.
UX-DR8: Build `HelpOverlay` component — desktop-only, triggered by `?` shortcut, dismissable by Escape or outside click. Lists all keyboard shortcuts (j/k navigate, Enter add, Space toggle complete, Cmd+Z undo, Cmd+Backspace delete, ? help).
UX-DR9: Implement `useOnlineStatus`, `useTodos`, and `useKeyboardShortcuts` hooks — data-to-component bridges per the architecture spec.
UX-DR10: Implement motion presets — all transitions 150–250ms eased, no spring/bounce, items animate from source (new todo slides from input position, deleted item sweeps in swipe direction), `prefers-reduced-motion` falls back to instant.
UX-DR11: Implement design-system-level accessibility — WCAG 2.1 AA contrast in both modes, visible focus indicators using accent color, semantic HTML (`<ul><li>`, `<button>`, `<input>`), ARIA via Radix primitives, `prefers-reduced-motion` support, 44x44px minimum touch targets, tab order follows visual order, 200% zoom reflow without horizontal scroll.
UX-DR12: Implement responsive layout — mobile-first (375px baseline). Breakpoints: mobile 320–767px (bottom input, swipe gestures), tablet 768–1023px (inherits mobile with wider max-width), desktop 1024px+ (top input, keyboard shortcuts active, help overlay available). Content max-width ~600px centered on desktop; never edge-to-edge.
UX-DR13: Implement dark mode — system-preference-following via `prefers-color-scheme`. True dark (#0A0A0A background), not gray-on-gray. Both modes polished to AA contrast.

### FR Coverage Map

- **FR1** (create todos) → Epic 1 — input + local write
- **FR2** (view list) → Epic 1 — list render from Dexie
- **FR3** (complete toggle) → Epic 2 — TodoItem interaction
- **FR4** (delete with undo) → Epic 2 — swipe + UndoToast
- **FR5** (local persistence) → Epic 1 — Dexie setup
- **FR6** (cross-device sync) → Epic 3 — sync engine + API
- **FR7** (responsive) → Epic 1 — Tailwind mobile-first
- **FR8** (network failure handling) → Epic 3 — offline queue, indicator
- **FR9** (empty / offline / error states) → Epic 1 (empty + error boundary) + Epic 3 (offline)
- **FR10** (keyboard shortcuts) → Epic 4
- **FR11** (help overlay) → Epic 4

All 11 FRs mapped. NFRs and UX-DRs distributed across epics per each epic's coverage section.

## Epic List

### Epic 1: Capture

**User outcome:** User can type a task, hit Enter, and see it persist in a list on a single device. Adds and views only; no complete/delete yet. Launch-ready as a local scratchpad.

**FRs covered:** FR1, FR2, FR5, FR7, FR9 (empty + error boundary portion)
**NFRs addressed:** NFR1 (instantaneous), NFR4 (WCAG AA baseline), NFR5 (dark mode), NFR6 (motion budget), NFR8 (maintainable stack), NFR9 (SSR)
**UX-DRs addressed:** UX-DR1 (design tokens), UX-DR2 (AddTodoInput), UX-DR4 (TodoList), UX-DR6 (EmptyState), UX-DR10 (motion — partial, for add), UX-DR11 (accessibility), UX-DR12 (responsive), UX-DR13 (dark mode)
**Also includes:** project scaffold (per Architecture init command), Tailwind design token config, Dexie setup, SSR shell, baseline accessibility.

### Epic 2: Manage

**User outcome:** User can mark todos complete, delete them with a 5-second undo window, and see clear visual distinction between active and completed items. The app is now a functional personal todo tool on a single device.

**FRs covered:** FR3, FR4
**NFRs addressed:** NFR1 (instantaneous mutations), NFR10 (no gamification on complete)
**UX-DRs addressed:** UX-DR3 (TodoItem with swipe + tap-to-complete), UX-DR5 (UndoToast), UX-DR10 (motion for complete/delete)

### Epic 3: Trust

**User outcome:** User's todos persist across devices and survive network failures. App is installable as a PWA on home screen with custom icon; works fully offline; syncs silently when online.

**FRs covered:** FR6, FR8, FR9 (offline portion)
**NFRs addressed:** NFR2 (offline-first), NFR3 (PWA installable), NFR7 (v2 auth migration path via clientId)
**UX-DRs addressed:** UX-DR7 (OfflineIndicator)
**Also includes:** Prisma schema + Turso setup, `/api/sync` endpoint, client-side sync engine with backoff, Serwist PWA layer and service worker, `/api/errors` client error reporting, CI pipeline, Vercel deployment.

### Epic 4: Power use

**User outcome:** User can operate the app entirely from the keyboard on desktop, with a discoverable help overlay listing all shortcuts.

**FRs covered:** FR10, FR11
**UX-DRs addressed:** UX-DR8 (HelpOverlay), UX-DR9 (useKeyboardShortcuts hook)

## Epic 1: Capture

Enable the user to type a task, hit Enter, and see it persist in a single-device list. This epic delivers a working local scratchpad — no complete/delete/sync yet.

### Story 1.1: Project scaffold and design tokens

As a developer,
I want the project scaffolded with Next.js + TypeScript + Tailwind + shadcn/ui and design tokens wired up,
So that all subsequent stories build on a consistent foundation matching the UX spec.

**Acceptance Criteria:**

**Given** an empty repository,
**When** the starter commands from Architecture are run (`npx create-next-app@latest` with TS/Tailwind/App Router/src-dir, followed by `npx shadcn@latest init` and `npx shadcn@latest add toast checkbox`),
**Then** the project runs with `npm run dev`, renders the default Next.js shell, and has `src/components/ui/` populated with shadcn primitives.

**Given** the UX design spec,
**When** `tailwind.config.ts` and `src/app/globals.css` are configured,
**Then** they expose a 10-step neutral scale (light + dark), a single accent color (#D97706 light / #FBBF24 dark), a 4-size type scale (13/16/18/20px), spacing based on line-height rhythm, and motion duration constants at 150/200/250ms.

**Given** a user whose OS is set to dark mode,
**When** they load the app,
**Then** the app renders in dark mode with a near-black (#0A0A0A) background and maintains WCAG AA contrast for all text.

**Given** a user whose OS is set to reduced-motion preference,
**When** they trigger any UI transition,
**Then** the transition falls back to instant.

### Story 1.2: Local todo store with Dexie and client identity

As a developer,
I want a typed local IndexedDB store with client identity, ULID generation, and Zod schemas,
So that todos can be persisted locally and the data layer is ready for sync in Epic 3.

**Acceptance Criteria:**

**Given** a fresh install,
**When** the app first mounts,
**Then** a ULID-based `clientId` is generated once and persisted in `localStorage`, and subsequent mounts reuse it.

**Given** the Dexie schema defined in `src/lib/db.ts`,
**When** a Todo is written via `db.todos.put(todo)`,
**Then** it persists across page refresh, tab close, and browser restart, and all fields match the Zod `TodoSchema` defined in `src/lib/schema.ts`.

**Given** the domain helpers exposed from `src/lib/db.ts`,
**When** any mutation occurs,
**Then** `updatedAt` is set to `Date.now()` and `id` (if absent) is generated as a new ULID.

### Story 1.3: Add todos via persistent input

As a user,
I want to type a task, hit Enter, and see it instantly appear in my list,
So that capturing a thought feels as fast as thinking it.

**Acceptance Criteria:**

**Given** I am on mobile (≤767px),
**When** the app is rendered,
**Then** a persistent input bar is pinned to the bottom with placeholder "Add a task…" and a 44×44px tap target.

**Given** I am on desktop (≥1024px),
**When** the app is rendered,
**Then** the input sits at the top of the list, is auto-focused on mount, and remains focused after each submission.

**Given** I type "Buy milk" and press Enter,
**When** the submit fires,
**Then** a new Todo is written to Dexie within one frame, the list re-renders with the new item at the top, the input clears, focus is retained, and the item slides in from the input position in ≤250ms.

**Given** the input is empty,
**When** I press Enter,
**Then** nothing happens — no error, no flash, no state change.

### Story 1.4: View active todos as a live list

As a user,
I want to see all my active todos rendered in a clean, type-driven list,
So that I can glance at what's on my plate at any moment.

**Acceptance Criteria:**

**Given** there are active todos in Dexie,
**When** the app is rendered,
**Then** `TodoList` renders each non-deleted, non-completed todo as a `TodoItem` row in newest-first order, using only typographic hierarchy and whitespace for separation (no dividers, no icons-as-decoration).

**Given** a new todo is written to Dexie,
**When** the write commits,
**Then** the list updates reactively within one frame without any loading state (via `useLiveQuery`).

**Given** the user is on a cold load,
**When** the server renders the page shell,
**Then** SSR renders the empty `EmptyState` placeholder, and the client hydrates with real Dexie data after mount without layout shift.

### Story 1.5: Empty state as the onboarding

As a first-time user,
I want a clean, non-performative empty state that invites me to start typing,
So that no onboarding, tour, or welcome copy is needed.

**Acceptance Criteria:**

**Given** Dexie contains zero active todos,
**When** the app is rendered,
**Then** only the input field is visible, with placeholder "Add a task…" — no illustration, no welcome text, no tutorial.

**Given** the user adds their first todo,
**When** the todo appears,
**Then** the empty state is replaced by the list without content shift.

### Story 1.6: Global and component error boundaries

As a user,
I want the app to never show a raw stack trace or blank page when something goes wrong,
So that I can always reload and continue.

**Acceptance Criteria:**

**Given** a runtime error occurs during route render,
**When** Next.js catches it,
**Then** `app/error.tsx` renders a minimal "Something isn't rendering — reload the page" screen with a Reload button, and no stack trace is visible.

**Given** a runtime error occurs inside `TodoApp` or any of its children,
**When** the component-level React ErrorBoundary catches it,
**Then** a minimal fallback renders in place of the broken subtree, and the error is POSTed to `/api/errors` (fire-and-forget).

## Epic 2: Manage

Enable the user to mark todos complete, delete them with undo, and see clear visual distinction between active and completed items. After this epic, the app is a functional personal todo tool on a single device.

### Story 2.1: Mark todos complete with tap/Space

As a user,
I want to mark a todo complete with a single tap or Space key,
So that clearing items feels effortless.

**Acceptance Criteria:**

**Given** I am on mobile and see an active todo row,
**When** I tap anywhere on the row,
**Then** the todo's `completed` field flips to `true`, `updatedAt` is set to `Date.now()`, and the row transitions over 200ms to strikethrough with secondary typographic weight (eased, no bounce).

**Given** I am on desktop and have focused a todo row,
**When** I press Space,
**Then** the same completion toggle applies.

**Given** a completed todo row,
**When** I tap it again (or Space),
**Then** `completed` flips back to `false`, `updatedAt` is set to `Date.now()`, and the row returns to active weight.

**Given** `prefers-reduced-motion` is set,
**When** completion fires,
**Then** the visual change is instant (no transition).

### Story 2.2: Delete todos via swipe (mobile)

As a mobile user,
I want to swipe a todo left to delete it,
So that cleanup feels natural and one-handed.

**Acceptance Criteria:**

**Given** I am on mobile viewing a todo row,
**When** I swipe left with a horizontal gesture exceeding a threshold,
**Then** the row sweeps off in the swipe direction over 200ms eased, and `deletedAt = Date.now()` is written to Dexie (soft delete).

**Given** my swipe is below the threshold,
**When** I release,
**Then** the row springs back to its original position and no deletion occurs.

**Given** the deletion writes to Dexie,
**When** the `TodoList` re-renders,
**Then** the deleted item is no longer shown in the active or completed zones.

### Story 2.3: Undo toast for deletions

As a user,
I want a 5-second window to undo an accidental delete,
So that deletes feel safe and never anxious.

**Acceptance Criteria:**

**Given** a todo is soft-deleted,
**When** the deletion is written,
**Then** an `UndoToast` appears (bottom-center on mobile, bottom-left on desktop) with the todo's text and an "Undo" action, auto-dismissing after 5 seconds.

**Given** the toast is visible,
**When** the user taps/clicks "Undo" before timeout,
**Then** `deletedAt` is cleared back to `null`, `updatedAt` is refreshed, and the todo reappears at its original position in the list.

**Given** the toast is visible,
**When** the user triggers another delete before the toast dismisses,
**Then** the existing toast is replaced with the new one (no toast stacking), and the prior deletion finalizes.

**Given** the toast auto-dismisses without undo,
**When** the 5-second timer elapses,
**Then** the soft-deleted item remains soft-deleted; no further action is needed.

### Story 2.4: Completed section visual distinction

As a user,
I want completed todos to recede visually while remaining accessible,
So that my active list stays emotionally light without losing history.

**Acceptance Criteria:**

**Given** there are both active and completed todos,
**When** `TodoList` renders,
**Then** active todos appear at the top with primary typographic weight, and completed todos appear below with strikethrough + secondary weight + reduced opacity.

**Given** the two zones render together,
**When** I look at the list,
**Then** the separation between zones is communicated by whitespace and typographic contrast only — no dividing lines, no "Active" / "Completed" section headers, no icons.

**Given** I toggle a todo from active to completed,
**When** the state changes,
**Then** the row visually moves from the active zone to the completed zone with a transition ≤250ms (respecting `prefers-reduced-motion`).

## Epic 3: Trust

Enable cross-device persistence, offline-first operation, PWA installability, and graceful network-failure handling. After this epic, the app is shipping-ready v1.

### Story 3.1: Prisma schema and Turso connection

As a developer,
I want a Prisma schema that mirrors the Dexie Todo entity, with local SQLite for dev and Turso libSQL for prod,
So that server persistence is ready for the sync engine.

**Acceptance Criteria:**

**Given** `prisma/schema.prisma`,
**When** `npx prisma migrate dev` is run,
**Then** a `Todo` table is created with fields matching the client Todo (id, clientId, text, completed, createdAt, updatedAt, deletedAt), with indexes on `clientId` and `updatedAt`.

**Given** a local dev environment,
**When** `DATABASE_URL` points to a local SQLite file,
**Then** `src/lib/prisma.ts` exposes a singleton Prisma client that reads/writes successfully.

**Given** a production environment on Vercel,
**When** `DATABASE_URL` points to a Turso instance,
**Then** the same Prisma client works via the libSQL adapter.

### Story 3.2: Sync pull endpoint (GET /api/sync)

As a developer,
I want a GET endpoint that returns all todos for a given `clientId` updated since a timestamp,
So that clients can pull server changes on startup and periodically.

**Acceptance Criteria:**

**Given** a request `GET /api/sync?clientId=X&since=<ts>`,
**When** Zod validates the query params successfully,
**Then** the response is `{ todos: Todo[] }` containing all todos for `clientId` with `updatedAt > since`, including soft-deleted ones.

**Given** a request with `since=0`,
**When** the handler runs,
**Then** it returns all todos for that `clientId` (full initial sync).

**Given** invalid query params,
**When** Zod validation fails,
**Then** the response is HTTP 400 with `{ error: { code, message } }` and no stack trace.

### Story 3.3: Sync push endpoint (POST /api/sync)

As a developer,
I want a POST endpoint that accepts a batch of client todo deltas and reconciles them with the server,
So that clients can push local changes.

**Acceptance Criteria:**

**Given** a request `POST /api/sync` with body `{ clientId, todos: Todo[] }`,
**When** Zod validates and the handler upserts each todo,
**Then** for each todo, the server keeps whichever record has the greatest `updatedAt` (latest-write-wins).

**Given** an incoming todo has `deletedAt` set,
**When** it conflicts with a concurrent non-deleted update,
**Then** the soft-deleted state wins regardless of `updatedAt` order.

**Given** a successful upsert batch,
**When** the response returns,
**Then** the body is `{ accepted: number }` reflecting how many rows were upserted, and no stack traces are leaked on any failure path.

### Story 3.4: Client sync engine with offline queue

As a user,
I want my todos to sync across my devices in the background without me ever seeing a spinner,
So that I can trust the data and never wait.

**Acceptance Criteria:**

**Given** the app mounts,
**When** `src/lib/sync.ts` initializes,
**Then** it first performs a pull `GET /api/sync?clientId=X&since=<lastSyncAt | 0>`, merges the result into Dexie (latest-write-wins), and updates `lastSyncAt`.

**Given** any Dexie mutation (create/update/delete),
**When** the Dexie hook fires,
**Then** the sync engine enqueues a delta and debounces pushes to `/api/sync` with batched todos.

**Given** a push fails due to network or 5xx/429 response,
**When** the engine retries,
**Then** it uses exponential backoff up to 5 attempts with a 30-second cap, preserves the queue across retries, and never blocks or disturbs the UI.

**Given** a push fails with a 4xx response other than 429,
**When** the engine handles it,
**Then** it logs to `/api/errors`, drops the offending record from the queue, and continues.

### Story 3.5: Online/offline detection and indicator

As a user,
I want a small, unobtrusive signal when I'm offline,
So that I know the app is operating locally without any alarm.

**Acceptance Criteria:**

**Given** the browser fires an `offline` event (or `navigator.onLine` is false on mount),
**When** `useOnlineStatus` updates,
**Then** the `OfflineIndicator` renders a 6×6px neutral dot in the top-right corner with no label, banner, or toast.

**Given** the browser fires an `online` event,
**When** `useOnlineStatus` updates,
**Then** the indicator disappears (fade ≤200ms), and the sync engine attempts a pull + queue flush.

**Given** the offline indicator is visible,
**When** the user performs CRUD operations,
**Then** all operations succeed locally with no change in UI speed or feedback.

### Story 3.6: PWA installability with Serwist

As a user,
I want to install the app to my home screen and launch it without browser chrome,
So that it feels like a native app.

**Acceptance Criteria:**

**Given** `@serwist/next` is configured in `next.config.ts`,
**When** the production build runs,
**Then** a service worker is generated that precaches the app shell and runtime-caches static assets.

**Given** `public/manifest.webmanifest`,
**When** a browser reads the manifest,
**Then** it finds `name`, `short_name`, `display: "standalone"`, `start_url: "/"`, `theme_color`, `background_color`, and icons at 192, 512, and maskable variants.

**Given** a user on a supporting browser,
**When** they trigger "Add to Home Screen",
**Then** the app installs with the custom icon and launches in standalone mode with no browser UI.

**Given** a dev environment (`npm run dev`),
**When** the app runs,
**Then** the service worker is disabled (Serwist dev config) so cache surprises don't interfere with development.

### Story 3.7: Client error reporting endpoint

As a developer,
I want client-side errors posted to `/api/errors` so they appear in server logs,
So that I can see what's breaking in production.

**Acceptance Criteria:**

**Given** a request `POST /api/errors` with body `{ message, stack, clientId, userAgent, url }`,
**When** Zod validates,
**Then** the server writes a `console.error` log line and responds with HTTP 204 (no content).

**Given** a malformed body,
**When** Zod validation fails,
**Then** the server still returns 204 (the endpoint is fire-and-forget; never surface failures back to the client).

**Given** the client-side component error boundary catches a render error,
**When** it fires the report,
**Then** the request is `keepalive: true` and never blocks UI.

### Story 3.8: CI pipeline

As a developer,
I want a GitHub Actions pipeline that guards every PR,
So that regressions in correctness, accessibility, or performance are caught before merge.

**Acceptance Criteria:**

**Given** a pull request,
**When** CI runs,
**Then** it sequentially executes: ESLint, `tsc --noEmit`, Vitest unit tests, Playwright headless E2E, Lighthouse CI mobile + desktop, axe-core scan, and Prisma migrate dry-run.

**Given** any CI stage fails,
**When** the run completes,
**Then** the PR is blocked from merge and the failing stage is clearly identified in the job summary.

**Given** Lighthouse or axe produces warnings (not errors),
**When** the results are posted,
**Then** they appear as a PR comment so the developer can review before merging.

### Story 3.9: Vercel deployment wiring

As a developer,
I want automatic Vercel deploys from the main branch and preview deploys per PR,
So that changes ship continuously.

**Acceptance Criteria:**

**Given** a push to the main branch,
**When** Vercel's integration fires,
**Then** the app builds and deploys to production with `DATABASE_URL` pointing to the prod Turso instance.

**Given** a pull request,
**When** Vercel's integration fires,
**Then** a preview deployment is created with its own `DATABASE_URL` (staging Turso or ephemeral), and the preview URL is posted to the PR.

**Given** the production deployment,
**When** a user visits,
**Then** the service worker installs correctly, PWA install prompt is available on supporting browsers, and initial sync succeeds.

### Story 3.10: Docker deployment

As a developer,
I want the app packaged as a self-contained Docker image with a local `docker compose` setup,
So that it can run anywhere (self-hosted or any container host) without depending on Vercel.

**Acceptance Criteria:**

**Given** a multi-stage `Dockerfile` at the repo root,
**When** `docker build -t bmad-experiment .` runs,
**Then** a production image builds successfully using Next.js `output: 'standalone'`, with Prisma client generated, Serwist service worker baked in, and no dev dependencies in the runtime layer.

**Given** a `docker-compose.yml`,
**When** `docker compose up` is run,
**Then** the app listens on `http://localhost:3000`, Prisma migrations apply to a SQLite file stored on a named volume, and the volume survives `docker compose down && docker compose up` cycles (data persists).

**Given** a `.github/workflows/docker.yml` workflow,
**When** a commit lands on `main` (or the workflow is manually dispatched),
**Then** the image builds and pushes to GHCR (`ghcr.io/confraria/bmad-experiment`) tagged `latest` + the short commit SHA, using `GITHUB_TOKEN` (no additional secrets required).

**Given** the published GHCR image,
**When** a user pulls and runs it with `DATABASE_URL` pointing to a mounted SQLite file,
**Then** the app serves normally, including CRUD, offline sync engine, and the `/api/errors` + `/api/sync` endpoints.

## Epic 4: Power use

Enable the user to operate the app entirely from the keyboard on desktop, with a discoverable help overlay.

### Story 4.1: Keyboard shortcuts on desktop

As a desktop power-user,
I want to navigate and manipulate todos entirely from the keyboard,
So that I never need to reach for the mouse.

**Acceptance Criteria:**

**Given** the app is running on desktop,
**When** `useKeyboardShortcuts` is mounted,
**Then** the following shortcuts work regardless of focus position (unless a native input has focus):
- `j` / `k` → move focus to next / previous todo row.
- `n` → focus the Add input.
- `Space` → toggle complete on the focused row.
- `Cmd/Ctrl + Backspace` → delete the focused row.
- `Cmd/Ctrl + Z` → undo the most recent delete (equivalent to the toast Undo).

**Given** focus is on the Add input and the user is typing,
**When** they press any letter key,
**Then** typing proceeds normally and shortcuts are suppressed.

**Given** `?` is pressed outside an input,
**When** the handler fires,
**Then** the `HelpOverlay` toggles open/closed.

**Given** the focused row is visually indicated,
**When** focus is on a todo row,
**Then** a visible focus indicator (accent color, meeting AA contrast) is rendered on the row per the UX accessibility requirement.

### Story 4.2: Help overlay

As a desktop user,
I want a discoverable list of keyboard shortcuts,
So that I can learn and recall the app's power-user vocabulary without reading docs.

**Acceptance Criteria:**

**Given** the app is on desktop (≥1024px),
**When** the user presses `?` outside an input,
**Then** `HelpOverlay` opens as a modal listing all shortcuts: `j/k` navigate, `n` focus input, `Enter` submit, `Space` toggle complete, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Backspace` delete, `?` toggle help.

**Given** the overlay is open,
**When** the user presses `Escape` or clicks outside the overlay,
**Then** the overlay dismisses.

**Given** the user is on mobile (≤1023px),
**When** the `?` shortcut is unavailable on that device,
**Then** the HelpOverlay is not triggerable and is not rendered in the DOM.
