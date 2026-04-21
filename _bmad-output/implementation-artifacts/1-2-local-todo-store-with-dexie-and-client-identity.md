# Story 1.2: Local Todo Store with Dexie and Client Identity

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a typed local IndexedDB store with client identity, ULID generation, and Zod schemas,
so that todos can be persisted locally and the data layer is ready for sync in Epic 3.

## Acceptance Criteria

1. **ClientId generated once and persisted.** Given a fresh install, when the app first mounts, then a ULID-based `clientId` is generated once and persisted in `localStorage`, and subsequent mounts reuse it.

2. **Dexie schema persists and validates Todos.** Given the Dexie schema defined in `src/lib/db.ts`, when a Todo is written via `db.todos.put(todo)`, then it persists across page refresh, tab close, and browser restart, and all fields match the Zod `TodoSchema` defined in `src/lib/schema.ts`.

3. **Mutation helpers enforce invariants.** Given the domain helpers exposed from `src/lib/db.ts`, when any mutation occurs, then `updatedAt` is set to `Date.now()` and `id` (if absent) is generated as a new ULID.

## Tasks / Subtasks

- [x] **Task 1 — Install dependencies and wire up Vitest** (AC: all — test harness prerequisite)
  - [x] Runtime deps: `npm install dexie dexie-react-hooks zod ulid`
  - [x] Dev deps: `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom @testing-library/user-event jsdom fake-indexeddb`
  - [x] Create `vitest.config.ts` at repo root with `jsdom` environment, `@vitejs/plugin-react`, `globals: true`, and `setupFiles: ['./vitest.setup.ts']`
  - [x] Create `vitest.setup.ts` that imports `fake-indexeddb/auto` (loaded before each test) so Dexie runs headlessly under jsdom
  - [x] Add npm scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`
  - [x] Update `tsconfig.json` only if needed so `vitest/globals` types are picked up (`"types": ["vitest/globals"]` under `compilerOptions`) — verify with a smoke test

- [x] **Task 2 — Implement ULID helper** (AC: #1, #3 — underpins both clientId and Todo.id)
  - [x] Create `src/lib/ulid.ts` that wraps the npm `ulid` package's `monotonicFactory` so consecutive calls within the same ms produce strictly-increasing values (matches test-design scenario "ULID generation is monotonic and unique")
  - [x] Export a `newUlid(): string` function
  - [x] Test-mode determinism: when `process.env.NODE_ENV === 'test'`, allow injection of a deterministic PRNG via a `__setUlidPrng(fn)` hook (NOT exported from the barrel for production builds). This satisfies test-design hook #5.
  - [x] Do NOT add custom encoding — use the upstream lib's 26-char Crockford base32 output

- [x] **Task 3 — Implement Zod schemas** (AC: #2)
  - [x] Create `src/lib/schema.ts`
  - [x] Define `TodoSchema` using Zod 3.x with fields matching the architecture data model exactly:
    - `id: z.string().length(26)` (ULID)
    - `clientId: z.string().length(26)` (ULID)
    - `text: z.string().trim().min(1).max(1000)` — non-empty after trim
    - `completed: z.boolean()`
    - `createdAt: z.number().int().nonnegative()` (ms-epoch)
    - `updatedAt: z.number().int().nonnegative()` (ms-epoch)
    - `deletedAt: z.number().int().nonnegative().nullable()` — explicit `null`, never `undefined`
  - [x] Export `type Todo = z.infer<typeof TodoSchema>`
  - [x] Define `NewTodoInputSchema` (text only) for user-facing validation: `z.object({ text: z.string().trim().min(1).max(1000) })`
  - [x] Do NOT define `SyncRequestSchema` here — that belongs to Story 3.2/3.3

- [x] **Task 4 — Implement clientId module** (AC: #1)
  - [x] Create `src/lib/clientId.ts`
  - [x] Storage key: `bmad-experiment:clientId`
  - [x] Export `getClientId(): string` — idempotent, SSR-safe: if `typeof window === 'undefined'`, throw with a message that directs the caller to a client-only boundary (prevents accidental Server Component imports)
  - [x] Behavior: read from localStorage; if absent, generate via `newUlid()` and write back; cache in module scope so repeated calls don't hit localStorage
  - [x] Handle localStorage quota/permission errors: catch, log to console (do NOT log the clientId), fall back to an in-memory session-only ULID so the app stays functional in private-browsing with storage blocked
  - [x] Test hook: when `process.env.NODE_ENV === 'test'`, expose `window.__clientId` as a writable setter that overrides cached value and storage (test-design hook #1). Provide a `resetClientIdForTests()` that clears module cache and localStorage.
  - [x] Do NOT trigger clientId generation on module import — only on first `getClientId()` call; this keeps the module side-effect-free and SSR-safe.

- [x] **Task 5 — Implement Dexie database module** (AC: #2, #3)
  - [x] Create `src/lib/db.ts`
  - [x] Define a Dexie subclass `BmadDatabase` with a single `todos: Table<Todo, string>` store
  - [x] Schema version 1: `'id, clientId, updatedAt, completed, deletedAt'`
  - [x] Lazy-initialized singleton: export a `getDb(): BmadDatabase` that constructs the Dexie instance on first call; throw if `typeof window === 'undefined'`
  - [x] Mutation helpers (all exported, all bump `updatedAt` to `Date.now()`): `putTodo`, `updateTodo`, `softDeleteTodo`
  - [x] Test hook: export `resetDbForTests(): Promise<void>` that closes the Dexie connection and deletes the IndexedDB database (test-design hook #4). Guard behind `process.env.NODE_ENV === 'test'`.
  - [x] Do NOT export raw `db.todos` — callers write only through helpers so the `updatedAt` invariant cannot be skipped

- [x] **Task 6 — Write Vitest unit tests for src/lib** (AC: all)
  - [x] `src/lib/__tests__/ulid.test.ts` — 5 tests (26-char output, Crockford alphabet, 1000-unique, monotonic, `__setUlidPrng` determinism)
  - [x] `src/lib/__tests__/schema.test.ts` — 17 tests covering TodoSchema and NewTodoInputSchema
  - [x] `src/lib/__tests__/clientId.test.ts` — 8 tests (generate+persist, idempotency, reset, preseed reuse, override, quota fallback, no-id-in-log, SSR guard)
  - [x] `src/lib/__tests__/db.test.ts` — 10 tests (round-trip, shape, updatedAt bump, missing-id, soft-delete, reset, schema validation before IDB, v1 close+reopen, patch validation)
  - [x] Target: `src/lib/` line coverage ≥ 85% per quality gate — achieved **92.53%**

- [x] **Task 7 — Verify, document, and commit** (AC: all)
  - [x] `npm test` → 40/40 pass
  - [x] `npm run test:coverage` → `src/lib/` lines 92.53%
  - [x] `npm run lint` → clean
  - [x] `npx next build` → production build green
  - [x] Update the `File List` section of this story with every created/modified file
  - [ ] Commit with message `feat(data): local Dexie store with client identity (Story 1.2)` — deferred to user

## Dev Notes

### Architecture references (load into context before writing code)

- **Data model (authoritative):** `_bmad-output/planning-artifacts/architecture.md` → "Core Architectural Decisions → Data & Persistence". Todo fields and types are LOCKED — do not invent additional fields, do not rename, do not change types.
- **Naming conventions:** same doc, "Implementation Patterns & Consistency Rules". Summary: PascalCase singular models (`Todo`), camelCase fields (`createdAt`), numeric ms-epoch timestamps (not `Date` objects, not ISO strings).
- **Project structure:** same doc, "Project Structure & Boundaries". `src/lib/` is for shared domain logic imported by both client components and server route handlers (though Dexie itself is strictly client-only per Guardrail #6).
- **Test design:** `_bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md` → unit scenarios table. Every P0/P1 scenario for `src/lib/` maps to a subtask in Task 6 above.

### Todo entity shape (copy verbatim into `schema.ts`)

```ts
{
  id: string            // 26-char ULID (Crockford base32)
  clientId: string      // 26-char ULID, stable per install
  text: string          // user input; trimmed non-empty; max 1000 chars
  completed: boolean
  createdAt: number     // ms since epoch; set once at creation
  updatedAt: number     // ms since epoch; bumped on EVERY mutation
  deletedAt: number | null   // null = live; number = soft-deleted at that ms
}
```

### Dexie v4 schema string

Version 1 schema for the `todos` table:

```ts
db.version(1).stores({
  todos: 'id, clientId, updatedAt, completed, deletedAt',
});
```

- `id` is the primary key.
- Secondary indexes on `clientId`, `updatedAt`, `completed`, `deletedAt` support the queries Epic 3's sync engine will run (`where('updatedAt').above(lastSyncAt)`) and Story 1.4's live list (`where('completed').equals(0).and(t => t.deletedAt === null)` — note: Dexie can't index `null`, so filter soft-deleted in a `.filter()` step or flip the schema to `deletedAt` being 0-or-number; keep `null` per architecture and accept the in-memory filter — the table will never be large).

### SSR safety (Architecture Guardrail #6)

- `src/lib/db.ts` and `src/lib/clientId.ts` are CLIENT-ONLY. Do not put `"use server"` at the top.
- Callers must ensure they run under a `"use client"` boundary OR inside `useEffect`. Story 1.4 will add a `useTodos` hook wrapping `useLiveQuery`; this story only provides the primitives.
- Guard strategy in this story:
  - `getClientId()` and `getDb()` both **throw** if `typeof window === 'undefined'`. Fail loud during SSR development rather than silently returning a stale value.
  - Dexie construction is lazy (inside `getDb()`) so merely importing `db.ts` in a Server Component during a misconfigured refactor doesn't instantly fail the build — only actually calling the helper does.
  - `clientId` generation is lazy — module import has no side effects.

### Numeric timestamps — zero exceptions

Architecture mandates numeric ms-epoch throughout (JSON, Dexie, Prisma). Always `Date.now()`. Never `new Date()`, never `.toISOString()`, never Dayjs/date-fns for persistence layer values. This story does not need to render dates — only store them.

### Storage keys and reserved globals

- localStorage key for clientId: `bmad-experiment:clientId` (prefix required; flat keys forbidden — prevents future-app collisions).
- Test-only globals on `window`: `__clientId` (setter), plus whatever later stories add. Use snake_case-like `__prefixed` names to signal test-only.

### Dependencies to install in this story — and NOT to install

- **Install now:** `dexie`, `dexie-react-hooks`, `zod`, `ulid`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb`.
- **Do NOT install** (architecture defers these to explicit stories): `zustand` (→ 2.3), `framer-motion` (→ Epic 2), `prisma`/`@prisma/client`/`@libsql/client` (→ 3.1), `@serwist/next`/`serwist` (→ 3.6), Playwright (→ later in Epic 1/2). Adding any of these now violates scope and will be rejected in code review.
- `fake-indexeddb` is not in the original Dev Notes dependency list in Story 1.1 but is the standard way to test Dexie under jsdom (Dexie v4 works out of the box with it). Listed in test-design test tooling implicitly via "Vitest — Unit" scope.

