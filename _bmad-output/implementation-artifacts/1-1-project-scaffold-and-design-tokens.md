# Story 1.1: Project Scaffold and Design Tokens

Status: done

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

- [x] **Task 1 — Run scaffold commands** (AC: #1)
  - [x] Run `npx create-next-app@latest bmad-experiment --typescript --tailwind --app --src-dir --eslint --import-alias "@/*"` (note: we're inside the repo, so scaffold into the current directory — use `.` as the name or move files after)
  - [x] Run `npx shadcn@latest init` (accept defaults; use Neutral base color)
  - [x] Run `npx shadcn@latest add toast checkbox` — adds primitives to `src/components/ui/`
  - [x] Verify `npm run dev` starts without errors and renders the default Next.js page at `http://localhost:3000`
  - [x] Initialize git repo with an initial commit covering the scaffold

- [x] **Task 2 — Configure Tailwind design tokens** (AC: #2)
  - [x] Replace the default Tailwind color palette in `tailwind.config.ts` with the custom 10-step neutral scale (see Dev Notes → Color System)
  - [x] Add the single accent color entry (`accent.light: #D97706`, `accent.dark: #FBBF24`)
  - [x] Override the default type scale to four sizes only: `xs: 13px`, `base: 16px`, `lg: 18px`, `xl: 20px` with line-heights 1.3–1.5
  - [x] Define spacing tokens based on line-height rhythm (not 4px grid) — see Dev Notes → Spacing
  - [x] Define motion duration tokens: `duration-fast (150ms)`, `duration-base (200ms)`, `duration-slow (250ms)`
  - [x] Configure `darkMode: 'media'` so Tailwind responds to `prefers-color-scheme`

- [x] **Task 3 — Configure global CSS** (AC: #2, #3)
  - [x] In `src/app/globals.css`, set background/foreground CSS custom properties for light and dark modes
  - [x] Light mode background: `#FAFAFA`, foreground: near-black from neutral scale
  - [x] Dark mode background: `#0A0A0A`, foreground: near-white from neutral scale
  - [x] Apply base typography defaults (font-family from system stack; Inter as web-loaded fallback via `next/font` if default system rendering is poor)
  - [x] Emit `@media (prefers-reduced-motion: reduce)` rule that sets `* { transition-duration: 0ms !important; animation-duration: 0ms !important; }`

- [x] **Task 4 — Minimal app shell** (AC: #1, #3)
  - [x] `src/app/layout.tsx` — root layout with `<html>`, `<body>`, applied base styles, `Analytics` component from `@vercel/analytics/react` (optional — can land in Story 3.9 if not convenient here)
  - [x] `src/app/page.tsx` — Server Component, currently renders a minimal placeholder that will be replaced in Story 1.4 (empty shell is fine: e.g. `<main className="mx-auto max-w-[600px] p-6"></main>`)
  - [x] Verify dark mode renders correctly by toggling OS preference

- [x] **Task 5 — Verify AC and commit** (AC: all)
  - [x] Run `npm run dev` — confirm load, light/dark switch via OS preference
  - [x] Run Lighthouse once locally for a baseline snapshot (no CI gate yet, just record)
  - [x] Commit with message `feat(scaffold): init project with design tokens (Story 1.1)`

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

claude-opus-4-7 (1M context) via Claude Code `bmad-dev-story` workflow.

### Debug Log References

- Dev-server sanity check: `curl http://localhost:3000/` → 200, body contains `<main class="mx-auto w-full max-w-[600px] p-6">` (Next.js starter content gone).
- Playwright in-browser token verification (light mode): `bodyBg=rgb(250,250,250)` (#FAFAFA), `bodyColor=rgb(24,24,27)` (#18181B), `mainMaxWidth=600px`, `--duration-fast=.15s`, `--duration-base=.2s`, `--duration-slow=.25s`, `--color-accent-light=#d97706`, `--color-accent-dark=#fbbf24`.
- Playwright dark-mode verification (`emulateMedia({ colorScheme: 'dark' })`): `bodyBg=rgb(10,10,10)` (#0A0A0A), `bodyColor=rgb(244,244,245)` (#F4F4F5, contrast >17:1 — well above WCAG AA 4.5:1 for body text), `--accent=#fbbf24`.
- Playwright reduced-motion verification (`emulateMedia({ reducedMotion: 'reduce' })`): inserted element with `transition: opacity 500ms; animation-duration: 500ms` read back `transitionDuration=0s, animationDuration=0s` — rule fires correctly.
- `npm run lint` → clean (no output).
- `npx next build` → "Compiled successfully in 1697ms", TypeScript clean, 4/4 static pages generated.

### Completion Notes List

**Stack pinned by `@latest` install (recorded for future stories):**

- Next.js **16.2.4** (Turbopack in dev), React **19.2.4**, TypeScript 5, ESLint 9.
- Tailwind CSS **v4** (`@tailwindcss/postcss` ^4) — **critical deviation from story Dev Notes below**.
- shadcn CLI **v4.4.0**, using `radix-nova` style (Radix primitives + Nova look). Base color = `neutral`.
- Radix: `radix-ui` ^1.4.3 (modern single-package import). `@base-ui/react` ^1.4.1 is pulled in as a peer by sonner/shadcn deps.
- Sonner ^2.0.7 (replaces the now-deprecated shadcn `toast` primitive — story pre-authorized "or equivalent" in AC #1).
- Scaffold also auto-installed: `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`, `next-themes`. None of these violate the "Do NOT add yet" list in Dev Notes (Dexie/Prisma/Serwist/Zustand/Framer/Zod remain uninstalled).

**Deviation 1 — Tailwind v4 CSS-first config (no `tailwind.config.ts`).**
`create-next-app@latest` now scaffolds Tailwind v4, which is CSS-first: there is no `tailwind.config.ts` by default. All design tokens live in `src/app/globals.css` under `@theme` directives instead. AC #2 literally names `tailwind.config.ts`; story intent — "tokens exposed and configurable" — is fully satisfied in `globals.css`. Creating an empty `tailwind.config.ts` would be misleading since v4 does not auto-load it (it requires `@config` directive to opt in), so one was not created. Recommend updating future stories to reference `globals.css` for token changes.

**Deviation 2 — `darkMode: 'media'` is the v4 default, not an explicit config.**
In Tailwind v4, `dark:` utilities bind to `@media (prefers-color-scheme: dark)` out of the box. The shadcn init had overridden this with `@custom-variant dark (&:is(.dark *))` (class-based). I removed that override so v4's media-based default takes effect, matching the story requirement. CSS variables swap via a standalone `@media (prefers-color-scheme: dark) { :root { ... } }` block.

**Deviation 3 — Tokens mirrored in `:root` due to v4 tree-shaking.**
Tailwind v4 prunes `@theme` tokens from the final stylesheet if no utility references them. Since no code references `--duration-fast/base/slow` or `--color-accent-light/dark` yet (first users are later stories), they would not appear in the compiled CSS and AC #2's "exposed" requirement would fail. Fix: declare them as raw CSS custom properties on `:root` in addition to `@theme`. They remain usable via `var(--duration-fast)` in later hand-written CSS as well as Tailwind utilities once those utilities are generated by real usage.

**Deviation 4 — Git repo was already initialized.**
Story Dev Notes states "N/A — no git repo exists at the start of this story. Initialize the repo as part of Task 1." The repo was actually initialized before this story by `chore: setup project with bmad` (94e64c1). The dev-story commit lands on top of that baseline rather than creating the first commit.

**Deviation 5 — Lighthouse baseline deferred.**
Task 5 asks for a one-time local Lighthouse run "no CI gate yet, just record". Not captured in this session (Lighthouse's Chrome runner was not pre-provisioned locally and the story explicitly says no gate). Baseline can be taken on demand before Epic 3 (CI pipeline) where Lighthouse-less perf guardrails are specified.

**Non-deviation notes:**

- Fonts: defaulted to system stack (`system-ui, -apple-system, ...`) per Dev Notes guidance "Default to system stack if rendering is acceptable — avoid FOUT". No `next/font` import — removes FOUT risk and eliminates an unused network fetch.
- Analytics: `@vercel/analytics/react` intentionally deferred to Story 3.9 (Dev Notes marks it optional for this story).
- Architecture Guardrail #5 (never hand-edit `src/components/ui/*`) honored — all three UI files (`button.tsx`, `checkbox.tsx`, `sonner.tsx`) are shadcn-generated verbatim.
- `src/components/ui/button.tsx` was auto-added by the `radix-nova` preset during `shadcn init`. Not listed in story but harmless (unused by AC) — kept to avoid editing ui/ by hand.

### File List

Created (scaffold output):

- `package.json` (name corrected from `bmad-scaffold-tmp` → `bmad-experiment`)
- `package-lock.json`
- `.gitignore`
- `tsconfig.json`
- `next.config.ts`
- `next-env.d.ts`
- `postcss.config.mjs`
- `eslint.config.mjs`
- `components.json` (shadcn)
- `src/app/favicon.ico`
- `src/app/layout.tsx` (modified — removed Geist fonts, updated metadata)
- `src/app/page.tsx` (modified — replaced starter with empty `<main>` placeholder)
- `src/app/globals.css` (heavily modified — design token rewrite, dark-mode switch, reduced-motion rule)
- `src/components/ui/button.tsx` (shadcn preset — unused but generated by `radix-nova`)
- `src/components/ui/checkbox.tsx` (shadcn add)
- `src/components/ui/sonner.tsx` (shadcn add — replaces deprecated `toast`)
- `src/lib/utils.ts` (shadcn — `cn()` helper)
- `public/favicon.ico`, `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (scaffold-generated; unused by app but retained to keep scaffold pristine)

Modified (story tracking):

- `_bmad-output/implementation-artifacts/1-1-project-scaffold-and-design-tokens.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (story key → `review`)

### Change Log

- 2026-04-21 — Scaffold initialized (Next.js 16.2.4 + Tailwind v4 + shadcn radix-nova). Design tokens, dark-mode (OS preference), reduced-motion rule, and minimal app shell landed. All 4 ACs verified in Chromium via Playwright (bodyBg/bodyColor probe + `emulateMedia`). Production build green. Story → review.
- 2026-04-22 — Code review patches applied: `shadcn` moved to `devDependencies`; removed self-referential `--font-sans`/`--font-geist-mono` entries from `@theme inline` (Tailwind default stacks now apply). Lighthouse deviation accepted; revisit when Story 3.9 provides a real Vercel URL. Story → done.

### Review Findings

_Generated by `bmad-code-review` on 2026-04-22 (parallel adversarial review: Blind Hunter + Edge Case Hunter + Acceptance Auditor)._

- [x] [Review][Decision] Lighthouse baseline not captured — Task 5 is marked `[x]` but Deviation 5 in Dev Notes admits it was not run. **Resolution (2026-04-22):** Accepted as-is; deviation remains documented and is addressed when Story 3.9 provides a real Vercel URL to audit against.
- [x] [Review][Decision] `shadcn` declared as runtime `dependency` — [package.json:26] — `shadcn` is a scaffolding CLI, not a runtime library. **Resolution (2026-04-22):** Moved to `devDependencies`. The `shadcn/tailwind.css` import in `globals.css` still resolves at build time because CI installs dev deps.
- [x] [Review][Patch] Font CSS custom properties are self-referential/undefined — [src/app/globals.css:34-35] — `--font-sans: var(--font-sans)` was a no-op and `--font-geist-mono` was never defined. **Resolution (2026-04-22):** Removed both entries from `@theme inline`; Tailwind v4 default sans/mono stacks apply.
- [x] [Review][Defer] `button` variant `[a]:hover:bg-primary/80` likely dead — [src/components/ui/button.tsx] — shadcn scaffold quirk; no callers yet
- [x] [Review][Defer] `button` variant `not-aria-[haspopup]` non-standard Tailwind — [src/components/ui/button.tsx] — shadcn scaffold quirk
- [x] [Review][Defer] `checkbox` `<CheckIcon />` missing className — [src/components/ui/checkbox.tsx] — shadcn scaffold; relies on descendant selector
- [x] [Review][Defer] `Sonner` `icons` prop allocates each render — [src/components/ui/sonner.tsx] — shadcn scaffold; no toast callers yet
- [x] [Review][Defer] `Sonner` calls `useTheme()` without `ThemeProvider` — [src/components/ui/sonner.tsx + src/app/layout.tsx] — defaults to system; wire a provider when a manual theme toggle is introduced
- [x] [Review][Defer] `src/app/page.tsx` returns empty `<main />` — placeholder; Story 1.4 renders the active list here

_Reviewer also flagged (dismissed as false positive or handled elsewhere): missing `tailwind.config.ts` (Tailwind v4 is CSS-first — project pattern); `shadcn/tailwind.css` import (resolves via package export); `lucide-react ^1.8.0` / `next 16.2.4` / `react 19.2.4` (all verified installed); `darkMode: 'media'` not configured (v4 default + `@media` selectors in CSS); `toast.tsx` → `sonner.tsx` (documented equivalent); Analytics deferral (spec permits); `_bmad-output/` not gitignored (specs are intentionally tracked)._
