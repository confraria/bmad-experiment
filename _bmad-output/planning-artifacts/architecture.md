---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-21'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'architecture'
project_name: 'bmad-experiment'
user_name: 'confraria'
date: '2026-04-21'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (from PRD):**
- Todo CRUD: create, read, update (completion toggle), delete
- Persistent storage surviving page refresh, session restart, and cross-device access
- Responsive rendering across desktop (Chrome/Safari/Firefox) and mobile (iOS Safari, Chrome Android)
- Error handling with user-facing error/empty/loading states
- Graceful recovery from network failures without data loss

**Non-Functional Requirements (from PRD + UX spec):**
- **Perceived instantaneous interaction** — every mutation must succeed locally before any network concern. This is a hard architectural constraint, not a polish target.
- **Offline-first operation** — CRUD must work with zero connectivity; sync happens in background when available.
- **Cross-device persistence** — same data accessible from phone and desktop in the same browser profile (implies a sync backend, not pure-local).
- **WCAG 2.1 AA accessibility** baseline in both light and dark modes.
- **PWA installability** — service worker, web app manifest, standalone display mode.
- **Extensibility** — v1 has no auth, but architecture must not preclude multi-user auth in v2.
- **Maintainability** — single-developer dogfood project; prefer boring, conventional choices over clever ones.

**Scale & Complexity:**
- Primary domain: full-stack web (frontend PWA + minimal backend for sync)
- Complexity level: low feature scope, medium craft scope. ~5 UI components, 1 domain entity (Todo), 1 primary data operation set (CRUD + sync).
- Architectural components estimated: frontend SPA/PWA, sync API, persistence (local IndexedDB + server store), service worker.

### Technical Constraints & Dependencies

- **Local-first storage is a hard requirement**, not a "nice to have." All mutations write to local store synchronously.
- **No authentication in v1**, but data must be scoped to a client identifier so v2 can introduce auth without data migration pain (e.g., stable per-device/per-install ID).
- **No real-time collaboration** — sync is single-user, eventually-consistent, latest-write-wins. No CRDTs needed.
- **Web-only** for v1 — no native mobile apps. PWA is the mobile story.
- **Design system:** Tailwind CSS + Radix UI / shadcn primitives (locked in UX spec).
- **Motion budget:** 150–250ms transitions via Framer Motion or CSS (from UX spec).

### Cross-Cutting Concerns Identified

1. **Offline/online state handling** — every network-touching code path needs an offline fallback; UI surfaces a passive offline indicator.
2. **Sync reconciliation** — local writes queue when offline, replay when online. Conflict resolution policy: latest-write-wins (from UX journey 4).
3. **Optimistic UI consistency** — mutations update local state first, then kick off background persistence. Rollback on sync failure is unnecessary in single-user latest-write-wins model but must be considered.
4. **Accessibility** — semantic HTML, ARIA via Radix, keyboard operability, `prefers-reduced-motion`, contrast AA — cuts across every component.
5. **SSR safety** — UX spec requires SSR for fast first paint; state hydration and IndexedDB (client-only) need careful gating.
6. **Data identity for v2 migration** — client-scoped data model that can later be associated with a user account without schema break.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application with PWA requirements. Mobile-first responsive UI, local-first data with backend sync, SSR for fast first paint.

### Starter Options Considered

- **Next.js + shadcn (chosen)** — SSR built-in, route handlers for backend, mature PWA integrations, first-class Tailwind + shadcn support.
- **T3 Stack** — Next.js + tRPC + Prisma + NextAuth + Tailwind. Rejected: tRPC adds a typed-RPC layer we don't need for 4 CRUD endpoints; NextAuth is dead weight for v1 no-auth.
- **Remix** — Great SSR story but PWA tooling less mature; smaller shadcn-adjacent ecosystem.
- **Vite + React SPA** — Lighter but loses SSR, requires hand-assembly of routing + backend.
- **SvelteKit** — Excellent framework; rejected because shadcn-svelte is less mature than shadcn/ui (React) and UX spec committed to the latter.

### Selected Starter: Next.js App Router + shadcn/ui

**Rationale for Selection:**
Cleanest alignment with UX spec commitments (Tailwind + Radix/shadcn, SSR, PWA, optimistic UI). Single-developer maintainable. Vercel deployment is one-command. All architectural decisions already match what the UX spec locked down.

