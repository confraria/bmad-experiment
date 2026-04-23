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

async function openOverlay(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+Slash');
}

test.describe('Story 4.2 — Help overlay (desktop)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only shortcuts');
    await resetAppState(page);
  });

  test('? opens the overlay with title and shortcut rows', async ({ page }) => {
    await addTodo(page, 'one');
    await addTodo(page, 'two');

    await openOverlay(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Keyboard shortcuts');
    await expect(dialog).toContainText('Move focus to next todo');
    await expect(dialog).toContainText('Toggle this help');
  });

  test('Escape closes the overlay', async ({ page }) => {
    await addTodo(page, 'one');
    await openOverlay(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('? toggles closed when already open', async ({ page }) => {
    await addTodo(page, 'one');
    await openOverlay(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('clicking the overlay backdrop closes the overlay', async ({ page }) => {
    await addTodo(page, 'one');
    await openOverlay(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click coordinates far from the centered content box (which is ~420px wide, centered).
    // At 1440x900 the content spans roughly (510, 330) to (930, 570). Click at (10, 10).
    await page.mouse.click(10, 10);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('j does not move focus into list rows while overlay is open', async ({ page }) => {
    await addTodo(page, 'one');
    await addTodo(page, 'two');
    await openOverlay(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('j');

    const rowFocused = await page.evaluate(
      () => !!document.activeElement?.closest('[data-todo-id]'),
    );
    expect(rowFocused).toBe(false);
    // Overlay is still open (no accidental close)
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Story 4.2 — Help overlay (mobile)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile negative case');
    await resetAppState(page);
  });

  test('? does not trigger the overlay on mobile (hook is not attached)', async ({ page }) => {
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
