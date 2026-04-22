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

test.describe('Story 3.5 — Online/offline detection and indicator', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  // getByRole excludes aria-hidden="true" by default. The dot is always mounted
  // (aria-hidden toggles with online state), so we locate by aria-label which
  // is always present regardless of aria-hidden.
  const dotLocator = (page: import('@playwright/test').Page) =>
    page.locator('[aria-label="Offline"]');

  test('AC #3: offline dot appears when the browser goes offline', async ({ page, context }) => {
    const dot = dotLocator(page);

    // Online by default — dot is faded out
    await expect(dot).toHaveCSS('opacity', '0');

    await context.setOffline(true);

    // Wait for the fade-in to complete (≤200ms)
    await expect(dot).toHaveCSS('opacity', '1');
  });

  test('AC #3: offline dot disappears when the browser comes back online', async ({ page, context }) => {
    const dot = dotLocator(page);

    await context.setOffline(true);
    await expect(dot).toHaveCSS('opacity', '1');

    await context.setOffline(false);

    await expect(dot).toHaveCSS('opacity', '0');
  });

  test('AC #8: CRUD still works while offline; todo persists after reload', async ({ page, context }) => {
    await context.setOffline(true);

    const input = page.getByPlaceholder('Add a task…');
    await input.fill('write while offline');
    await input.press('Enter');

    await expect(page.getByText('write while offline')).toBeVisible();

    // Come back online so the dev server's /api/sync pull can complete on reload
    await context.setOffline(false);
    await page.reload();

    await expect(page.getByText('write while offline')).toBeVisible();
  });

  test('AC #3: dot uses a 6x6 px footprint (6x6 CSS pixels = h-1.5 w-1.5)', async ({ page, context }) => {
    await context.setOffline(true);
    const dot = dotLocator(page);
    await expect(dot).toHaveCSS('opacity', '1');
    const box = await dot.boundingBox();
    expect(box?.width).toBe(6);
    expect(box?.height).toBe(6);
  });
});