**Initialization Command:**

```bash
# 1. Scaffold Next.js with Tailwind + TypeScript
npx create-next-app@latest bmad-experiment \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --eslint \
  --import-alias "@/*"

cd bmad-experiment

# 2. Initialize shadcn/ui
npx shadcn@latest init

# 3. Add the primitives we'll need
npx shadcn@latest add toast checkbox

# 4. Add PWA layer (Serwist — modern successor to next-pwa)
npm install @serwist/next serwist

# 5. Add local-first store (Dexie for IndexedDB)
npm install dexie dexie-react-hooks

# 6. Add database + ORM for sync backend
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite

# 7. State management (minimal; Zustand for local UI state outside Dexie)
npm install zustand

# 8. Motion (match UX spec 150–250ms motion budget)
npm install framer-motion
```

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript + Node runtime for server, React 19 on client.
- **Styling:** Tailwind CSS (tokens hand-tuned per UX spec).
- **Component Primitives:** shadcn/ui (Radix-based), copied into `src/components/ui/`.
- **Build Tooling:** Next.js (Turbopack in dev, webpack/SWC for prod).
- **Testing:** Not included by starter — added in later decisions (Vitest + Playwright recommended).
- **Code Organization:** `src/` root with App Router conventions; `src/lib/` for domain logic; `src/components/` for UI.
- **Development Experience:** Fast Refresh, ESLint preconfigured, TypeScript strict mode.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**
- Data schema, client ID strategy, sync protocol, local store library.

**Important Decisions (shape architecture):**
- State management split, API style, hosting target, CI pipeline.

**Deferred Decisions (post-MVP):**
- Authentication provider (v2).
- Real-time collaboration / CRDT strategy (out of scope per PRD/UX spec).
- Analytics / telemetry (deliberately excluded to match "no notifications, no streaks" product stance).

### Data Architecture

**Domain Model (single entity):**

```ts
Todo {
  id: string           // ULID — client-generated, sortable, conflict-free
  clientId: string     // stable per-install identifier; gateway for v2 auth migration
  text: string         // user input, trimmed, non-empty
  completed: boolean
  createdAt: number    // ms since epoch
  updatedAt: number    // ms since epoch — drives last-write-wins reconciliation
  deletedAt: number | null  // soft delete; enables undo across sessions and clean sync
}
```

**Client storage:** IndexedDB via **Dexie v4** — reactive queries via `dexie-react-hooks`, migrations via Dexie versioning, indexes on `updatedAt` and `completed`.

**Server storage:** **SQLite (libSQL) via Turso** with **Prisma** as the ORM. Local dev uses a local SQLite file; prod uses Turso's managed libSQL with edge replication.

**Data validation:** **Zod** at every boundary — client input → validated before write to Dexie; server API requests → validated before write to Prisma.

**Migrations:**
- Client: Dexie version bumps, idempotent upgrade functions.
- Server: Prisma migrate (`prisma migrate`), committed to repo.

**Caching:** None server-side. Client is the cache. Service worker caches static assets (Serwist default runtime caching).

### Authentication & Security

**v1: no authentication.** Data scoped by `clientId` (ULID generated on first install, persisted in `localStorage` and embedded in every sync payload).

**Security posture:**
- HTTPS only (enforced by Vercel).
- No PII stored (todo text is considered potentially sensitive but not personally identifying).
- Server API rate-limited by `clientId` at the edge (50 req/min via Vercel Edge Middleware).
- CORS locked to the app's origin.
- Input sanitization via Zod; no HTML rendering of user content (plain text only).

**v2 migration path:** When auth is introduced, `clientId` → `userId` migration. Existing `clientId`-scoped todos are merged into the new authenticated user's account on first login.

### API & Communication Patterns

**Style:** REST-style Next.js Route Handlers. No GraphQL, no tRPC.

**Endpoints:**
- `GET  /api/sync?clientId=...&since=<ts>` — pull server changes since timestamp.
- `POST /api/sync` — push client deltas as a batch `{ clientId, todos: Todo[] }`.

**Why batched sync endpoint over granular CRUD:** the local client is the source of truth; the server is a replication target. Batch sync minimizes round trips and matches the offline-queue-replay model.

