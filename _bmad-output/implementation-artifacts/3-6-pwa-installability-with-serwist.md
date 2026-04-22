# Story 3.6: PWA installability with Serwist

Status: done

## Story

As a user,
I want to install the app to my home screen and launch it without browser chrome,
so that it feels like a native app.

## Acceptance Criteria

1. **Serwist is wired into `next.config.ts`.** Given `@serwist/next` is installed and configured, when `npm run build` runs, then a service worker is generated at `public/sw.js` with precached entries for the app shell + Next.js static chunks.

2. **Service worker registers automatically on first visit.** Given a production build is served (e.g., via `npm start` on `http://localhost:3000`), when a browser loads `/`, then `navigator.serviceWorker.getRegistrations()` returns at least one active registration pointing at `/sw.js`.

3. **`public/manifest.webmanifest` declares standalone display + icons.** Given the manifest file exists, when a browser fetches `/manifest.webmanifest`, then it receives a JSON document containing:
   - `name`: "bmad-experiment"
   - `short_name`: "bmad"
   - `start_url`: "/"
   - `scope`: "/"
   - `display`: "standalone"
   - `theme_color`: "#fafafa" (matches `--background` light-mode value)
   - `background_color`: "#fafafa"
   - `icons`: array with at least `192x192`, `512x512`, and a `512x512` with `purpose: "maskable"` — all `image/png`.

4. **Icons exist at the referenced paths.** Given the manifest references `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/icon-maskable-512.png`, when a browser fetches each, then it receives a valid PNG of the declared size with `content-type: image/png`.

5. **`<link rel="manifest">` and `<meta name="theme-color">` ship in the rendered HTML.** Given `src/app/layout.tsx` sets `metadata.manifest` and `viewport.themeColor`, when the page is rendered (SSR or static), then the response body contains `<link rel="manifest" href="/manifest.webmanifest">` and a `<meta name="theme-color" content="#fafafa">` tag.

6. **Dev mode disables the service worker.** Given `npm run dev` is running, when the browser loads `/`, then NO service worker is registered (`navigator.serviceWorker.getRegistrations()` is empty), and no `/sw.js` is served. This prevents cache-surprise bugs during development.

7. **Production build output is clean.** Given `npm run build` runs, when it completes, then:
   - There is no error or warning about manifest / service worker.
   - `public/sw.js` exists and is non-empty.
   - Existing `ƒ /api/sync` route still appears as `Dynamic` in the build summary (Serwist does not interfere with route handlers).

8. **E2E validates the manifest and its icons.** Given `e2e/pwa.spec.ts` is added, when Playwright runs, then it: (a) fetches `/manifest.webmanifest` and validates every required field, (b) fetches each icon URL and asserts a 200 + `image/png` content-type, (c) checks that the rendered HTML contains `<link rel="manifest">`. The spec runs against the dev server (no prod build needed); service-worker runtime behavior is NOT asserted — it's Serwist's own test surface.

9. **No regressions.** Given existing tests, when this story lands, then `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` all succeed.

## Tasks / Subtasks

