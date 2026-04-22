import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AddTodoInput } from '../AddTodoInput';
import { getDb, resetDbForTests } from '@/lib/db';
import { resetClientIdForTests } from '@/lib/clientId';

describe('AddTodoInput — integration against fake-indexeddb', () => {
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

  it('writes exactly one Todo to Dexie on Enter (P0)', async () => {
    const user = userEvent.setup();
    render(<AddTodoInput />);
    const input = screen.getByRole('textbox', { name: /add a task/i });
    await user.click(input);
    await user.type(input, 'Buy milk{Enter}');

    const count = await getDb().todos.count();
    expect(count).toBe(1);
    const rows = await getDb().todos.toArray();
    expect(rows[0].text).toBe('Buy milk');
    expect(rows[0].completed).toBe(false);
    expect(rows[0].deletedAt).toBeNull();
    expect(rows[0].createdAt).toBe(rows[0].updatedAt);
  });
});
