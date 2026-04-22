import { create } from 'zustand';

type UndoPendingTodo = { id: string; text: string };

type UIStore = {
  undoPendingTodo: UndoPendingTodo | null;
  showUndoToast: (id: string, text: string) => void;
  dismissUndoToast: () => void;
};

let _undoTimerId: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIStore>((set) => ({
  undoPendingTodo: null,

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
}));
