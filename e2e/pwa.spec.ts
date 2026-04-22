import { test, expect } from '@playwright/test';

test.describe('Story 3.6 — PWA installability', () => {
  test('manifest.webmanifest is served and valid', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('bmad-experiment');
    expect(json.short_name).toBe('bmad');
    expect(json.start_url).toBe('/');
    expect(json.display).toBe('standalone');
    expect(json.theme_color).toBe('#fafafa');
    expect(json.background_color).toBe('#fafafa');
    const sizes = (json.icons as Array<{ sizes: string; purpose?: string }>).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const maskable = (json.icons as Array<{ purpose?: string }>).find((i) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
  });

  test('referenced icons are served as PNG', async ({ request }) => {
    const urls = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
    for (const url of urls) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('rendered HTML includes <link rel="manifest"> and theme-color meta', async ({ page }) => {
    await page.goto('/');
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestLink).toBe('/manifest.webmanifest');
    const themeMeta = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeMeta).toBe('#fafafa');
  });
});