### Library & version notes (as of 2026-04)

- **Dexie v4.x** — current stable. API shape identical to v3 for the subset used here (`version().stores()`, `Table.put/get/update/delete`, `where().above()`). v4 added `liveQuery` export but continue to use `useLiveQuery` from `dexie-react-hooks` for React wrapping (that lands in Story 1.4, not here).
- **`dexie-react-hooks` v1.1.x** — compatible with React 19. Not consumed in this story, but install it now so Story 1.4 doesn't add churn to this commit's diff.
- **`zod` v3.x** — 4.x is not stable yet (avoid). `.nullable()` behavior and `z.infer` shape stable on 3.x.
- **`ulid` v2.x** — exposes `ulid()` (random) and `monotonicFactory()` (strictly increasing). Use `monotonicFactory()` to satisfy the monotonic-uniqueness test. Package is ~1KB gz and uses `crypto.getRandomValues` in browsers by default (>=v2.0).
- **Vitest v2.x** — current stable; Vite v6-compatible. `@vitejs/plugin-react` v4.x.
- **React 19** — strict mode double-renders `useEffect` in dev. This story exposes primitives only (no hooks yet), so not directly impacted — but `clientId`/`db` modules must be idempotent so later hooks can call them safely twice.

### Tailwind v4 / Story 1.1 continuity (NOT directly in scope, but don't regress)

