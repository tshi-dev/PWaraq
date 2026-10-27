import { test, expect } from '@playwright/test';

// Installable web app: valid manifest, the worker takes over, and the app opens with no network after one visit. Run with PREVIEW=1 (the built app).
test('manifest is valid and the app opens offline after one load', async ({ page, context }) => {
  test.skip(!process.env.PREVIEW, 'needs the built app (PREVIEW=1)');
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const m = await (await page.request.get(new URL(href!, page.url()).href)).json();
  expect(m).toMatchObject({ short_name: 'Waraq', display: 'standalone', background_color: '#fafbf8', theme_color: '#15775d' });
  expect(m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ?? ''}`)).toEqual(['192x192', '512x512', '512x512maskable']);
  for (const i of m.icons) expect((await page.request.get(new URL(i.src, page.url()).href)).ok()).toBe(true);
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveCount(1);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker; its cache fills while the page loads
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByRole('button', { name: 'Open a PDF' }).or(page.locator('.start .btn.primary'))).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.start .btn.primary')).toBeVisible();
  const keys = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map((r) => new URL(r.url).pathname));
  expect(keys.some((k) => /\.wasm$/.test(k))).toBe(true);
  expect(keys.some((k) => /\.pdf$|^blob/.test(k))).toBe(false);
});
