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
