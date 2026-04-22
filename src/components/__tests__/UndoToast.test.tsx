import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UndoToast } from '../UndoToast';

const mockDismissUndoToast = vi.fn();
const mockUpdateTodo = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: vi.fn(),
}));

import { useUIStore } from '@/stores/useUIStore';

function setStoreState(undoPendingTodo: { id: string; text: string } | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: any) => unknown) =>
    selector({ undoPendingTodo, dismissUndoToast: mockDismissUndoToast }),
  );
}

describe('UndoToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when undoPendingTodo is null', () => {
    setStoreState(null);
    const { container } = render(<UndoToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the toast container when undoPendingTodo is set', () => {
    setStoreState({ id: '1', text: 'Buy milk' });
    render(<UndoToast />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('displays the todo text', () => {
    setStoreState({ id: '1', text: 'Buy milk' });
    render(<UndoToast />);
    expect(screen.getByText('Buy milk')).toBeTruthy();
  });

  it('renders an Undo button', () => {
    setStoreState({ id: '1', text: 'Buy milk' });
    render(<UndoToast />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('clicking Undo calls dismissUndoToast and updateTodo with deletedAt null', async () => {
    setStoreState({ id: 'abc', text: 'Buy milk' });
    render(<UndoToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mockDismissUndoToast).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mockUpdateTodo).toHaveBeenCalledWith('abc', { deletedAt: null }));
  });

  it('does not render a close button', () => {
    setStoreState({ id: '1', text: 'Buy milk' });
    render(<UndoToast />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Undo');
  });
});
