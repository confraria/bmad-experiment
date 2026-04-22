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

test.describe('Story 2.1 — Mark todos complete with tap/Space', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('AC #1 + #3 + #4 + #6: mobile tap marks a todo complete and keeps it visible after reload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only tap assertion');

    await addTodo(page, 'Morning run');

    const row = page.getByRole('button', { name: 'Morning run' });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await row.click();

    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toHaveClass(/line-through/);
    await expect(row).toHaveClass(/opacity-60/);

    await expect.poll(async () => {
      const todo = (await readTodos(page)).find((entry) => entry.text === 'Morning run');
      return todo?.completed ?? false;
    }).toBe(true);

    await page.reload();

    const reloadedRow = page.getByRole('button', { name: 'Morning run' });
    await expect(reloadedRow).toHaveAttribute('aria-pressed', 'true');
    await expect(reloadedRow).toHaveClass(/line-through/);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('AC #2 + #3: desktop Space toggles a focused row complete and back to active', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only keyboard assertion');

    await addTodo(page, 'Update docs');

    const row = page.getByRole('button', { name: 'Update docs' });
    await row.focus();
    await row.press('Space');

    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toHaveClass(/line-through/);
    await expect.poll(async () => {
      const todo = (await readTodos(page)).find((entry) => entry.text === 'Update docs');
      return todo?.completed ?? false;
    }).toBe(true);

    await row.press('Space');

    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await expect(row).not.toHaveClass(/line-through/);
    await expect.poll(async () => {
      const todo = (await readTodos(page)).find((entry) => entry.text === 'Update docs');
      return todo?.completed ?? true;
    }).toBe(false);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
});
