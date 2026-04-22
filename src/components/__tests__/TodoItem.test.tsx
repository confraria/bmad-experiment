import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { TodoItem } from '../TodoItem';
import type { Todo } from '@/lib/schema';

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
  afterEach(() => cleanup());

  it('renders an <li> with the todo text', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo({ text: 'buy milk' })} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toBeDefined();
    expect(item.tagName).toBe('LI');
    expect(item.textContent).toContain('buy milk');
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

  it('does not render a checkbox, button, or other interactive affordance', () => {
    render(
      <ul>
        <TodoItem todo={makeTodo()} />
      </ul>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('wraps long text without horizontal overflow', () => {
    const longText = 'a'.repeat(300);
    render(
      <ul>
        <TodoItem todo={makeTodo({ text: longText })} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item.className).toMatch(/break-words/);
    expect(item.textContent).toBe(longText);
  });
});
