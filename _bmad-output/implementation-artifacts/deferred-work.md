# Deferred Work

Items raised by reviewers that are real but not actionable in the story where they were found. Re-evaluate when the listed trigger lands.

## Deferred from: code review of story-1.1 and story-1.2 (2026-04-22)

### Story 1.1 (scaffold)
- `button` variant `[a]:hover:bg-primary/80` likely dead (shadcn scaffold quirk) — [src/components/ui/button.tsx]. Trigger: first real `<Button>` usage.
- `button` variant `not-aria-[haspopup]` non-standard Tailwind — [src/components/ui/button.tsx]. Trigger: first real `<Button>` usage.
- `checkbox` `<CheckIcon />` missing className — [src/components/ui/checkbox.tsx]. Trigger: Story 2.1 (tap-space to complete).
- `Sonner` `icons` prop allocates on every render — [src/components/ui/sonner.tsx]. Trigger: Story 2.3 (undo toast).
- `Sonner` calls `useTheme()` without a `ThemeProvider` — [src/components/ui/sonner.tsx + src/app/layout.tsx]. Trigger: manual light/dark toggle or Story 2.3.
- `src/app/page.tsx` returns empty `<main />` — placeholder. Trigger: Story 1.4 (view active list).

### Story 1.2 (data layer)
- Multi-tab `clientId` first-mount race — [src/lib/clientId.ts]. Trigger: Epic 3 sync engine; address with `BroadcastChannel` or `storage` event.
- No `storage` event listener for cross-tab identity sync — [src/lib/clientId.ts]. Trigger: Epic 3.
- Dexie schema v2 migration path not established — [src/lib/db.ts:13]. Trigger: first post-release schema change.
- Unhandled Dexie write errors (QuotaExceeded/VersionError/InvalidStateError) — [src/lib/db.ts:47,65]. Trigger: Story 1.3+ UI callers; wrap with unified error boundary.
- No SSR hydration utility for `clientId` consumers. Trigger: first UI consumer outside `useEffect`.
- `text.max(1000)` counts UTF-16 code units, not graphemes — [src/lib/schema.ts:5]. Trigger: multi-language / emoji-heavy content UX.
- `resetDbForTests` `Dexie.delete` unhandled rejection — test-only HMR edge case. Trigger: flaky test.
- Extract `__setUlidPrng` from `src/lib/ulid.ts` to a test-utils module. Reason: NODE_ENV guard is build-time-inlined in prod so runtime surface is already closed; extraction is a style preference. Trigger: if a generalized test-utils extraction pattern emerges for other modules.
- Extract `WINDOW_OVERRIDE_KEY` + override path from `src/lib/clientId.ts` to a test-utils module. Reason and trigger: same as `__setUlidPrng` — paired follow-up.
