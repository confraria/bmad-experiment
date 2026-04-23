import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const mockSoftDeleteTodo = vi.fn().mockResolvedValue(undefined);
const mockUpdateTodo = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  softDeleteTodo: (...args: unknown[]) => mockSoftDeleteTodo(...args),
  updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
}));

import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useUIStore } from '@/stores/useUIStore';

function Harness() {
  useKeyboardShortcuts();
  return null;
}

function Fixture({ children }: { children?: React.ReactNode }) {
  // Auto-focus nothing by default; tests can focus explicitly.
  return (
    <div>
      <input id="add-todo-input" data-testid="add-input" />
      <ul>
        <li data-todo-id="ulid-1">
          <button type="button">first</button>
        </li>
        <li data-todo-id="ulid-2">
          <button type="button">second</button>
        </li>
      </ul>
      {children}
      <Harness />
    </div>
  );
}

function createMatchMedia(matches: boolean) {
  return (query: string) => ({
    matches: query === '(min-width: 1024px)' ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

function stubDesktop() {
  vi.stubGlobal('matchMedia', createMatchMedia(true));
}

function stubMobile() {
  vi.stubGlobal('matchMedia', createMatchMedia(false));
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    mockSoftDeleteTodo.mockClear().mockResolvedValue(undefined);
    mockUpdateTodo.mockClear().mockResolvedValue(undefined);
    useUIStore.setState({ undoPendingTodo: null, helpOverlayOpen: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('desktop viewport', () => {
    beforeEach(() => stubDesktop());

    it('j moves focus across rows (clamp at end)', () => {
      const { container } = render(<Fixture />);
      const buttons = container.querySelectorAll<HTMLButtonElement>('[data-todo-id] button');
      expect(buttons.length).toBe(2);

      // No row focused → j focuses first
      fireEvent.keyDown(window, { key: 'j' });
      expect(document.activeElement).toBe(buttons[0]);

      // j again → second
      fireEvent.keyDown(window, { key: 'j' });
      expect(document.activeElement).toBe(buttons[1]);

      // j again → clamp (still second)
      fireEvent.keyDown(window, { key: 'j' });
      expect(document.activeElement).toBe(buttons[1]);
    });

    it('k moves focus backward (clamp at start; no-row focuses last)', () => {
      const { container } = render(<Fixture />);
      const buttons = container.querySelectorAll<HTMLButtonElement>('[data-todo-id] button');

      // No row focused → k focuses LAST
      fireEvent.keyDown(window, { key: 'k' });
      expect(document.activeElement).toBe(buttons[1]);

      // k → first
      fireEvent.keyDown(window, { key: 'k' });
      expect(document.activeElement).toBe(buttons[0]);

      // k → clamp (still first)
      fireEvent.keyDown(window, { key: 'k' });
      expect(document.activeElement).toBe(buttons[0]);
    });

    it('j with zero rows is a no-op', () => {
      render(
        <div>
          <Harness />
        </div>,
      );
      expect(() => fireEvent.keyDown(window, { key: 'j' })).not.toThrow();
    });

    it('n focuses the add input', () => {
      const { container } = render(<Fixture />);
      const input = container.querySelector<HTMLInputElement>('#add-todo-input')!;
      expect(document.activeElement).not.toBe(input);

      fireEvent.keyDown(window, { key: 'n' });
      expect(document.activeElement).toBe(input);
    });

    it('? calls toggleHelpOverlay', () => {
      render(<Fixture />);
      expect(useUIStore.getState().helpOverlayOpen).toBe(false);

      fireEvent.keyDown(window, { key: '?', shiftKey: true });
      expect(useUIStore.getState().helpOverlayOpen).toBe(true);

      fireEvent.keyDown(window, { key: '?', shiftKey: true });
      expect(useUIStore.getState().helpOverlayOpen).toBe(false);
    });

    it('Cmd+Z with pending undo calls updateTodo and clears pending', async () => {
      render(<Fixture />);
      useUIStore.getState().showUndoToast('ulid-1', 'first');
      expect(useUIStore.getState().undoPendingTodo).not.toBeNull();

      fireEvent.keyDown(window, { key: 'z', metaKey: true });

      await vi.waitFor(() => {
        expect(mockUpdateTodo).toHaveBeenCalledWith('ulid-1', { deletedAt: null });
      });
      expect(useUIStore.getState().undoPendingTodo).toBeNull();
    });

    it('Cmd+Z with no pending undo is a no-op', () => {
      render(<Fixture />);
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });

    it('Cmd+Shift+Z does NOT trigger undo (redo reservation)', () => {
      render(<Fixture />);
      useUIStore.getState().showUndoToast('ulid-1', 'first');
      fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
      expect(mockUpdateTodo).not.toHaveBeenCalled();
      expect(useUIStore.getState().undoPendingTodo).not.toBeNull();
    });

    it('Ctrl+Z also triggers undo (Windows/Linux)', async () => {
      render(<Fixture />);
      useUIStore.getState().showUndoToast('ulid-2', 'second');

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

      await vi.waitFor(() => {
        expect(mockUpdateTodo).toHaveBeenCalledWith('ulid-2', { deletedAt: null });
      });
    });

    it('Cmd+Backspace on focused row calls softDeleteTodo + showUndoToast and preventDefaults', () => {
      const { container } = render(<Fixture />);
      const firstBtn = container.querySelector<HTMLButtonElement>('[data-todo-id="ulid-1"] button')!;
      firstBtn.focus();

      const prevented = !fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
      expect(prevented).toBe(true);

      expect(mockSoftDeleteTodo).toHaveBeenCalledWith('ulid-1');
      expect(useUIStore.getState().undoPendingTodo).toEqual({ id: 'ulid-1', text: 'first' });
    });

    it('Cmd+Backspace outside a row is a no-op and does NOT preventDefault', () => {
      render(<Fixture />);
      // document.body is focused by default
      const prevented = !fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
      expect(prevented).toBe(false);
      expect(mockSoftDeleteTodo).not.toHaveBeenCalled();
    });

    it('Cmd+Shift+Backspace does NOT delete', () => {
      const { container } = render(<Fixture />);
      const firstBtn = container.querySelector<HTMLButtonElement>('[data-todo-id="ulid-1"] button')!;
      firstBtn.focus();

      fireEvent.keyDown(window, { key: 'Backspace', metaKey: true, shiftKey: true });
      expect(mockSoftDeleteTodo).not.toHaveBeenCalled();
    });

    describe('input suppression', () => {
      it('j/k/n/? do nothing when input is focused', () => {
        const { container } = render(<Fixture />);
        const input = container.querySelector<HTMLInputElement>('#add-todo-input')!;
        const buttons = container.querySelectorAll<HTMLButtonElement>('[data-todo-id] button');
        input.focus();
        expect(document.activeElement).toBe(input);

        fireEvent.keyDown(window, { key: 'j' });
        expect(document.activeElement).toBe(input);

        fireEvent.keyDown(window, { key: 'k' });
        expect(document.activeElement).toBe(input);

        fireEvent.keyDown(window, { key: 'n' });
        expect(document.activeElement).toBe(input);

        fireEvent.keyDown(window, { key: '?', shiftKey: true });
        expect(useUIStore.getState().helpOverlayOpen).toBe(false);
        expect(document.activeElement).toBe(input);

        // Sanity: neither button is focused
        expect(document.activeElement).not.toBe(buttons[0]);
        expect(document.activeElement).not.toBe(buttons[1]);
      });

      it('Cmd+Backspace and Cmd+Z are suppressed in inputs (let browser native win)', () => {
        const { container } = render(<Fixture />);
        const input = container.querySelector<HTMLInputElement>('#add-todo-input')!;
        input.focus();

        // Pre-seed a pending undo so Cmd+Z would otherwise fire
        useUIStore.getState().showUndoToast('ulid-1', 'first');

        fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
        fireEvent.keyDown(window, { key: 'z', metaKey: true });

        expect(mockSoftDeleteTodo).not.toHaveBeenCalled();
        expect(mockUpdateTodo).not.toHaveBeenCalled();
      });
    });
  });

  describe('mobile viewport', () => {
    beforeEach(() => stubMobile());

    it('listener never attached; j/n/Cmd+Backspace all no-op', () => {
      const { container } = render(<Fixture />);
      const firstBtn = container.querySelector<HTMLButtonElement>('[data-todo-id="ulid-1"] button')!;
      firstBtn.focus();

      fireEvent.keyDown(window, { key: 'j' });
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
      fireEvent.keyDown(window, { key: 'z', metaKey: true });

      // Focus unchanged (still on first button)
      expect(document.activeElement).toBe(firstBtn);
      expect(mockSoftDeleteTodo).not.toHaveBeenCalled();
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });
  });

  it('cleanup removes listener on unmount', () => {
    stubDesktop();
    const { unmount, container } = render(<Fixture />);
    const buttons = container.querySelectorAll<HTMLButtonElement>('[data-todo-id] button');

    // Works before unmount
    fireEvent.keyDown(window, { key: 'j' });
    expect(document.activeElement).toBe(buttons[0]);

    unmount();

    // After unmount: blur, then j should not move focus back to a removed button
    // (buttons are detached; verify softDelete path too)
    fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
    expect(mockSoftDeleteTodo).not.toHaveBeenCalled();
  });
});