**Error handling:** Server responds with structured `{ error: { code, message } }` JSON; client treats all sync errors as transient and retries with exponential backoff (max 5 attempts, 30s cap).

**Sync conflict resolution:** Latest-write-wins by `updatedAt`. Soft-deletes win against concurrent updates (a deleted todo stays deleted).

### Frontend Architecture

**State management split:**
- **Persistent domain state:** Dexie (IndexedDB). Reactive via `useLiveQuery` from `dexie-react-hooks`.
- **Ephemeral UI state:** Zustand. Undo toast state, keyboard focus index, offline indicator, help overlay visibility.
- **No Redux, no TanStack Query, no Context overuse.** Dexie reactive queries replace what TanStack would do for client-side data.

**Component architecture:**
- `src/components/ui/` — shadcn primitives (copied in, not imported from a package).
- `src/components/` — hand-built domain components (`TodoList`, `TodoItem`, `AddTodoInput`, `UndoToast`, `EmptyState`, `OfflineIndicator`, `HelpOverlay`).
- `src/lib/` — domain logic: `db.ts` (Dexie setup), `sync.ts` (sync engine), `clientId.ts` (ID generation), `schema.ts` (Zod types).

**Routing:** Single route (`/`). App Router with `app/page.tsx` + `app/layout.tsx`. No dynamic routes in v1.

**SSR strategy:** `app/page.tsx` is a Server Component that renders the shell (empty state + mount point) for fast first paint. All interactive UI is a Client Component boundary. Dexie access is client-only and gated by `useEffect`.

**Performance:**
- No client-side data fetching on first render (SSR renders shell, client hydrates from Dexie).
- Framer Motion animations tree-shaken and lazy-loaded where possible.
- Turbopack in dev; SWC minification in prod.
- Service worker (Serwist) precaches shell + runtime-caches static assets.

**Bundle optimization:**
- shadcn components are copy-pasted (tree-shakeable by default).
- Zustand + Dexie are tiny (<10KB gz combined).
- Framer Motion imported selectively (`framer-motion/m`, `LazyMotion`).

### Infrastructure & Deployment

**Hosting:** **Vercel** for the Next.js app (frontend + route handlers). Edge functions for rate-limiting middleware.

**Database:** **Turso** (managed libSQL) for prod. Local SQLite file for dev. Schema managed via Prisma migrations.

**CI/CD:** **GitHub Actions** pipeline on every PR:
- Lint (`eslint`).
- Typecheck (`tsc --noEmit`).
- Unit tests (Vitest).
- E2E tests (Playwright, headless).
- Lighthouse CI (mobile + desktop, fails if score drops below threshold).
- axe-core accessibility scan.
- Prisma migration dry-run check.

**Environment configuration:** `.env.local` for dev, Vercel Project Env for prod/preview. Only one env var needed initially: `DATABASE_URL`.

**Monitoring:**
- Vercel Analytics (built-in, privacy-friendly, no cookies).
- Error reporting: a thin client-side error boundary that POSTs to `/api/errors` with `{ message, stack, clientId }` for server-side logging. No third-party error tracker in v1.

**Scaling:** Not a concern in v1 (single-user dogfood). Architecture is stateless at the API layer and scales horizontally on Vercel if ever needed.

### Decision Impact Analysis

**Implementation sequence (top-down):**
1. Scaffold Next.js + Tailwind + shadcn (step 3 init script).
2. Add design tokens (Tailwind config per UX spec).
3. Build Dexie schema + `clientId` generation.
4. Build domain components (`AddTodoInput`, `TodoItem`, `TodoList`) against Dexie.
5. Build `UndoToast`, `EmptyState`, `OfflineIndicator`, `HelpOverlay`.
6. Add Serwist for PWA / offline.
7. Build Prisma schema + `/api/sync` route handlers.
8. Build client-side sync engine (`src/lib/sync.ts`) with queue and backoff.
9. Wire CI pipeline.
10. Deploy to Vercel + connect Turso.

**Cross-component dependencies:**
- `clientId` generation → used by every sync call and stored alongside every todo.
- Dexie schema version → coupled to Prisma schema version; breaking changes require coordinated bumps.
- Service worker (Serwist) → must be registered after app mount; dev has it disabled to avoid cache surprises.
- Zod schemas → shared between client and server (`src/lib/schema.ts` imported on both sides).

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