- [x] **Task 1 — Install Serwist** (AC: #1, #6)
  - [x] Run:
    ```bash
    npm install @serwist/next serwist
    ```
  - [x] Verify version compatibility with Next.js 16.2.4 — check `node_modules/@serwist/next/package.json` peer deps. If Serwist rejects Next 16, pin to the latest compatible major and document in Dev Notes.

- [x] **Task 2 — Configure Serwist in `next.config.ts`** (AC: #1, #6, #7)
  - [x] Wrap the existing config with `@serwist/next`'s `withSerwistInit`:
    ```ts
    import type { NextConfig } from 'next';
    import withSerwistInit from '@serwist/next';

    const withSerwist = withSerwistInit({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
      disable: process.env.NODE_ENV === 'development',
    });

    const nextConfig: NextConfig = {
      allowedDevOrigins: ['192.168.1.65'],
    };

    export default withSerwist(nextConfig);
    ```
  - [x] Keep `allowedDevOrigins` untouched — it's orthogonal to Serwist.
  - [x] **Why `disable: process.env.NODE_ENV === 'development'`:** Serwist's own recommended pattern. Prevents the dev server from serving a stale SW while hot-reloading changes.

- [x] **Task 3 — Create the SW source at `src/app/sw.ts`** (AC: #1, #2)
  - [x] Write the Serwist-recommended SW entry point:
    ```ts
    import { defaultCache } from '@serwist/next/worker';
    import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
    import { Serwist } from 'serwist';

    declare global {
      interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
      }
    }

    declare const self: ServiceWorkerGlobalScope;

    const serwist = new Serwist({
      precacheEntries: self.__SW_MANIFEST,
      skipWaiting: true,
      clientsClaim: true,
      navigationPreload: true,
      runtimeCaching: defaultCache,
    });

    serwist.addEventListeners();
    ```
  - [x] **Why `skipWaiting + clientsClaim`:** new SW version activates immediately instead of waiting for all tabs to close. Acceptable for a single-user dogfood — users see updates on next navigation.
  - [x] **Why `defaultCache`:** Serwist's battle-tested runtime caching for images, fonts, static assets, Next's RSC payloads, and HTML navigations. Avoids bespoke cache rules for v1.
  - [x] Exclude `src/app/sw.ts` from Vitest coverage — it's a service worker, not runtime code. Add `src/app/sw.ts` to the `exclude` list in `vitest.config.ts` if needed (actually the existing `include: ['src/lib/**/*.ts']` coverage scope already excludes it — verify, don't over-edit).
  - [x] TypeScript check — Serwist types should resolve cleanly via `moduleResolution: "bundler"` in `tsconfig.json`.

- [x] **Task 4 — Generate PWA icons via a one-off script** (AC: #4)
  - [x] Create `scripts/generate-icons.ts`. It generates three PNGs using `sharp` (already installed as a Next.js transitive dep):
    - `public/icons/icon-192.png` — 192×192, solid `#18181b` (app's primary foreground) with centered white "✓" (checkmark)
    - `public/icons/icon-512.png` — 512×512, same design scaled
    - `public/icons/icon-maskable-512.png` — 512×512, same design but with a ~20% safe zone (icon content inset by ~64 px) so Android's maskable transformations don't clip the checkmark
  - [x] Implementation sketch:
    ```ts
    import sharp from 'sharp';
    import { mkdir } from 'node:fs/promises';
    import path from 'node:path';

    const OUT = 'public/icons';
    const BG = '#18181b';

    function svg(size: number, padding = 0): Buffer {
      const inner = size - padding * 2;
      const checkSize = Math.floor(inner * 0.5);
      const cx = size / 2;
      const cy = size / 2;
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
          <rect width="${size}" height="${size}" fill="${BG}"/>
          <path d="M ${cx - checkSize / 2} ${cy}
                   l ${checkSize / 3} ${checkSize / 3}
                   l ${checkSize * 2 / 3} ${-checkSize * 2 / 3}"
                stroke="white" stroke-width="${Math.max(8, size / 24)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
      );
    }

    async function run() {
      await mkdir(OUT, { recursive: true });
      await sharp(svg(192)).png().toFile(path.join(OUT, 'icon-192.png'));
      await sharp(svg(512)).png().toFile(path.join(OUT, 'icon-512.png'));
      await sharp(svg(512, 100)).png().toFile(path.join(OUT, 'icon-maskable-512.png'));
      console.log('icons generated');
    }

    run();
    ```
  - [x] Run it once: `npx tsx scripts/generate-icons.ts`. Commit the generated PNGs. Keep the script in the repo (future icon redesigns are a one-line edit + re-run).
  - [x] Add a one-line entry to `package.json` scripts: `"icons": "tsx scripts/generate-icons.ts"` so the command is discoverable.
  - [x] Verify PNG dimensions: `file public/icons/icon-*.png` should report `192 x 192` / `512 x 512`.

- [x] **Task 5 — Create `public/manifest.webmanifest`** (AC: #3)
  - [x] File contents:
    ```json
    {
      "name": "bmad-experiment",
      "short_name": "bmad",
      "description": "A simple, fast todo app — create, view, complete, and delete personal tasks.",
      "start_url": "/",
      "scope": "/",
      "display": "standalone",
      "orientation": "portrait",
      "theme_color": "#fafafa",
      "background_color": "#fafafa",
      "icons": [
        { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
        { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
      ]
    }
    ```
  - [x] **Theme color decision:** `#fafafa` is the light-mode background. We intentionally do NOT use the dark-mode `#0a0a0a` because the manifest value is a single static color; browsers use it for the splash screen and OS chrome on install. The light value matches iOS's typical auto-generated splash behaviour; dark-mode users see slightly off colors at install time but the in-app theme still respects OS preference.

- [x] **Task 6 — Wire manifest + theme color into `src/app/layout.tsx`** (AC: #5)
  - [x] Update metadata:
    ```ts
    import type { Metadata, Viewport } from 'next';
    import './globals.css';

    export const metadata: Metadata = {
      title: 'bmad-experiment',
      description:
        'A simple, fast todo app — create, view, complete, and delete personal tasks.',
      manifest: '/manifest.webmanifest',
      applicationName: 'bmad',
      appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'bmad',
      },
    };

    export const viewport: Viewport = {
      themeColor: '#fafafa',
    };
    ```
  - [x] **Why `appleWebApp`:** iOS Safari honors these separately from the manifest for Home Screen installs. Cost: 3 lines; benefit: iOS users get a proper standalone launch.
  - [x] **Do NOT change the body or html structure.** No viewport meta tags by hand — Next.js's `Viewport` export owns that.

- [x] **Task 7 — E2E test for manifest + icons + metadata link** (AC: #8)
  - [x] Create `e2e/pwa.spec.ts`:
    ```ts
    import { test, expect } from '@playwright/test';

    test.describe('Story 3.6 — PWA installability', () => {
      test('manifest.webmanifest is served and valid', async ({ request }) => {
        const res = await request.get('/manifest.webmanifest');
        expect(res.status()).toBe(200);
        const json = await res.json();
        expect(json.name).toBe('bmad-experiment');
        expect(json.short_name).toBe('bmad');
        expect(json.start_url).toBe('/');
        expect(json.display).toBe('standalone');
        expect(json.theme_color).toBe('#fafafa');
        expect(json.background_color).toBe('#fafafa');
        const sizes = (json.icons as Array<{ sizes: string; purpose?: string }>).map((i) => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
        const maskable = (json.icons as Array<{ purpose?: string }>).find((i) => i.purpose === 'maskable');
        expect(maskable).toBeDefined();
      });

      test('referenced icons are served as PNG', async ({ request }) => {
        for (const url of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']) {
          const res = await request.get(url);
          expect(res.status(), url).toBe(200);
          expect(res.headers()['content-type']).toContain('image/png');
        }
      });

      test('rendered HTML includes <link rel="manifest"> and theme-color meta', async ({ page }) => {
        await page.goto('/');
        const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
        expect(manifestLink).toBe('/manifest.webmanifest');
        const themeMeta = await page.locator('meta[name="theme-color"]').getAttribute('content');
        expect(themeMeta).toBe('#fafafa');
      });
    });
    ```
  - [x] **Why we don't assert service-worker registration here:** The SW is disabled in dev per AC #6, and E2E runs against `npm run dev`. Running E2E against a prod build requires a different Playwright config — out of scope for v1. Manual smoke verification covers the SW path.

- [ ] **Task 8 — Manual smoke checklist** (AC: #2, #7) — **DEFERRED TO USER**
  - [ ] Run `npm run build && npm start`. Open `http://localhost:3000` in Chrome.
  - [ ] DevTools → Application → Service Workers: confirm `sw.js` is "activated and running".
  - [ ] DevTools → Application → Manifest: confirm all fields and all three icons render.
  - [ ] Chrome address bar → install icon appears → click "Install bmad-experiment" → app launches in standalone mode with the checkmark icon visible.
  - [ ] Kill the dev server; reload the installed app: app still loads (precache works).
  - [ ] Uninstall via Chrome → chrome://apps, remove.

- [x] **Task 9 — Regression sweep** (AC: #9)
  - [x] `npm test` — all unit tests pass.
  - [x] `npm run test:e2e` — new `pwa.spec.ts` passes plus all existing specs.
  - [x] `npm run lint`.
  - [x] `npx tsc --noEmit`.
  - [x] `npm run build` — succeeds, `public/sw.js` exists, route summary unchanged for `/api/sync`.

## Dev Notes

### Why Serwist, not `next-pwa`

`next-pwa` is unmaintained. Serwist is its spiritual successor — same Workbox-under-the-hood approach, actively maintained, first-class Next 13+ App Router support. Architecture §Starter Template Evaluation locked it in (line 101–102).

### Service worker + Next.js 16 gotchas

Next 16 uses Turbopack in dev and SWC in prod. Serwist runs at build time (it's a Webpack plugin under the hood), so it intersects with prod builds only. Turbopack in dev is why we `disable` SW for dev — Turbopack's asset graph would fight Serwist's precache manifest generation.

If the build errors with "Cannot find module '@serwist/next'", verify the install landed in `dependencies`, not `devDependencies`. Serwist's types and runtime are both needed.

### Why we don't ship a dark theme color in the manifest

The W3C Web App Manifest supports a single `theme_color`. Some implementations (WebKit) support `theme_color` inside a media-query-scoped manifest entry, but the support is patchy. For v1, `#fafafa` is the "safe and bright" choice — matches iOS install behaviour best, and dark-mode OS users see the in-app dark theme as soon as the app mounts.

### Icon generation: `sharp` is already installed

Next.js ships `sharp` as an optional peer dep for image optimization. Our project already has it at `node_modules/sharp/`. We piggyback on it for the one-off icon build — no new install needed.

### Why the maskable icon has a ~20% safe zone

Android's "adaptive icons" system transforms the icon into rounded squares, circles, teardrops, etc. Anything outside the safe zone (center ~80% of the canvas) gets clipped. We inset by 100 px on the 512×512 canvas (~19.5%) so the checkmark always survives the transformation.

### The SW is disabled under `npm run dev`

Serwist's `disable: process.env.NODE_ENV === 'development'` short-circuits SW generation AND removes the registration script from the HTML. During dev you will NOT see `sw.js` in Network, and `navigator.serviceWorker.getRegistrations()` returns `[]`. This is the correct behavior — cache surprises during rapid iteration are a debugging nightmare.

### E2E strategy: manifest + icons yes, SW lifecycle no

Playwright's browser contexts don't persist across tests by default, and SW state is bound to origin + storage partition. Asserting "SW registered" reliably in E2E requires careful setup that isn't worth it for a single-user dogfood app. The manifest + icons + HTML link are the observable contract; the SW runtime is Serwist's responsibility to test.

### If the build complains about `src/app/sw.ts` being importable at runtime

Next.js might try to include `sw.ts` as a route if it matches a routing convention. It shouldn't — `sw` is not a reserved Next.js filename — but if Next gets confused, move the SW source to `src/sw.ts` (outside `app/`) and update `swSrc` in `next.config.ts`.

### What "standalone" mode gives the user

When installed via "Add to Home Screen":
- The app launches from the home screen icon with no browser address bar, no tabs.
- `display-mode: standalone` media query returns `true` inside the app — we don't use it today, but Story 4.x could hide help-overlay hints that don't apply in standalone.
- The OS treats it like a native app: task switcher, splash screen, etc.

### Files expected to change

- `package.json` + `package-lock.json` — 2 new deps (`@serwist/next`, `serwist`)
- `next.config.ts` — wrap with `withSerwist`
- `src/app/sw.ts` — NEW: Serwist entry point
- `src/app/layout.tsx` — add `manifest` + `viewport.themeColor` metadata
- `public/manifest.webmanifest` — NEW
- `public/icons/icon-192.png` — NEW (binary)
- `public/icons/icon-512.png` — NEW (binary)
- `public/icons/icon-maskable-512.png` — NEW (binary)
- `scripts/generate-icons.ts` — NEW: one-off build helper
- `e2e/pwa.spec.ts` — NEW: 3 E2E tests
- `_bmad-output/implementation-artifacts/3-6-pwa-installability-with-serwist.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression

### Files that must NOT be changed

- `src/lib/sync.ts` — sync engine is orthogonal to PWA
- `src/lib/db.ts` — Dexie is the source of truth; SW doesn't cache IndexedDB
- `src/app/globals.css` — theme tokens unchanged
- `src/app/api/sync/route.ts` — API routes are not precached by Serwist defaults

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 / Story 3.6]
- [Source: _bmad-output/planning-artifacts/architecture.md — §Starter Template install steps (line 101), §Project Structure (`public/manifest.webmanifest`, `public/icons/`), §Infrastructure (Serwist for PWA)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — §Resilience as a trust moment (line 40)]
- [Source: src/app/globals.css — `--background: #fafafa` (light mode) drives `theme_color`]
- [Source: src/app/layout.tsx — existing metadata to extend]
- [Source: next.config.ts — existing config to wrap]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

- **Next 16 + Turbopack vs Serwist's webpack config.** First build failed with `ERROR: This build is using Turbopack, with a webpack config and no turbopack config.` Serwist injects a webpack config via `withSerwistInit`, which Next 16's default Turbopack build rejects. Fixed by changing `npm run build` to `next build --webpack` — a documented Next.js escape hatch. Turbopack still powers `npm run dev`.
- **Dev server also crashed** even with `disable: true` in Serwist options — the wrapper still installed webpack plumbing that Turbopack refused. Fixed by conditionally wrapping: in `development`, export the bare `nextConfig`; in production, wrap with `withSerwistInit`. The `disable` option is no longer needed because Serwist doesn't even load in dev.
- **TypeScript rejected `ServiceWorkerGlobalScope`** (not in the default `dom` lib). Added `/// <reference lib="webworker" />` at the top of `src/app/sw.ts` — scoped to that file only; no tsconfig change.
- **ESLint flagged 85 warnings + 1 error in `public/sw.js`** (the Serwist-generated bundle). Added `public/sw.js` + `public/sw.js.map` to `eslint.config.mjs`'s ignore list and to `.gitignore` — it's a build artifact, not source.

### Completion Notes List

- **Serwist 9.5.7 + Next 16** works via the `--webpack` flag; Turbopack stays as the dev default.
- `src/app/sw.ts` uses Serwist's recommended configuration: `skipWaiting + clientsClaim + navigationPreload + defaultCache` runtime rules. Webworker types resolved via a triple-slash reference.
- **Conditional wrapper in `next.config.ts`** — dev exports bare `nextConfig`, prod wraps with `withSerwistInit`. Cleaner than relying on Serwist's `disable` option which still injected webpack plumbing that broke Turbopack dev.
- `scripts/generate-icons.ts` committed for future redesigns. Generates 192 / 512 / maskable-512 PNGs from an inline SVG checkmark via `sharp` (already a Next.js transitive dep, no new install). `npm run icons` script added.
- Manifest: `#fafafa` light-mode theme, `standalone` display, three icons with maskable variant. `<link rel="manifest">` and `<meta name="theme-color">` ship via Next's `metadata` / `viewport` exports in `layout.tsx`. `appleWebApp` block added for iOS Home Screen.
- **Build is clean**: Serwist logs `Bundling the service worker script with the URL '/sw.js' and the scope '/'`, and `public/sw.js` is 41.8 KB. Route summary for `/api/sync` still shows `ƒ (Dynamic)` — unchanged.
- **6 new E2E tests** in `e2e/pwa.spec.ts` (manifest validation, icon content-type, HTML link/meta). **173/173 unit tests pass, 48/48 Playwright pass (6 new + 42 prior), clean lint/tsc/build.**
- **Task 8 (manual smoke) is deferred to you** — install via `Add to Home Screen`, verify SW registration in DevTools, confirm precache-based offline launch. Automated E2E covers the static contract (manifest, icons, HTML); SW runtime is Serwist's own test surface.

### File List

- `package.json` + `package-lock.json` — MODIFIED: `@serwist/next` + `serwist` deps; `build` script switched to `--webpack`; new `icons` script
- `next.config.ts` — MODIFIED: conditional Serwist wrapper for prod builds only
- `src/app/sw.ts` — NEW: Serwist SW entry point
- `src/app/layout.tsx` — MODIFIED: `metadata.manifest`, `metadata.appleWebApp`, `viewport.themeColor`
- `public/manifest.webmanifest` — NEW
- `public/icons/icon-192.png` — NEW (binary, 192×192)
- `public/icons/icon-512.png` — NEW (binary, 512×512)
- `public/icons/icon-maskable-512.png` — NEW (binary, 512×512 with 20% safe zone)
- `scripts/generate-icons.ts` — NEW: sharp-based icon generator
- `e2e/pwa.spec.ts` — NEW: 3 E2E tests (× 2 projects = 6 runs)
- `eslint.config.mjs` — MODIFIED: ignore `public/sw.js` + `.map`
- `.gitignore` — MODIFIED: ignore `public/sw.js` + `.map`
- `_bmad-output/implementation-artifacts/3-6-pwa-installability-with-serwist.md` — this file
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status progression
