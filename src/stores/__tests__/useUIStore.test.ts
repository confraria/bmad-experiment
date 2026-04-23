import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockUpdateTodo = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
}));

import { useUIStore } from '../useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    mockUpdateTodo.mockClear();
    mockUpdateTodo.mockResolvedValue(undefined);
    useUIStore.getState().dismissUndoToast();
    useUIStore.setState({ undoPendingTodo: null, helpOverlayOpen: false });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('showUndoToast sets undoPendingTodo with id and text', () => {
    useUIStore.getState().showUndoToast('abc', 'Buy milk');
    expect(useUIStore.getState().undoPendingTodo).toEqual({ id: 'abc', text: 'Buy milk' });
  });

  it('dismissUndoToast clears undoPendingTodo', () => {
    useUIStore.getState().showUndoToast('abc', 'Buy milk');
    useUIStore.getState().dismissUndoToast();
    expect(useUIStore.getState().undoPendingTodo).toBeNull();
  });

  it('auto-dismisses after 5 seconds', () => {
    useUIStore.getState().showUndoToast('abc', 'Buy milk');
    vi.advanceTimersByTime(5000);
    expect(useUIStore.getState().undoPendingTodo).toBeNull();
  });

  it('does not auto-dismiss before 5 seconds', () => {
    useUIStore.getState().showUndoToast('abc', 'Buy milk');
    vi.advanceTimersByTime(4999);
    expect(useUIStore.getState().undoPendingTodo).not.toBeNull();
  });

  it('calling showUndoToast twice replaces first and resets 5s timer', () => {
    useUIStore.getState().showUndoToast('a', 'Item A');
    vi.advanceTimersByTime(3000);
    useUIStore.getState().showUndoToast('b', 'Item B');

    expect(useUIStore.getState().undoPendingTodo).toEqual({ id: 'b', text: 'Item B' });

    // 4999ms after second call (7999ms total) — still showing
    vi.advanceTimersByTime(4999);
    expect(useUIStore.getState().undoPendingTodo).not.toBeNull();

    // 1ms more → timer fires
    vi.advanceTimersByTime(1);
    expect(useUIStore.getState().undoPendingTodo).toBeNull();
  });

  it('dismissUndoToast when no toast is pending does not throw', () => {
    expect(() => useUIStore.getState().dismissUndoToast()).not.toThrow();
    expect(useUIStore.getState().undoPendingTodo).toBeNull();
  });

  describe('helpOverlayOpen', () => {
    it('defaults to false', () => {
      expect(useUIStore.getState().helpOverlayOpen).toBe(false);
    });

    it('toggleHelpOverlay flips it true, then false, then true', () => {
      useUIStore.getState().toggleHelpOverlay();
      expect(useUIStore.getState().helpOverlayOpen).toBe(true);

      useUIStore.getState().toggleHelpOverlay();
      expect(useUIStore.getState().helpOverlayOpen).toBe(false);

      useUIStore.getState().toggleHelpOverlay();
      expect(useUIStore.getState().helpOverlayOpen).toBe(true);
    });
  });

  describe('undoPendingDelete', () => {
    it('calls updateTodo(id, { deletedAt: null }) and clears state when a toast is pending', async () => {
      useUIStore.getState().showUndoToast('xyz', 'Walk dog');
      await useUIStore.getState().undoPendingDelete();

      expect(mockUpdateTodo).toHaveBeenCalledTimes(1);
      expect(mockUpdateTodo).toHaveBeenCalledWith('xyz', { deletedAt: null });
      expect(useUIStore.getState().undoPendingTodo).toBeNull();
    });

    it('resolves without calling updateTodo when no toast is pending', async () => {
      expect(useUIStore.getState().undoPendingTodo).toBeNull();
      await expect(useUIStore.getState().undoPendingDelete()).resolves.toBeUndefined();
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });

    it('catches updateTodo rejection without throwing', async () => {
      mockUpdateTodo.mockRejectedValueOnce(new Error('boom'));
      useUIStore.getState().showUndoToast('xyz', 'Walk dog');

      await expect(useUIStore.getState().undoPendingDelete()).resolves.toBeUndefined();
      expect(mockUpdateTodo).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().undoPendingTodo).toBeNull();
    });
  });
});
