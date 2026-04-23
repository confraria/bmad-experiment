import { test, expect, type Page } from '@playwright/test';

async function resetAppState(page: Page) {
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

async function addTodo(page: Page, text: string) {
  const input = page.locator('#add-todo-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

// Playwright's 'ControlOrMeta' modifier maps to Meta on macOS, Control elsewhere.
const MOD = 'ControlOrMeta' as const;

test.describe('Story 4.1 — Keyboard shortcuts on desktop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only shortcuts');
    await resetAppState(page);
  });

  test('j navigates forward across rows (seed 3 → press j 3x → third row focused)', async ({ page }) => {
    // Newest-first order means the third-added todo is at index 0 and the first-added is at index 2.
    await addTodo(page, 'one');
    await addTodo(page, 'two');
    await addTodo(page, 'three');

    await expect(page.locator('[data-todo-id]')).toHaveCount(3);

    // Blur the input first so j is not suppressed.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('j');

    const thirdRowBtn = page.locator('[data-todo-id]').nth(2).locator('button');
    await expect(thirdRowBtn).toBeFocused();
  });

  test('Cmd/Ctrl+Backspace on focused row deletes and shows undo toast; Cmd/Ctrl+Z restores', async ({ page }) => {
    await addTodo(page, 'first');
    await addTodo(page, 'second');
    await expect(page.locator('[data-todo-id]')).toHaveCount(2);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Focus first row with j
    await page.keyboard.press('j');
    const firstRow = page.locator('[data-todo-id]').nth(0).locator('button');
    await expect(firstRow).toBeFocused();
    const deletedText = await firstRow.textContent();

    // Cmd/Ctrl+Backspace deletes
    await page.keyboard.press(`${MOD}+Backspace`);

    await expect(page.locator('[data-todo-id]')).toHaveCount(1);
    const toast = page.getByRole('status');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(deletedText ?? '');

    // Cmd/Ctrl+Z restores
    await page.keyboard.press(`${MOD}+z`);
    await expect(page.locator('[data-todo-id]')).toHaveCount(2);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('input suppression: typing j in the add input inserts the letter and does not steal focus', async ({ page }) => {
    await addTodo(page, 'one');
    await addTodo(page, 'two');

    const input = page.locator('#add-todo-input');
    await input.click();
    await input.fill('');
    await expect(input).toBeFocused();

    await page.keyboard.press('j');

    await expect(input).toHaveValue('j');
    await expect(input).toBeFocused();

    // No row should have focus
    const anyRowFocused = await page.evaluate(() =>
      !!document.activeElement?.closest('[data-todo-id]'),
    );
    expect(anyRowFocused).toBe(false);
  });
});
