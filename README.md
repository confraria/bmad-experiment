# bmad-experiment

![CI](https://github.com/confraria/bmad-experiment/actions/workflows/ci.yml/badge.svg)

A small, offline-first, keyboard-friendly personal todo app. One screen, no accounts, no categories, no deadlines. Built end-to-end using the [BMad Method](https://github.com/bmad-code-org/bmad-method) workflow for AI-assisted development.

The app itself is intentionally modest — the interesting artifact is the workflow that produced it.

## What's in the app

- **Local-first storage.** Dexie (IndexedDB) holds the source of truth on the client; every write is instant.
- **Background sync.** Optimistic writes queue to a libSQL/Turso backend via `/api/sync`. Offline is a first-class state, not an error.
- **Offline/online awareness.** `useOnlineStatus` drives a subtle corner dot — no banner, no modal.
- **Installable PWA.** Service worker via Serwist precaches the shell; icons generated from a single SVG source.
- **Swipe-to-delete with undo.** Mobile swipe deletes; a 5s toast offers undo. Desktop uses `Cmd/Ctrl+Backspace` + `Cmd/Ctrl+Z` for the same flow.
- **Keyboard shortcuts on desktop.** `j`/`k` navigate rows, `n` focuses the input, `?` pops a help overlay listing every shortcut. Gated to ≥1024px via `matchMedia`.
- **Two-zone list.** Active todos up top, completed below, visually distinct but in the same `<ul>` chain.
- **Error boundaries.** Global + component-level fallbacks; unhandled client errors POST to `/api/errors` fire-and-forget.

## Stack

- **Next.js 16** (App Router, React 19, webpack build)
- **TypeScript** strict mode
- **Tailwind CSS v4** (CSS-first config — tokens live in `globals.css @theme`)
- **Radix UI** primitives (dialog, checkbox) + **shadcn** scaffolds in `src/components/ui/`
- **Dexie** for IndexedDB persistence; **Zustand** for ephemeral UI state
- **Prisma 7** + **libSQL/Turso** server-side
- **Vitest** + **Playwright** for test coverage
- **Serwist** for PWA

## Layout

```
src/
├── app/            # App Router: page.tsx, layout.tsx, api/sync, api/errors
├── components/     # TodoList, TodoItem, AddTodoInput, UndoToast, HelpOverlay, ...
├── hooks/          # useKeyboardShortcuts, useOnlineStatus, useSync, useTodos
├── lib/            # db.ts (Dexie), sync.ts, schema.ts, clientId.ts, ulid.ts
└── stores/         # useUIStore (Zustand — undo toast, help overlay)

e2e/                # Playwright specs (desktop + mobile projects)
_bmad/              # BMad Method module installs
_bmad-output/       # PRD, architecture, UX spec, epics, per-story context files
prisma/             # Schema + migrations
```

## Scripts

```bash
npm run dev          # Next dev server
npm run build        # Production build (webpack)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright (desktop + mobile projects)
npm run lint         # ESLint
npm run icons        # Regenerate PWA icons from SVG
```

## The BMad Method side of things

This project was built as an experiment in using BMad as the planning + execution loop. The flow for every feature:

1. **Planning artifacts** (`_bmad-output/planning-artifacts/`) — PRD, architecture, UX spec, and an epics file were authored up front. These are the stable inputs.
2. **Per-story context files** (`_bmad-output/implementation-artifacts/`) — for each story, `bmad-create-story` drafts a comprehensive spec with ACs, task breakdown, dev notes, anchor references to the planning docs, and rationale for non-obvious decisions.
3. **Implementation** — `bmad-dev-story` reads the story file and implements it red-green-refactor, writing tests first, updating the story file's Dev Agent Record as it goes.
4. **Close-out** — status flips `ready-for-dev → in-progress → done` in `sprint-status.yaml`; a single commit per story lands on `main`.

The four epics that shipped:

| Epic | Theme | Stories |
|---|---|---|
| 1 — Capture | Get a todo into the app | scaffold, Dexie store, add input, live list, empty state, error boundaries |
| 2 — Manage | Mark and remove todos | tap/Space to complete, swipe-to-delete, undo toast, two-zone layout |
| 3 — Trust | Persist and sync reliably | Prisma/Turso, `/api/sync` pull + push, sync engine, offline indicator, PWA, `/api/errors` |
| 4 — Power use | Keyboard-first on desktop | shortcuts hook, help overlay |

Two stories (`3-8-ci-pipeline`, `3-9-vercel-deployment-wiring`) are explicitly marked `dropped` in `sprint-status.yaml` — deliberate scope cuts, not forgotten work.

The per-story context files are the most useful thing to read if you want to see how BMad frames an LLM implementation brief — every task is paired with AC references, every non-obvious choice carries a "why" section, and every file expected-to-change is enumerated ahead of implementation.

## License

Private / experimental. No license granted.
