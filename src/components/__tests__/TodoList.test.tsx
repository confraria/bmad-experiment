import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { TodoList } from '../TodoList';
import { getDb, putTodo, resetDbForTests } from '@/lib/db';
import { resetClientIdForTests } from '@/lib/clientId';
import { newUlid } from '@/lib/ulid';

async function seedTodo(overrides: Partial<{
  text: string;
  completed: boolean;
  deletedAt: number | null;
}> = {}) {
  return putTodo({
    text: overrides.text ?? 'seeded',
    completed: overrides.completed,
    deletedAt: overrides.deletedAt,
  });
}

describe('TodoList', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    resetClientIdForTests();
    await resetDbForTests();
  });

  afterEach(async () => {
    await resetDbForTests();
    resetClientIdForTests();
    cleanup();
  });

  it('renders NOTHING when Dexie is empty (Story 1.5)', async () => {
    const { container } = render(<TodoList />);
    await waitFor(() => {
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
    expect(container.firstChild).toBeNull();
  });

  it('transitions cleanly between empty and populated as Dexie changes', async () => {
    render(<TodoList />);

    await waitFor(() => {
      expect(screen.queryByRole('list')).toBeNull();
    });

    await seedTodo({ text: 'hello' });

    await waitFor(() => {
      expect(screen.queryByRole('list', { name: 'Todos' })).not.toBeNull();
      expect(screen.queryAllByRole('listitem')).toHaveLength(1);
    });

    const [row] = await getDb().todos.toArray();
    await getDb().todos.delete(row.id);

    await waitFor(() => {
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
  });

  it('renders seeded todos in newest-first order', async () => {
    await seedTodo({ text: 'one' });
    await new Promise((r) => setTimeout(r, 2));
    await seedTodo({ text: 'two' });
    await new Promise((r) => setTimeout(r, 2));
    await seedTodo({ text: 'three' });

    render(<TodoList />);

    await waitFor(() => {
      expect(screen.queryAllByRole('listitem')).toHaveLength(3);
    });

    expect(screen.getByRole('list', { name: 'Todos' })).toBeDefined();

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['three', 'two', 'one']);
  });

  it('reacts to a fresh write after render — new item appears at the top', async () => {
    await seedTodo({ text: 'first' });
    render(<TodoList />);

    await waitFor(() => {
      expect(screen.queryAllByRole('listitem')).toHaveLength(1);
    });

    await new Promise((r) => setTimeout(r, 2));
    await seedTodo({ text: 'second' });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem').map((li) => li.textContent);
      expect(items).toEqual(['second', 'first']);
    });
  });

  it('renders completed-but-not-deleted todos in the same list', async () => {
    await seedTodo({ text: 'active' });
    await new Promise((r) => setTimeout(r, 2));
    await seedTodo({ text: 'already-done', completed: true });

    render(<TodoList />);

    await waitFor(() => {
      expect(screen.queryAllByRole('listitem')).toHaveLength(2);
    });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['already-done', 'active']);
  });

  it('excludes soft-deleted todos from the list', async () => {
    await seedTodo({ text: 'visible' });
    const now = Date.now();
    await getDb().todos.put({
      id: newUlid(),
      clientId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      text: 'tombstoned',
      completed: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: now + 1,
    });

    render(<TodoList />);

    await waitFor(() => {
      expect(screen.queryAllByRole('listitem')).toHaveLength(1);
    });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['visible']);
  });
});
