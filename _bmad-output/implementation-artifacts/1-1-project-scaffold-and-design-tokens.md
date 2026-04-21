# Story 1.1: Project Scaffold and Design Tokens

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the project scaffolded with Next.js + TypeScript + Tailwind + shadcn/ui and design tokens wired up,
so that all subsequent stories build on a consistent foundation that matches the UX specification.

## Acceptance Criteria

1. **Starter scaffold runs.** Given an empty repository, when the starter commands from Architecture are run (`npx create-next-app@latest` with TS/Tailwind/App Router/src-dir, followed by `npx shadcn@latest init` and `npx shadcn@latest add toast checkbox`), then the project runs with `npm run dev` at `http://localhost:3000`, renders the default Next.js shell, and has `src/components/ui/` populated with shadcn primitives (`toast.tsx`, `checkbox.tsx` or equivalent).

2. **Design tokens configured.** Given the UX design spec's token requirements, when `tailwind.config.ts` and `src/app/globals.css` are configured, then they expose a 10-step neutral scale (light + dark), a single accent color (#D97706 light / #FBBF24 dark), a 4-size type scale (13px, 16px, 18px, 20px), spacing based on line-height rhythm, and motion duration constants at 150/200/250ms.

3. **Dark mode renders correctly.** Given a user whose OS is set to dark mode, when they load the app, then it renders in dark mode with a near-black (#0A0A0A) background and maintains WCAG AA contrast for all text.

4. **Reduced motion honored.** Given a user whose OS has reduced-motion preference set, when they trigger any UI transition (none exist yet, but tokens must support this), then transitions fall back to instant — verified by CSS `@media (prefers-reduced-motion: reduce)` rules emitted into the global stylesheet.

## Tasks / Subtasks

- [ ] **Task 1 — Run scaffold commands** (AC: #1)
  - [ ] Run `npx create-next-app@latest bmad-experiment --typescript --tailwind --app --src-dir --eslint --import-alias "@/*"` (note: we're inside the repo, so scaffold into the current directory — use `.` as the name or move files after)
  - [ ] Run `npx shadcn@latest init` (accept defaults; use Neutral base color)
  - [ ] Run `npx shadcn@latest add toast checkbox` — adds primitives to `src/components/ui/`
  - [ ] Verify `npm run dev` starts without errors and renders the default Next.js page at `http://localhost:3000`
  - [ ] Initialize git repo with an initial commit covering the scaffold

- [ ] **Task 2 — Configure Tailwind design tokens** (AC: #2)
  - [ ] Replace the default Tailwind color palette in `tailwind.config.ts` with the custom 10-step neutral scale (see Dev Notes → Color System)
  - [ ] Add the single accent color entry (`accent.light: #D97706`, `accent.dark: #FBBF24`)
  - [ ] Override the default type scale to four sizes only: `xs: 13px`, `base: 16px`, `lg: 18px`, `xl: 20px` with line-heights 1.3–1.5
  - [ ] Define spacing tokens based on line-height rhythm (not 4px grid) — see Dev Notes → Spacing
  - [ ] Define motion duration tokens: `duration-fast (150ms)`, `duration-base (200ms)`, `duration-slow (250ms)`
  - [ ] Configure `darkMode: 'media'` so Tailwind responds to `prefers-color-scheme`

- [ ] **Task 3 — Configure global CSS** (AC: #2, #3)
  - [ ] In `src/app/globals.css`, set background/foreground CSS custom properties for light and dark modes
  - [ ] Light mode background: `#FAFAFA`, foreground: near-black from neutral scale
  - [ ] Dark mode background: `#0A0A0A`, foreground: near-white from neutral scale
  - [ ] Apply base typography defaults (font-family from system stack; Inter as web-loaded fallback via `next/font` if default system rendering is poor)
  - [ ] Emit `@media (prefers-reduced-motion: reduce)` rule that sets `* { transition-duration: 0ms !important; animation-duration: 0ms !important; }`

- [ ] **Task 4 — Minimal app shell** (AC: #1, #3)
  - [ ] `src/app/layout.tsx` — root layout with `<html>`, `<body>`, applied base styles, `Analytics` component from `@vercel/analytics/react` (optional — can land in Story 3.9 if not convenient here)
  - [ ] `src/app/page.tsx` — Server Component, currently renders a minimal placeholder that will be replaced in Story 1.4 (empty shell is fine: e.g. `<main className="mx-auto max-w-[600px] p-6"></main>`)
  - [ ] Verify dark mode renders correctly by toggling OS preference

- [ ] **Task 5 — Verify AC and commit** (AC: all)
  - [ ] Run `npm run dev` — confirm load, light/dark switch via OS preference
  - [ ] Run Lighthouse once locally for a baseline snapshot (no CI gate yet, just record)
  - [ ] Commit with message `feat(scaffold): init project with design tokens (Story 1.1)`

## Dev Notes

### Tech Stack (locked in Architecture)

- **Runtime:** Node (Vercel Node runtime in prod)
- **Framework:** Next.js with App Router
- **Language:** TypeScript (strict mode via `create-next-app` defaults)
- **Styling:** Tailwind CSS; shadcn/ui primitives copied into `src/components/ui/`
- **Import alias:** `@/*` → `./src/*`
- **Motion (later stories):** Framer Motion with `LazyMotion`; install deferred until Epic 2 when first animation is needed. Do NOT install it in this story.

### Color System — Hand-tuned tokens

Replace Tailwind default `colors.gray` and `colors.zinc` palettes with this custom 10-step neutral scale. Values below are suggested; tune for AA contrast when you add them.

```ts
neutral: {
  50:  '#FAFAFA',  // light mode background
  100: '#F4F4F5',
  200: '#E4E4E7',
  300: '#D4D4D8',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#27272A',
  900: '#18181B',
  950: '#0A0A0A',  // dark mode background
},
accent: {
  light: '#D97706',  // muted warm amber (light mode)
  dark:  '#FBBF24',  // brighter amber (dark mode)
},
```

**Rule:** accent is used sparingly — focus states, focused-row indicator. Never for backgrounds, never for decorative icons.

### Typography Scale

System font stack via `next/font/local` or `next/font/google` (Inter fallback). Default to system stack if rendering is acceptable — avoid FOUT.

```ts
fontSize: {
  xs:   ['13px', { lineHeight: '1.4' }],  // timestamps, help overlay
  base: ['16px', { lineHeight: '1.5' }],  // todo item body
  lg:   ['18px', { lineHeight: '1.3' }],  // input field
  xl:   ['20px', { lineHeight: '1.3' }],  // completed section header (desktop)
},
fontWeight: {
  normal: 400,  // all active content
  // no bold, no semi-bold in v1 — weight changes are via opacity/color
}
```

### Spacing — Line-height rhythm (not 4px grid)

```ts
spacing: {
  xs:   '0.25rem',   // 4px
  sm:   '0.5rem',    // 8px
  base: '1rem',      // 16px — matches base line-height
  md:   '1.5rem',    // 24px — row padding on mobile
  lg:   '2rem',      // 32px — desktop padding
  xl:   '3rem',      // 48px — large desktop padding
}
```

Container max-width on desktop: `600px` (reading width). Centered. Never edge-to-edge.

### Motion Tokens

```ts
transitionDuration: {
  fast: '150ms',
  base: '200ms',
  slow: '250ms',
}
```

All app animations (in later stories) must use one of these three. No bounce, no spring, no decorative motion.

### Dark Mode Strategy

- `darkMode: 'media'` in `tailwind.config.ts` — follows `prefers-color-scheme`.
- Do NOT build a toggle in v1. System preference only.
- Both modes must hit WCAG AA. Verify with browser devtools contrast check.

### File Structure to Seed (for later stories)

Only create what's needed NOW (don't scaffold empty directories). But plan for:

```
src/
├── app/
│   ├── globals.css          ← create
│   ├── layout.tsx           ← create
│   ├── page.tsx             ← create (minimal placeholder)
│   ├── error.tsx            ← Story 1.6
│   ├── not-found.tsx        ← optional; create minimal one now is fine
│   └── api/                 ← Story 3.2/3.3/3.7
├── components/
│   ├── ui/                  ← populated by `shadcn add` in this story
│   └── (other components)   ← later stories
├── hooks/                   ← later stories
├── lib/                     ← Story 1.2 onward
├── stores/                  ← Story 2.3 onward
└── middleware.ts            ← later if needed
```

### Testing Standards (from Test Design)

- Tooling: **Vitest + Playwright only.** No Lighthouse CI, no axe-in-CI.
- No tests required in this story — the scaffold is verified by running dev server + visual inspection.
- First tests land in Story 1.2 (Dexie unit tests).
- If you install test deps in this story, install only: `vitest`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react`. Playwright lands later.

### Architecture Guardrails (MUST FOLLOW)

From `architecture.md` AI Agent Guardrails section:

1. Never introduce a spinner for a local operation.
2. Never surface a modal confirmation for a destructive action — use the undo toast.
3. Never log user todo text to server error reports.
4. Never rename a Prisma field without a migration committed in the same PR.
5. **Never edit files in `src/components/ui/` by hand — regenerate via `npx shadcn@latest add`.**
6. Never import `dexie` from a Server Component file — Dexie is client-only.

Rules #5 and #6 are most relevant now. #5 applies during Task 1. #6 applies as soon as Story 1.2 lands.

### Library & Framework Requirements

- **Do NOT add yet** (later stories will install these):
  - `dexie`, `dexie-react-hooks` → Story 1.2
  - `prisma`, `@prisma/client`, `@libsql/client` → Story 3.1
  - `@serwist/next`, `serwist` → Story 3.6
  - `zustand` → Story 2.3 (first need)
  - `framer-motion` → Epic 2 (first animation)
  - `zod` → Story 1.2 (schema module)

- **Do install in this story:** just what `create-next-app` + `shadcn` give you. No extras.

### Project Structure Notes

- Alignment: matches `architecture.md` → "Complete Project Directory Structure" section.
- Source root is `src/` (set by `--src-dir` flag).
- Import alias `@/*` → `./src/*` (set by `--import-alias` flag).
- ESLint preconfigured by starter.
- No conflicts detected; starter produces exactly the structure Architecture expects.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Project scaffold and design tokens] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation] — Init commands (copied verbatim into Task 1)
- [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions → Frontend Architecture] — Tech stack, SSR strategy, bundle optimization
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming conventions, state mutation patterns, AI guardrails
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] — Complete file tree (reference for future stories, not this one)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual Design Foundation] — Color system, typography scale, spacing, accessibility considerations
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision] — Editorial minimalism + tool polish hybrid (guides future component work)
- [Source: _bmad-output/test-artifacts/test-design/bmad-experiment-test-design.md#Tooling] — Vitest + Playwright scope
- Test design testability hooks (for future awareness, not this story): `window.__clientId`, `window.__syncState`, IDB reset helper, SW disabled in dev — all land in their respective stories

### Previous Story Intelligence

N/A — this is the first story. No prior dev notes to inherit.

### Git Intelligence

N/A — no git repo exists at the start of this story. Initialize the repo as part of Task 1 and commit on completion.

### Latest Tech Information

All install commands use `@latest` tags to resolve current versions at install time. As of 2026-04, Next.js is on the App Router as the recommended default, shadcn CLI is `shadcn` (not the legacy `shadcn-ui` package). No migration concerns in a greenfield install.

### Project Context Reference

No `project-context.md` exists in this repo. Architecture + UX spec + PRD are the context. If `project-context.md` appears later (e.g., after `bmad-generate-project-context` runs), subsequent stories should respect it.

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent._

### Debug Log References

_To be filled by dev agent._

### Completion Notes List

_To be filled by dev agent. Record: anything unexpected during scaffold, any version mismatches with `@latest`, any AC deviations with justification._

### File List

_To be filled by dev agent with list of files created or modified._
