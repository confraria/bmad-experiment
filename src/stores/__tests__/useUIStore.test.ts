import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUIStore } from '../useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.getState().dismissUndoToast();
    useUIStore.setState({ undoPendingTodo: null });
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
});
