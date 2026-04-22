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

test.describe('Story 1.4 — View active todos as a live list', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('AC #1: submissions stack in newest-first order', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    await input.click();

    for (const text of ['one', 'two', 'three']) {
      await input.fill(text);
      await input.press('Enter');
      await expect(input).toHaveValue('');
    }

    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('three');
    await expect(items.nth(1)).toHaveText('two');
    await expect(items.nth(2)).toHaveText('one');
  });

  test('AC #3: reload persists the list in newest-first order without flash', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    await input.click();
    for (const text of ['alpha', 'beta', 'gamma']) {
      await input.fill(text);
      await input.press('Enter');
      await expect(input).toHaveValue('');
    }

    await expect(page.getByRole('listitem')).toHaveCount(3);

    await page.reload();

    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('gamma');
    await expect(items.nth(1)).toHaveText('beta');
    await expect(items.nth(2)).toHaveText('alpha');
  });

  test('AC #3: empty SSR shell hydrates without a React hydration mismatch warning', async ({ page }) => {
    const hydrationWarnings: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || msg.type() === 'warning') {
        if (/hydrat/i.test(text)) hydrationWarnings.push(text);
      }
    });

    await resetAppState(page);

    const input = page.locator('#add-todo-input');
    await input.click();
    await input.fill('hydration test');
    await input.press('Enter');
    await expect(page.getByRole('listitem')).toHaveCount(1);

    expect(hydrationWarnings, hydrationWarnings.join('\n')).toHaveLength(0);
  });

  test('Story 1.5 AC #1 + #2: empty state renders NOTHING where the list would be', async ({ page }) => {
    // No <ul>, no <li>, no progressbar — the AddTodoInput is the entire empty state.
    await expect(page.getByRole('list', { name: 'Todos' })).toHaveCount(0);
    await expect(page.getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    // The input surface IS the empty state and must be present.
    await expect(page.locator('#add-todo-input')).toBeVisible();
  });

  test('Story 1.5 AC #3: adding the first todo does not shift the input', async ({ page }) => {
    const input = page.locator('#add-todo-input');
    const before = await input.boundingBox();
    expect(before).not.toBeNull();

    await input.click();
    await input.fill('first ever todo');
    await input.press('Enter');

    await expect(page.getByRole('listitem')).toHaveCount(1);

    const after = await input.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs((after!.x) - (before!.x))).toBeLessThan(0.5);
    expect(Math.abs((after!.y) - (before!.y))).toBeLessThan(0.5);
    expect(Math.abs((after!.width) - (before!.width))).toBeLessThan(0.5);
    expect(Math.abs((after!.height) - (before!.height))).toBeLessThan(0.5);
  });
});