Critical conflict points for AI-agent implementation: naming, structure, format, state mutation, and error handling. Every pattern below is a *rule*, not a suggestion — agents must follow them verbatim.

### Naming Patterns

**Database (Prisma):**
- Model names: PascalCase singular (`Todo`, not `Todos`).
- Field names: camelCase (`createdAt`, not `created_at`). Prisma's default; no `@map` unless legacy.
- ID fields: `id` (string, ULID).
- Timestamp fields: `createdAt`, `updatedAt`, `deletedAt` (all numeric ms-epoch, not DateTime).

**API:**
- Endpoints: lowercase, action-style for RPC-like operations (`/api/sync`), plural-noun REST only if granular CRUD is ever added.
- Route params (Next.js): bracketed (`[id]`).
- Query params: camelCase (`?since=...`, `?clientId=...`).
- Custom headers: `X-Prefixed-Pascal-Case` (e.g. `X-Client-Id`). None expected in v1.

**Code:**
- Components: PascalCase, one component per file, file name matches export: `TodoItem.tsx` → `export function TodoItem(...)`.
- Hooks: camelCase with `use` prefix: `useOnlineStatus`, `useTodos`.
- Utilities / domain functions: camelCase verb-first: `generateClientId`, `mergeTodos`.
- Types / interfaces: PascalCase, no `I` prefix: `Todo`, `SyncPayload`.
- Zustand stores: file `use<Name>Store.ts`, hook `use<Name>Store`.
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants; camelCase for local.

### Structure Patterns

**Project organization (root `src/`):**

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx            # single route: the todo list
│   ├── error.tsx           # global render error boundary
│   └── api/
│       └── sync/
│           └── route.ts    # GET + POST handlers
├── components/
│   ├── ui/                 # shadcn primitives (do not edit; regenerate via shadcn CLI)
│   ├── TodoList.tsx
│   ├── TodoItem.tsx
│   ├── AddTodoInput.tsx
│   ├── UndoToast.tsx
│   ├── EmptyState.tsx
│   ├── OfflineIndicator.tsx
│   └── HelpOverlay.tsx
├── hooks/
│   ├── useOnlineStatus.ts
│   ├── useTodos.ts
│   └── useKeyboardShortcuts.ts
├── lib/
│   ├── db.ts               # Dexie instance + schema
│   ├── sync.ts             # sync engine (queue, backoff, reconcile)
│   ├── clientId.ts         # ULID generation + localStorage persistence
│   ├── schema.ts           # Zod schemas shared client + server
│   ├── ulid.ts             # tiny ULID helper (or npm `ulid`)
│   └── errors.ts           # typed error classes + codes
├── stores/
│   └── useUIStore.ts       # Zustand: ephemeral UI state only
└── styles/
    └── globals.css         # Tailwind + design tokens