- Story 1.1 landed a CSS-first Tailwind v4 setup. This story should not touch `globals.css` or `tailwind.config.ts` (the latter does not exist by design). If any file here tries to import Tailwind utilities, it shouldn't — `src/lib/` is pure TS, no CSS.
- Story 1.1 committed a minimal `<main>` placeholder in `app/page.tsx`. This story does not render anything — UI composition starts in Story 1.3.

### Architectural Guardrails (MUST follow)

From `architecture.md` → "AI Agent Guardrails":

1. Never introduce a spinner for a local operation. *(N/A — no UI in this story; carry forward for 1.4.)*
2. Never surface a modal confirmation for a destructive action. *(N/A this story.)*
3. Never log user todo text to server error reports. *(Relevant: `clientId.ts` quota fallback logs must not log `text` or secrets. Only a redacted code path, e.g., `console.warn('clientId: localStorage unavailable, using session ULID')`.)*
4. Never rename a Prisma field without a migration. *(N/A — Prisma lands in 3.1.)*
5. Never edit files in `src/components/ui/` by hand. *(N/A — no UI changes.)*
6. **Never import `dexie` from a Server Component file.** *(CORE to this story.)*

### What "done" looks like for the Dev Agent Record

- Every P0 scenario in test-design's Vitest Unit table that maps to this story has a matching test in `src/lib/__tests__/`. P1 scenarios covered or explicitly deferred with rationale.
- `npm run test:coverage` output shows `src/lib/` ≥ 85% lines — paste the output line into Debug Log References.
- No `dexie` import appears in any file in `src/app/` (grep check: `grep -r "from 'dexie'" src/app` returns empty).
- `next build` passes — proves no accidental server-side IndexedDB usage.
- Git diff contains only: `src/lib/**`, `vitest.config.ts`, `vitest.setup.ts`, `package.json`, `package-lock.json`, this story file, and `sprint-status.yaml`.

