import { test, expect } from '@playwright/test';

async function resetAppState(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    window.localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('bmad-experiment');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

async function readTodos(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    return new Promise<Array<{ text: string; completed: boolean; deletedAt: number | null; id: string }>>((resolve, reject) => {
      const req = indexedDB.open('bmad-experiment');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('todos')) {
          db.close();
          resolve([]);
          return;
        }
        const tx = db.transaction('todos');
        const all = tx.objectStore('todos').getAll();
        all.onsuccess = () => {
          db.close();
          resolve(all.result);
        };
        all.onerror = () => {
          db.close();
          reject(all.error);
        };
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function addTodo(page: import('@playwright/test').Page, text: string) {
  const input = page.locator('#add-todo-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

async function swipeTodo(
  page: import('@playwright/test').Page,
  todoId: string,
  deltaX: number,
) {
  const row = page.locator(`[data-todo-id="${todoId}"]`);
  const box = await row.boundingBox();
  if (!box) throw new Error(`No bounding box for todo ${todoId}`);

  const startX = box.x + box.width * 0.8;
  const startY = box.y + box.height / 2;
  const endX = startX + deltaX;

  await row.dispatchEvent('pointerdown', { clientX: startX, clientY: startY, pointerId: 1, bubbles: true });
  await row.dispatchEvent('pointermove', { clientX: startX - 10, clientY: startY, pointerId: 1, bubbles: true });
  await row.dispatchEvent('pointermove', { clientX: endX, clientY: startY, pointerId: 1, bubbles: true });
  await row.dispatchEvent('pointerup', { clientX: endX, clientY: startY, pointerId: 1, bubbles: true });
}

test.describe('Story 2.3 — Undo toast for deletions', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('AC #1: swipe past threshold shows UndoToast with todo text and Undo button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await addTodo(page, 'Read a book');
    const todos = await readTodos(page);
    const todo = todos.find((t) => t.text === 'Read a book');
    expect(todo).toBeDefined();

    await swipeTodo(page, todo!.id, -200);

    const toast = page.getByRole('status');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Read a book');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('AC #2: clicking Undo restores the todo to the list', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await addTodo(page, 'Call dentist');
    const todos = await readTodos(page);
    const todo = todos.find((t) => t.text === 'Call dentist');
    expect(todo).toBeDefined();

    await swipeTodo(page, todo!.id, -200);
    await expect(page.getByRole('status')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();

    // Toast disappears
    await expect(page.getByRole('status')).toHaveCount(0);

    // Item reappears in list
    await expect(page.getByRole('button', { name: 'Call dentist' })).toBeVisible();

    // Verify deletedAt is null in DB
    await expect.poll(async () => {
      const updated = await readTodos(page);
      const t = updated.find((entry) => entry.id === todo!.id);
      return t?.deletedAt;
    }).toBeNull();
  });

  test('AC #3: second delete replaces toast; prior deletion finalizes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await addTodo(page, 'Item A');
    await addTodo(page, 'Item B');

    const todos = await readTodos(page);
    const todoA = todos.find((t) => t.text === 'Item A');
    const todoB = todos.find((t) => t.text === 'Item B');
    expect(todoA).toBeDefined();
    expect(todoB).toBeDefined();

    // Swipe A — toast appears for A
    await swipeTodo(page, todoA!.id, -200);
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Item A');

    // Swipe B — toast should replace with B
    await swipeTodo(page, todoB!.id, -200);
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Item B');

    // Only one toast visible
    expect(await page.getByRole('status').count()).toBe(1);

    // A is still deleted (no undo was performed for A)
    await expect.poll(async () => {
      const updated = await readTodos(page);
      const t = updated.find((entry) => entry.id === todoA!.id);
      return t?.deletedAt;
    }).not.toBeNull();
  });

  test('AC #4: toast auto-dismisses after 5 seconds; item stays deleted', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await page.clock.install();
    // Re-navigate so the installed clock is active for the page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await addTodo(page, 'Cleanup garage');
    const todos = await readTodos(page);
    const todo = todos.find((t) => t.text === 'Cleanup garage');
    expect(todo).toBeDefined();

    await swipeTodo(page, todo!.id, -200);
    await expect(page.getByRole('status')).toBeVisible();

    // Advance clock by 5 seconds → auto-dismiss
    await page.clock.fastForward(5000);

    await expect(page.getByRole('status')).toHaveCount(0);

    // Item stays deleted
    await expect.poll(async () => {
      const updated = await readTodos(page);
      const t = updated.find((entry) => entry.id === todo!.id);
      return t?.deletedAt;
    }).not.toBeNull();
  });
});

test.describe('Story 2.2 — Delete todos via swipe (mobile)', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('AC #1 + #3: swipe past threshold soft-deletes todo, disappears from list, persists after reload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await addTodo(page, 'Buy groceries');
    await expect(page.getByRole('button', { name: 'Buy groceries' })).toBeVisible();

    const todos = await readTodos(page);
    const todo = todos.find((t) => t.text === 'Buy groceries');
    expect(todo).toBeDefined();
    const todoId = todo!.id;

    // Swipe far left past threshold (> 80px)
    await swipeTodo(page, todoId, -200);

    // Item disappears from list
    await expect(page.getByRole('button', { name: 'Buy groceries' })).toHaveCount(0);

    // After reload, item is still absent
    await page.reload();
    await expect(page.getByRole('button', { name: 'Buy groceries' })).toHaveCount(0);

    // deletedAt is set
    await expect.poll(async () => {
      const updated = await readTodos(page);
      const t = updated.find((entry) => entry.id === todoId);
      return t?.deletedAt;
    }).not.toBeNull();
  });

  test('AC #2: short swipe below threshold does NOT delete todo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only swipe');

    await addTodo(page, 'Short swipe todo');
    await expect(page.getByRole('button', { name: 'Short swipe todo' })).toBeVisible();

    const todos = await readTodos(page);
    const todo = todos.find((t) => t.text === 'Short swipe todo');
    expect(todo).toBeDefined();
    const todoId = todo!.id;

    // Swipe a small amount (< 80px threshold)
    await swipeTodo(page, todoId, -40);

    // Item still visible
    await expect(page.getByRole('button', { name: 'Short swipe todo' })).toBeVisible();

    // deletedAt remains null
    await expect.poll(async () => {
      const updated = await readTodos(page);
      const t = updated.find((entry) => entry.id === todoId);
      return t?.deletedAt;
    }).toBeNull();
  });
});
