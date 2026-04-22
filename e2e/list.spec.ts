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
      if (
        msg.type() === 'error' ||
        msg.type() === 'warning' ||
        msg.type() === 'warn'
      ) {
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

  test('AC #1: empty state renders an empty <ul> (no items, no spinner)', async ({ page }) => {
    const list = page.getByRole('list', { name: 'Active todos' });
    // Empty <ul> has zero height so Playwright treats it as "hidden" — we only
    // require it to be attached. Story 1.5 will add visible EmptyState content.
    await expect(list).toBeAttached();
    await expect(page.getByRole('listitem')).toHaveCount(0);
    // No loading spinner, no progressbar — architecture guardrail
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
});