### Project Structure Notes

- Target files align with architecture's `src/lib/` inventory: `db.ts`, `clientId.ts`, `schema.ts`, `ulid.ts`.
- `errors.ts` is listed in architecture's file tree but is NOT in scope for this story — typed error classes land when the sync engine needs them (Story 3.4). Do not create `errors.ts` here.
- Tests live under `src/lib/__tests__/` (colocated per Vitest convention). No separate top-level `tests/` folder.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Local todo store with Dexie and client identity] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions → Data & Persistence] — Todo entity shape, Dexie v4, Zod, indexes
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming, numeric timestamps, mutation patterns (`db.todos.put`, always bump `updatedAt`), null handling
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] — `src/lib/` inventory; Server vs Client Component boundaries; Guardrail #6
- [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions → Security & Identity] — clientId ULID + localStorage; v2 migration path
- [Source: _bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md#Vitest — Unit (src/lib/)] — Unit test scenario table
- [Source: _bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md#Testability Hooks to Ship] — `window.__clientId`, IDB reset helper, deterministic ULID seed
- [Source: _bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md#Quality Gates] — `src/lib/` ≥ 85% line coverage

### Previous Story Intelligence

Story 1.1 (`1-1-project-scaffold-and-design-tokens.md`, status: review) established these patterns that this story must respect:

1. **Tailwind v4 is CSS-first.** Tokens live in `src/app/globals.css` under `@theme`. No `tailwind.config.ts` exists. *Impact on 1.2: none directly, but don't accidentally generate a Tailwind config file when adding Vitest — the `vitest.config.ts` is a separate file and must not reference Tailwind.*
2. **Next.js 16.2.4 + React 19 + TypeScript strict mode.** TypeScript `strict: true` in `tsconfig.json`. Zod schemas must not use `.optional()` for fields the architecture specifies as required; use `.nullable()` for `deletedAt` instead.
3. **shadcn uses `radix-nova` preset, with `src/lib/utils.ts` already present (exports `cn()`).** Do not overwrite `src/lib/utils.ts`. Create new files: `db.ts`, `clientId.ts`, `schema.ts`, `ulid.ts`.
4. **Package name:** `bmad-experiment` (fixed in 1.1 from the auto-generated `bmad-scaffold-tmp`). Use this in any storage-key prefix (e.g., `bmad-experiment:clientId`).
5. **No fonts configured via `next/font`.** System stack only. Not relevant here.
6. **Pattern for test verification in this repo:** `playwright-cli` skill is installed. For this story's test suite (Vitest-only, no E2E yet), stick to `npm test` output. `playwright-cli` becomes relevant starting Story 1.3 (UI interactions).
7. **Scaffold generated `public/*.svg`** files are untouched; leave them alone.
8. **Production build works (`npx next build`).** Any regression of the build (especially from accidentally importing Dexie in `app/page.tsx` or `app/layout.tsx`) is a blocker.

### Git Intelligence

Current branch `main`. Last commits (most → least recent):

- `c559c8b chore: add playwright-cli skill for UI verification`
- `c0c88fa feat(scaffold): init project with design tokens (Story 1.1)` — the scaffold + tokens commit
- `94e64c1 chore: setup project with bmad`

Commit message conventions observed:
- Conventional commits (`feat(scope):`, `chore:`).
- Scope names used so far: `scaffold`. Story 1.2 commit should use scope `data` (reflects the domain — data layer / persistence).
- Body explains the "why" and any deviations.
- Every AI-authored commit includes `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Follow the same trailer for consistency.

### Latest Tech Information

- Dexie v4 is stable and supports React 19 peer via `dexie-react-hooks` v1.1+. No migration from v3 concerns (greenfield).
- `ulid` package v2+ uses Web Crypto in browsers; works in Node via `node:crypto`. No polyfill needed.
- Zod 3.x is the target; Zod 4 is alpha and should be avoided for production code in April 2026.
- Vitest v2.x is stable with Vite v6; v3 is in beta — avoid.
- `fake-indexeddb` v6.x works with Dexie v4 out of the box when imported via `fake-indexeddb/auto`.

### Project Context Reference

No `project-context.md` exists in this repo. Planning artifacts (PRD, architecture, UX spec, epics, test design) are the context source. If `project-context.md` appears later, subsequent stories should respect it.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via Claude Code (`claude-opus-4-7[1m]`).

### Debug Log References

Final coverage output (`npm run test:coverage`):

```
 % Coverage report from v8
-------------|---------|----------|---------|---------|-------------------
File         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------|---------|----------|---------|---------|-------------------
All files    |    91.3 |    85.29 |   91.66 |   92.53 |
 clientId.ts |   94.11 |     87.5 |     100 |   96.87 | 50
 db.ts       |    92.3 |     87.5 |     100 |    92.3 | 23,75
 ulid.ts     |   83.33 |       50 |     100 |   83.33 | 14
 utils.ts    |       0 |      100 |       0 |       0 | 5
-------------|---------|----------|---------|---------|-------------------
```

`utils.ts` (the Story 1.1 `cn()` helper) is unchanged by this story and out of scope for the 85% gate — the aggregate `src/lib/` line coverage is 92.53%, clearing the gate.

Full test suite: **40/40 passed** across 4 files (ulid, schema, clientId, db).

Next build: `next build` compiled and prerendered successfully; no Dexie import leaked into server-component routes (verified via `grep "from 'dexie'" src/app` — empty).

Jsdom/fake-indexeddb quirks encountered:

- `vi.spyOn(window.localStorage, 'setItem')` initially did **not** intercept calls in jsdom — the real method on `Storage.prototype` was being invoked. Fixed by spying on `Storage.prototype.setItem` directly.
- Dexie's `.close()` on a cached singleton leaves the instance unusable for subsequent `getDb()` calls within the same test. The schema-v1 round-trip test works around this by constructing a fresh `new BmadDatabase()` instance (IndexedDB data persists across instances).
- `window.localStorage.clear()` in `beforeEach` is required in addition to `resetClientIdForTests()` to fully isolate tests — jsdom's localStorage is not reset between tests by default.

### Completion Notes List

**Versions resolved (as of 2026-04-21):**

- `dexie@4.4.2`, `dexie-react-hooks@4.4.0` (hooks major version is now aligned with Dexie 4.x, not `1.1.x` as the story's "Latest Tech Information" anticipated — not consumed in this story, so no behavioral impact).
- `zod@3.25.76` — initially installed `@latest` which resolved to `zod@4.3.6` (Zod 4 shipped stable since the story was written); downgraded to `^3` per the story's explicit mandate, since Zod 4 has breaking changes in error formatting and some validators. Schemas here use only `length/min/max/int/nonnegative/nullable/trim` + `z.infer` — stable across 3.x and 4.x, but 3.x is what the story documents against.
- `ulid@3.0.2` — story spec'd `v2.x` (for `monotonicFactory` + browser `crypto.getRandomValues`). Verified v3 still exports `monotonicFactory`; API-compatible with the subset this story uses, so kept on v3.
- `vitest@4.1.5`, `@vitejs/plugin-react@6.0.1`, `@vitest/coverage-v8@4.1.5`, `jsdom@29.0.2`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `@testing-library/user-event@14.6.1`, `fake-indexeddb@6.2.5`.

**Additional dev dep beyond the story's list:** `@vitest/coverage-v8` — required by Vitest 4 to enable the `--coverage` flag the story's `test:coverage` script depends on. Same justification as `fake-indexeddb` (the story's Dev Notes explicitly allowed adding `fake-indexeddb` though it wasn't in Story 1.1's list because it's the standard way to test Dexie).

**Deviations from story task 6 scope:** added two small tests beyond the listed scenarios to raise coverage past the gate — `__setUlidPrng` determinism (covers test-design hook #5 explicitly) and a `getClientId()` SSR-guard assertion. Neither changes behavior.

**SSR guards verified:** `getClientId()` and `getDb()` both throw synchronously when `typeof window === 'undefined'`, with messages pointing the caller at a `"use client"` boundary. No such throw was hit during `next build`'s static prerender — confirming nothing in `app/` imports these modules (see Guardrail #6).

**ESLint:** fixed one pre-existing warning where `coverage/**` was being linted; added it to `globalIgnores` in `eslint.config.mjs`.

**Not touched (scope discipline):** `src/app/**`, `src/components/**`, `src/lib/utils.ts`, `src/app/globals.css`, `public/*`. No Tailwind changes, no UI surface.

### File List

**Created:**
- `src/lib/ulid.ts`
- `src/lib/schema.ts`
- `src/lib/clientId.ts`
- `src/lib/db.ts`
- `src/lib/__tests__/ulid.test.ts`
- `src/lib/__tests__/schema.test.ts`
- `src/lib/__tests__/clientId.test.ts`
- `src/lib/__tests__/db.test.ts`
- `vitest.config.ts`
- `vitest.setup.ts`

**Modified:**
- `package.json` (deps + test scripts)
- `package-lock.json` (dep resolution)
- `tsconfig.json` (added `"types": ["vitest/globals"]`)
- `eslint.config.mjs` (ignore `coverage/**`)
- `_bmad-output/implementation-artifacts/1-2-local-todo-store-with-dexie-and-client-identity.md` (this story)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status transition)

### Change Log

- 2026-04-21 — Story 1.2 implemented: local Dexie store (v1 schema), Zod schemas for Todo/NewTodoInput, ULID helper with monotonic factory and test-mode PRNG hook, clientId module with localStorage persistence + quota fallback + SSR guard. Vitest harness wired with jsdom + fake-indexeddb; 40 unit tests; `src/lib/` line coverage 92.53%. No UI changes.
