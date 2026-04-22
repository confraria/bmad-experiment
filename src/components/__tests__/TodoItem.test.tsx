import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TodoItem } from '../TodoItem';
import type { Todo } from '@/lib/schema';
import { updateTodo, softDeleteTodo } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  updateTodo: vi.fn(),
  softDeleteTodo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('motion/react', () => ({
  animate: vi.fn().mockResolvedValue(undefined),
}));

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    clientId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    text: 'buy milk',
    completed: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    deletedAt: null,
    ...overrides,
  };
}

describe('TodoItem', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders an <li> containing a full-row button with the todo text', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo({ text: 'buy milk' })} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    const button = screen.getByRole('button', { name: 'buy milk' });
    expect(item).toBeDefined();
    expect(item.tagName).toBe('LI');
    expect(item.textContent).toContain('buy milk');
    expect(button).toBeDefined();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('exposes the todo id on the element for e2e selection', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item.getAttribute('data-todo-id')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('click toggles completion via updateTodo', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: 'buy milk' }));

    expect(updateTodo).toHaveBeenCalledTimes(1);
    expect(updateTodo).toHaveBeenCalledWith('01ARZ3NDEKTSV4RRFFQ69G5FAV', { completed: true });
  });

  it('Space on the focused row toggles completion', async () => {
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );

    const button = screen.getByRole('button', { name: 'buy milk' });
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });

    expect(updateTodo).toHaveBeenCalledTimes(1);
    expect(updateTodo).toHaveBeenCalledWith('01ARZ3NDEKTSV4RRFFQ69G5FAV', { completed: true });
  });

  it('does not render a checkbox control', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('wraps long text without horizontal overflow', () => {
    const longText = 'a'.repeat(300);
    render(
      <ul>
        <TodoItem todo={makeTodo({ text: longText })} />
      </ul>,
    );
    const button = screen.getByRole('button', { name: longText });
    expect(button.className).toMatch(/break-words/);
    expect(button.textContent).toBe(longText);
  });

  it('renders completed rows with pressed state and completed styling', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo({ completed: true })} />
      </ul>,
    );

    const button = screen.getByRole('button', { name: 'buy milk' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.className).toMatch(/line-through/);
    expect(button.className).toMatch(/text-muted-foreground/);
    expect(button.className).toMatch(/opacity-60/);
  });

  it('swipe past threshold calls softDeleteTodo', async () => {
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    const item = screen.getByRole('listitem');

    fireEvent.pointerDown(item, { clientX: 300 });
    fireEvent.pointerMove(item, { clientX: 100 }); // delta = -200, past 80px threshold
    fireEvent.pointerUp(item);

    await vi.waitFor(() => {
      expect(softDeleteTodo).toHaveBeenCalledWith('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    });
    expect(updateTodo).not.toHaveBeenCalled();
  });

  it('swipe below threshold does NOT call softDeleteTodo', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    const item = screen.getByRole('listitem');

    fireEvent.pointerDown(item, { clientX: 300 });
    fireEvent.pointerMove(item, { clientX: 260 }); // delta = -40, below 80px threshold
    fireEvent.pointerUp(item);

    expect(softDeleteTodo).not.toHaveBeenCalled();
  });

  it('click after non-swipe pointer sequence still calls updateTodo', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    const button = screen.getByRole('button', { name: 'buy milk' });

    // Minimal pointer sequence (< 5px displacement → isSwiping stays false)
    fireEvent.pointerDown(item, { clientX: 200 });
    fireEvent.pointerMove(item, { clientX: 202 });
    fireEvent.pointerUp(item);

    // isSwiping is reset to false, so click should call updateTodo
    await user.click(button);

    expect(updateTodo).toHaveBeenCalledTimes(1);
    expect(softDeleteTodo).not.toHaveBeenCalled();
  });
});