```

**Tests:**
- Unit tests co-located: `TodoItem.test.tsx` beside `TodoItem.tsx`.
- E2E tests in `e2e/*.spec.ts` at repo root, separate from `src/`.
- No `__tests__/` directories.

**Config:**
- `next.config.ts` (TypeScript), `tailwind.config.ts`, `prisma/schema.prisma`, `vitest.config.ts`, `playwright.config.ts` — all at repo root.
- Environment: `.env.local` (git-ignored), `.env.example` (committed, no secrets).

### Format Patterns

**API responses:**
- Success: direct payload. `GET /api/sync` → `{ todos: Todo[] }`. `POST /api/sync` → `{ accepted: number }`. No wrapping envelope.
- Error: consistent `{ error: { code: string, message: string } }`. HTTP status reflects category (400 bad request, 429 rate limit, 500 server).
- Content-Type: always `application/json`.

**Date/time format:**
- Numeric ms-epoch throughout (JSON, Dexie, Prisma). `Date.now()` everywhere.
- Rationale: simpler last-write-wins comparisons, no timezone ambiguity, smaller JSON.

**JSON field naming:** camelCase end-to-end. No snake_case translation layer.

**Booleans:** `true` / `false`. Never `0` / `1`, never `"true"` / `"false"` strings.

**Null handling:** `deletedAt: number | null`. Avoid `undefined` in persisted data — always explicit `null`.

### State Mutation Patterns

**Dexie (domain state):** mutate via `db.todos.put()`, `db.todos.delete()`, `db.todos.update()`. Never direct object assignment. Always touch `updatedAt` on mutation.

**Zustand (UI state):** immer-style updates via `set((state) => { state.x = y })` when using the immer middleware; plain replacement otherwise. No direct mutation of Zustand state outside `set`.

**React components:** pure functional components. No class components. No `useReducer` (Zustand + Dexie cover all state needs).

**Action naming (Zustand):**
- Verb-first, imperative: `showUndoToast`, `dismissUndoToast`, `setOfflineStatus`, `toggleHelpOverlay`.
- Side-effect-free state updates only; side effects live in hooks or in `src/lib/`.

### Error Handling Patterns

**Server (`app/api/**/route.ts`):**

```ts
try {
  const input = SyncRequestSchema.parse(await req.json());
  // ...
  return Response.json({ accepted: n });
} catch (err) {
  return errorResponse(err);
}
```

`errorResponse` maps known error classes to `{ error: { code, message } }` + HTTP status. Unknown errors become 500 with generic message (no stack trace in response).

**Client (sync engine):**
- Transient failures (network, 5xx, 429) → exponential backoff, queue preserved, no UI disturbance.
- Permanent failures (4xx other than 429) → log to `/api/errors`, drop the offending record from queue, surface nothing to user (edge case; shouldn't happen with Zod validation).

**Client (UI render errors):** `app/error.tsx` — minimal error screen with "Reload" button. No stack traces.

**User-facing error copy:** never technical. The only error the user should ever see in v1 is the implicit offline dot. No red banners, no "Something went wrong" toasts.

**Logging:**
- Server: `console.error` → Vercel log aggregation.
- Client: error boundary posts `{ message, stack, clientId, userAgent, url }` to `/api/errors`. Fire-and-forget; never block UI.

### Loading State Patterns

- **Local data (Dexie):** no loading states, ever. `useLiveQuery` returns synchronously after hydration. If it's `undefined` during SSR, render the empty shell.
- **Sync status:** represented *only* by the passive offline dot. No "Syncing…" indicator.
- **API calls from user actions:** none in v1. All actions are local-first; sync is background.

### AI Agent Guardrails

Rules future dev agents must not violate without explicit approval:

1. Never introduce a spinner for a local operation.
2. Never surface a modal confirmation for a destructive action — use the undo toast.
3. Never log user todo text to server error reports.
4. Never rename a Prisma field without a migration committed in the same PR.
5. Never edit files in `src/components/ui/` by hand — regenerate via `npx shadcn@latest add`.
6. Never import `dexie` from a Server Component file — Dexie is client-only.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bmad-experiment/
├── .env.example
├── .env.local                          # git-ignored
├── .eslintrc.json
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                      # lint, typecheck, vitest, playwright, lighthouse, axe
├── README.md
├── next.config.ts                      # Next.js + Serwist PWA config
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
│   ├── favicon.ico
│   ├── icons/                          # PWA icons (192, 512, maskable)
│   └── manifest.webmanifest
├── tailwind.config.ts                  # design tokens + color scale + type scale
├── tsconfig.json
├── vitest.config.ts
├── e2e/
│   ├── capture.spec.ts                 # journey 1: add a todo
│   ├── complete.spec.ts                # journey 2: complete
│   ├── delete-undo.spec.ts             # journey 3: delete with undo
│   ├── offline.spec.ts                 # journey 5: offline + recovery
│   └── fixtures/
│       └── test-helpers.ts
└── src/
    ├── app/
    │   ├── globals.css                 # Tailwind directives + CSS custom properties
    │   ├── layout.tsx                  # HTML shell, theme detection, service worker registration
    │   ├── page.tsx                    # Server Component shell → renders <TodoApp />
    │   ├── error.tsx                   # render error boundary
    │   ├── not-found.tsx               # minimal 404
    │   └── api/
    │       ├── sync/
    │       │   └── route.ts            # GET + POST handlers
    │       └── errors/
    │           └── route.ts            # POST client error reports
    ├── components/
    │   ├── ui/                         # shadcn primitives (regenerated via CLI)
    │   │   ├── checkbox.tsx
    │   │   └── toast.tsx
    │   ├── TodoApp.tsx                 # Client Component — top-level composition
    │   ├── TodoList.tsx
    │   ├── TodoItem.tsx
    │   ├── AddTodoInput.tsx
    │   ├── UndoToast.tsx
    │   ├── EmptyState.tsx
    │   ├── OfflineIndicator.tsx
    │   └── HelpOverlay.tsx
    ├── hooks/
    │   ├── useOnlineStatus.ts
    │   ├── useTodos.ts                 # wraps useLiveQuery for convenience
    │   └── useKeyboardShortcuts.ts
    ├── lib/
    │   ├── db.ts                       # Dexie instance + schema versions
    │   ├── sync.ts                     # sync engine: queue, debounce, backoff, reconcile
    │   ├── clientId.ts
    │   ├── schema.ts                   # Zod schemas shared client + server
    │   ├── ulid.ts
    │   ├── errors.ts
    │   └── prisma.ts                   # server-only Prisma client singleton
    ├── stores/
    │   └── useUIStore.ts               # Zustand ephemeral UI state
    └── middleware.ts                   # edge rate-limiting for /api/sync
```

