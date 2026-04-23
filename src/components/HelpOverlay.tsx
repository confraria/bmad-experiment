'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useUIStore } from '@/stores/useUIStore';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribeDesktop(cb: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getDesktopServerSnapshot(): boolean {
  return false;
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
}

const SHORTCUTS: ReadonlyArray<{ keys: string[]; description: string }> = [
  { keys: ['j'], description: 'Move focus to next todo' },
  { keys: ['k'], description: 'Move focus to previous todo' },
  { keys: ['n'], description: 'Focus the add input' },
  { keys: ['Enter'], description: 'Submit new todo' },
  { keys: ['Space'], description: 'Toggle complete on focused row' },
  { keys: ['Cmd/Ctrl', 'Z'], description: 'Undo last delete' },
  { keys: ['Cmd/Ctrl', 'Backspace'], description: 'Delete focused row' },
  { keys: ['?'], description: 'Toggle this help' },
];

export function HelpOverlay() {
  const isDesktop = useIsDesktop();
  const helpOverlayOpen = useUIStore((s) => s.helpOverlayOpen);
  const setHelpOverlayOpen = useUIStore((s) => s.setHelpOverlayOpen);

  useEffect(() => {
    if (!isDesktop && helpOverlayOpen) {
      setHelpOverlayOpen(false);
    }
  }, [isDesktop, helpOverlayOpen, setHelpOverlayOpen]);

  if (!isDesktop) return null;

  return (
    <DialogPrimitive.Root open={helpOverlayOpen} onOpenChange={setHelpOverlayOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius)] border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <DialogPrimitive.Title className="text-base font-semibold">
            Keyboard shortcuts
          </DialogPrimitive.Title>
          <ul className="mt-4 flex flex-col gap-2">
            {SHORTCUTS.map((s) => (
              <li key={s.keys.join('+')} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{s.description}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
