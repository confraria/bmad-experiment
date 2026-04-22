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
    return new Promise<Array<{ text: string; completed: boolean; deletedAt: number | null; id: string; clientId: string }>>((resolve, reject) => {
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

test.describe('Story 1.3 — Add todos via persistent input', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('AC #1: mobile — input is bottom-pinned with correct placeholder and ≥44px tap target', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only layout assertion');

    const input = page.locator('#add-todo-input');
    await expect(input).toHaveAttribute('placeholder', 'Add a task…');

    const geometry = await page.evaluate(() => {
      const input = document.querySelector('#add-todo-input') as HTMLInputElement;
      const form = input.closest('form') as HTMLFormElement;
      const ir = input.getBoundingClientRect();
      const fr = form.getBoundingClientRect();
      return {
        formPosition: getComputedStyle(form).position,
        formBottom: fr.bottom,
        viewportHeight: window.innerHeight,
        inputHeight: ir.height,
      };
    });

    expect(geometry.formPosition).toBe('fixed');
    expect(geometry.formBottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 1);
    expect(geometry.inputHeight).toBeGreaterThanOrEqual(44);
  });

  test('AC #2: desktop — input is at top of content column, auto-focused', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only layout assertion');

    const input = page.locator('#add-todo-input');
    await expect(input).toBeFocused();

    const geometry = await page.evaluate(() => {
      const input = document.querySelector('#add-todo-input') as HTMLInputElement;
      const form = input.closest('form') as HTMLFormElement;
      const r = input.getBoundingClientRect();
      return {
        formPosition: getComputedStyle(form).position,
        inputTop: r.top,
        inputWidth: r.width,
      };
    });

    expect(geometry.formPosition).toBe('static');
    expect(geometry.inputTop).toBeLessThan(100);
    expect(geometry.inputWidth).toBeLessThanOrEqual(600);
  });

  test('AC #3: submit writes to Dexie, clears input, retains focus, and renders in the list', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    await input.click();
    await input.fill('Buy milk');
    await input.press('Enter');

    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();

    await expect.poll(async () => (await readTodos(page)).length).toBe(1);

    const rows = await readTodos(page);
    expect(rows[0].text).toBe('Buy milk');
    expect(rows[0].completed).toBe(false);
    expect(rows[0].deletedAt).toBeNull();
    expect(rows[0].id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(rows[0].clientId).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    // Story 1.4: new item visible in the list
    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveText('Buy milk');
  });

  test('AC #3: leading/trailing whitespace is trimmed before writing', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    await input.click();
    await input.fill('  buy eggs  ');
    await input.press('Enter');

    await expect.poll(async () => (await readTodos(page)).length).toBe(1);
    const rows = await readTodos(page);
    expect(rows[0].text).toBe('buy eggs');
  });

  test('AC #4: empty Enter is a no-op — no Dexie write, no error', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const input = page.locator('#add-todo-input');
    await input.click();
    await input.press('Enter');

    await expect(input).toHaveValue('');

    await page.waitForTimeout(200);
    const rows = await readTodos(page);
    expect(rows).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });

  test('AC #4: whitespace-only Enter is a no-op', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    await input.click();
    await input.fill('     ');
    await input.press('Enter');

    await page.waitForTimeout(200);
    const rows = await readTodos(page);
    expect(rows).toHaveLength(0);
  });
});
