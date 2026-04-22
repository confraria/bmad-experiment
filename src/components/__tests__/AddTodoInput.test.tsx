import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const putTodoMock = vi.fn();

vi.mock('@/lib/db', () => ({
  putTodo: (...args: unknown[]) => putTodoMock(...args),
}));

import { AddTodoInput } from '../AddTodoInput';

describe('AddTodoInput', () => {
  beforeEach(() => {
    putTodoMock.mockReset();
    putTodoMock.mockImplementation(async ({ text }: { text: string }) => ({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      clientId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      text,
      completed: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a text input with the expected placeholder', () => {
    render(<AddTodoInput />);
    const input = screen.getByPlaceholderText('Add a task…');
    expect(input).toBeDefined();
    expect(input.tagName).toBe('INPUT');
  });

  it('has an accessible name "Add a task"', () => {
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    expect(input).toBeDefined();
  });

  it('typing updates the controlled input value', async () => {
    const user = userEvent.setup();
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i }) as HTMLInputElement;
    await user.type(input, 'buy milk');
    expect(input.value).toBe('buy milk');
  });

  it('Enter submit calls putTodo once with trimmed text, clears input, retains focus', async () => {
    const user = userEvent.setup();
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i }) as HTMLInputElement;

    await user.click(input);
    await user.type(input, '  buy milk  {Enter}');

    expect(putTodoMock).toHaveBeenCalledTimes(1);
    expect(putTodoMock).toHaveBeenCalledWith({ text: 'buy milk' });
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('Enter with empty text does not call putTodo', async () => {
    const user = userEvent.setup();
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(putTodoMock).not.toHaveBeenCalled();
  });

  it('Enter with whitespace-only text does not call putTodo', async () => {
    const user = userEvent.setup();
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    await user.click(input);
    await user.type(input, '   {Enter}');
    expect(putTodoMock).not.toHaveBeenCalled();
  });

  it('preserves input value and logs error when putTodo rejects', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    putTodoMock.mockRejectedValueOnce(new Error('quota exceeded'));

    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i }) as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'retry me{Enter}');

    expect(putTodoMock).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('retry me');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('auto-focuses on mount when viewport matches lg breakpoint', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    expect(document.activeElement).toBe(input);
  });

  it('does NOT auto-focus on mount below the lg breakpoint', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    expect(document.activeElement).not.toBe(input);
  });
});