### Architectural Boundaries

**API boundaries:**
- `/api/sync` — the only domain endpoint. Handles both pull (GET) and push (POST) against Prisma.
- `/api/errors` — fire-and-forget client error sink. No response body expected.

**Component boundaries:**
- **Server Components:** `app/layout.tsx`, `app/page.tsx`, `app/error.tsx`, `app/not-found.tsx`. No Dexie, no Zustand, no browser APIs.
- **Client Components:** everything in `src/components/`. Marked with `"use client"` at the top of `TodoApp.tsx` (and inherited by children via composition).
- **Data hooks (`src/hooks/`)** are the only place components touch Dexie.
- **Sync engine (`src/lib/sync.ts`)** runs in the background; it observes Dexie changes and posts deltas. Components never call sync directly.

**Data boundaries:**
- **Client:** Dexie is the sole source of truth. All reads via `useLiveQuery`; all writes via `db.todos.*` helpers exposed from `src/lib/db.ts`.
- **Server:** Prisma is the sole server-side DB access. Import only from server code (route handlers, middleware). Never from client modules.
- **Zod schemas (`src/lib/schema.ts`)** are the contract at every boundary: client writes → validated; server requests → validated; server responses → typed.

### Requirements to Structure Mapping

**PRD FRs → code locations:**
- "Create new todos" → `AddTodoInput.tsx` + `db.todos.put` in `lib/db.ts`.
- "View active and completed todos" → `TodoList.tsx` + `useTodos` hook.
- "Mark todos complete/incomplete" → `TodoItem.tsx` + `db.todos.update`.
- "Delete todos" → `TodoItem.tsx` (swipe) + `UndoToast.tsx` + `db.todos.delete`.
- "Persistent storage" → `lib/db.ts` (Dexie) + `lib/sync.ts` (server).
- "Empty / loading / error states" → `EmptyState.tsx`, `OfflineIndicator.tsx`, `app/error.tsx`.
- "Responsive design" → Tailwind config + mobile-first component styles.

**UX user journeys → tests:**
- Journey 1 (capture) → `e2e/capture.spec.ts`.
- Journey 2 (complete) → `e2e/complete.spec.ts`.
- Journey 3 (delete + undo) → `e2e/delete-undo.spec.ts`.
- Journey 4 (return session) → covered implicitly by other tests (session persistence).
- Journey 5 (network failure) → `e2e/offline.spec.ts`.

**Cross-cutting concerns → locations:**
- Offline/online state → `useOnlineStatus` hook → `OfflineIndicator` + `sync` engine.
- Sync reconciliation → `lib/sync.ts` exclusively.
- Accessibility → Radix primitives + `eslint-plugin-jsx-a11y` + axe in CI.
- SSR safety → Server/Client Component boundary at `TodoApp.tsx`.

### Integration Points

**Internal communication:**
- Components ↔ Dexie: via `useLiveQuery` (reactive) or direct `db.todos.*` calls for mutations.
- Dexie ↔ Sync engine: sync subscribes to Dexie hooks (`creating`, `updating`, `deleting`) to enqueue deltas.
- Sync engine ↔ Server: HTTP to `/api/sync` with `clientId` + deltas.
- Components ↔ Zustand: via `useUIStore()` hook.

