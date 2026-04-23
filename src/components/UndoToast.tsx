'use client';

import { useUIStore } from '@/stores/useUIStore';

export function UndoToast() {
  const undoPendingTodo = useUIStore((s) => s.undoPendingTodo);
  const undoPendingDelete = useUIStore((s) => s.undoPendingDelete);

  if (!undoPendingTodo) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-sm -translate-x-1/2 items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] px-4 py-3 text-[var(--popover-foreground)] shadow-lg md:left-4 md:translate-x-0"
    >
      <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-sm">
        {undoPendingTodo.text}
      </span>
      <button
        type="button"
        onClick={() => void undoPendingDelete()}
        className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Undo
      </button>
    </div>
  );
}
