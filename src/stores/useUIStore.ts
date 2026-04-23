import { create } from 'zustand';
import { updateTodo } from '@/lib/db';

type UndoPendingTodo = { id: string; text: string };

type UIStore = {
  undoPendingTodo: UndoPendingTodo | null;
  helpOverlayOpen: boolean;
  showUndoToast: (id: string, text: string) => void;
  dismissUndoToast: () => void;
  undoPendingDelete: () => Promise<void>;
  toggleHelpOverlay: () => void;
};

let _undoTimerId: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIStore>()((set, get) => ({
  undoPendingTodo: null,
  helpOverlayOpen: false,

  showUndoToast(id, text) {
    if (_undoTimerId) clearTimeout(_undoTimerId);
    _undoTimerId = setTimeout(() => {
      set({ undoPendingTodo: null });
      _undoTimerId = null;
    }, 5000);
    set({ undoPendingTodo: { id, text } });
  },

  dismissUndoToast() {
    if (_undoTimerId) clearTimeout(_undoTimerId);
    _undoTimerId = null;
    set({ undoPendingTodo: null });
  },

  async undoPendingDelete() {
    const pending = get().undoPendingTodo;
    if (!pending) return;
    get().dismissUndoToast();
    try {
      await updateTodo(pending.id, { deletedAt: null });
    } catch (err) {
      console.error('useUIStore: undoPendingDelete failed', err);
    }
  },

  toggleHelpOverlay() {
    set((s) => ({ helpOverlayOpen: !s.helpOverlayOpen }));
  },
}));