**External integrations:**
- Turso (via Prisma libSQL driver) — server-side only.
- Vercel Analytics — injected via `<Analytics />` in `app/layout.tsx`.
- No third-party SaaS in v1.

**Data flow (mutate a todo):**
```
User action in TodoItem
  → call to db.todos.update() (src/lib/db.ts)
  → Dexie writes locally + fires 'updating' hook
  → useLiveQuery re-renders TodoList with new state
  → sync engine's Dexie hook observer enqueues delta
  → sync engine debounces, POSTs /api/sync
  → route handler validates (Zod), upserts via Prisma
  → Prisma → Turso
```

### File Organization Patterns

**Configuration files:** all at repo root. No nested config directories.

**Source organization:**
- `app/` = routes + API handlers only.
- `components/` = presentation only (no data fetching beyond hooks).
- `hooks/` = React hooks that bridge data layer → components.
- `lib/` = framework-agnostic domain logic.
- `stores/` = Zustand stores (UI state only).

**Test organization:**
- Unit tests co-located with source (`Foo.test.tsx` next to `Foo.tsx`).
- E2E tests in top-level `e2e/` directory.
- No separate `tests/` directory in `src/`.

**Asset organization:**
- `public/icons/` — PWA icons (192, 512, maskable variants).
- `public/manifest.webmanifest` — PWA manifest (referenced from `app/layout.tsx`).
- No image assets beyond icons (app is type-driven).

### Development Workflow Integration

**Development server:**
- `npm run dev` → Next.js on `http://localhost:3000`.
- Service worker disabled in dev (Serwist config) to avoid cache surprises.
- Prisma generate runs on postinstall; `prisma migrate dev` on schema change.

**Build process:**
- `npm run build` → Next.js production build + Serwist service worker generation.
- Output in `.next/` (not committed).

**Deployment:**
- Push to main → Vercel auto-deploys.
- PRs get preview deployments automatically.
- `DATABASE_URL` configured per environment in Vercel project settings.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** Stack is internally consistent. Next.js + TypeScript + Tailwind + shadcn + Serwist + Dexie + Prisma + Turso — all actively maintained, all commonly paired. No version conflicts.

**Pattern Consistency:** Naming, structure, and format rules align with Next.js App Router and Prisma conventions. No fighting the framework.

**Structure Alignment:** Directory layout cleanly separates server (`app/api/`, `lib/prisma.ts`), client (`components/`, `hooks/`, `stores/`), and shared domain (`lib/schema.ts`, `lib/errors.ts`). Import boundaries match the Server/Client Component split.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (PRD):**
- Create / view / complete / delete todos → mapped to `AddTodoInput`, `TodoList`, `TodoItem`, `UndoToast` + `lib/db.ts`. ✅
- Persistent storage → Dexie (client) + Prisma/Turso (server), synced via `lib/sync.ts`. ✅
- Responsive design → Tailwind mobile-first config + component styles. ✅
- Error handling → `app/error.tsx` (render errors), sync engine backoff (network), `api/errors` endpoint (client error reports). ✅
- Empty / loading / error states → `EmptyState.tsx`, `OfflineIndicator.tsx`, `app/error.tsx`. "Loading" is deliberately absent by architectural intent (local-first). ✅

**Non-Functional Requirements Coverage:**
- Instantaneous perceived interaction → optimistic local-first writes via Dexie; no network-blocked UI paths. ✅
- Offline-first → Dexie + Serwist service worker + sync queue with backoff. ✅
- Cross-device persistence → `clientId`-scoped server sync via `/api/sync`. ✅
- WCAG 2.1 AA → Radix primitives + `eslint-plugin-jsx-a11y` + axe in CI. ✅
- PWA installability → Serwist + web app manifest + standalone display mode. ✅
- v2 auth extensibility → `clientId` field on every todo; maps to `userId` in a future migration. ✅
- Maintainability (single-dev) → boring conventional stack, minimal dependencies. ✅

**UX Spec Coverage:**
- 5 user journeys all have mapped test files in `e2e/`. ✅
- Motion budget (150–250ms) enforceable via Framer Motion presets in tokens. ✅
- Dark mode + light mode parity → Tailwind dark variant + CSS custom properties. ✅

### Implementation Readiness Validation ✅

**Decision Completeness:** Every critical decision (data, storage, sync, API style, hosting, CI) is documented with specific technology choices. Versions use `@latest` in install commands to resolve at install time.

**Structure Completeness:** Full file tree specified down to route handlers, hooks, and test locations. No "TBD" directories.

**Pattern Completeness:** Naming, structure, format, state mutation, and error handling rules cover every AI-agent decision surface. 6 explicit guardrails list what agents must never do.

### Gap Analysis Results

**Critical gaps:** None.

**Important gaps (addressed below):**

1. **Rate limiting is over-specified for v1.** The decisions section mentioned "50 req/min edge rate limiting via Vercel Edge Middleware" but this requires Upstash Redis or equivalent persistent state on Vercel Edge. For a single-user dogfood product, this is premature. **Resolution:** drop hard rate-limiting for v1; rely on Vercel's built-in DDoS protection + `clientId` in logs for observability. Revisit when the product opens to public or adds auth.
2. **Component-level error boundary.** `app/error.tsx` catches only route-level render errors. A runtime error inside `TodoApp.tsx` won't be caught by it cleanly. **Resolution:** add a React Error Boundary around `TodoApp` children that renders a minimal fallback and reports to `/api/errors`.

**Minor gaps (clarified or deferred):**

3. **Initial full sync on new device.** Covered by the existing `GET /api/sync?since=0` pattern but not called out explicitly. **Resolution:** note in the sync engine spec that `since=0` triggers a full pull; no new code needed.
4. **PWA icon generation tooling.** **Resolution:** use `pwa-asset-generator` as a one-time dev dependency to generate from a source SVG; not architectural. Add as a README note.
5. **Testing coverage expectations.** **Resolution:** test `lib/` (pure logic) thoroughly; test components with Testing Library where interactions matter; E2E covers journeys.
6. **v2 auth migration mechanics.** **Resolution:** deferred — out of v1 scope.

### Validation Issues Addressed

**Resolved in this document:**
- Rate limiting removed from v1 scope (see Decision Updates below).
- Component error boundary added to `TodoApp.tsx` responsibility.
- Full-sync-on-first-device behavior clarified.

**Deferred to v2:**
- Auth provider selection and `clientId` → `userId` migration mechanics.
- Third-party error tracking (Sentry, Datadog, etc.).
- Analytics beyond Vercel's built-in.

### Decision Updates Applied

**Authentication & Security — v1 rate-limiting clarification:**
Supersedes prior "50 req/min edge rate limiting": **No hard rate limiting in v1. Vercel's built-in DDoS protection is sufficient for a single-user dogfood deployment. Revisit when the product gains multiple users or opens to public sign-up.**

**Frontend Architecture — component error boundary:**
Addendum: **`TodoApp.tsx` wraps its children in a React Error Boundary that renders a minimal "Something isn't rendering — reload the page" fallback and POSTs the error to `/api/errors`. This catches component-level render errors that escape Next.js's route-level `error.tsx`.**

**Sync Engine — initial device onboarding:**
Addendum: **On first run (no `lastSyncAt` stored), client pulls full server state via `GET /api/sync?since=0`. Subsequent pulls use `since=lastSyncAt`. Full sync is indistinguishable from incremental sync at the API level.**

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with technology choices
- [x] Starter template and init command specified
- [x] Data, auth, API, frontend, infrastructure all covered
- [x] Deferred decisions explicitly noted

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Format patterns specified
- [x] Error handling patterns documented
- [x] AI agent guardrails enumerated

**✅ Project Structure**
- [x] Complete file tree specified
- [x] Architectural boundaries defined
- [x] Requirements mapped to locations
- [x] Integration points documented

**✅ Validation**
- [x] Coherence checked
- [x] Requirements coverage verified
- [x] Gaps identified and resolved or explicitly deferred

### Ready for Implementation

This architecture is sufficient for AI dev agents to implement the product consistently. All ambiguity around naming, structure, and inter-module contracts is resolved. Remaining uncertainty (v2 auth, scaling) is explicitly deferred.
