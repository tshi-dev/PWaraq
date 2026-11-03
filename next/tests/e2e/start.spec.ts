import { test, expect } from '@playwright/test';
import { choose, fixture } from './helpers';

const names = {
  en: ['Sign', 'Portfolio', 'Scan to text', 'Combine', 'Fill a form', 'Share safely', 'Drawings', 'Review'],
  ar: ['توقيع', 'حافظة', 'من مسح ضوئي إلى نص', 'دمج', 'تعبئة نموذج', 'مشاركة آمنة', 'الرسومات', 'مراجعة'],
};

for (const lang of ['en', 'ar'] as const) {
  test(`start screen: the eight mode tiles are visible and one column on a phone (${lang})`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
    await page.goto('/');
    const tiles = page.locator('.mode');
    await expect(tiles).toHaveCount(8);
    for (const [i, n] of names[lang].entries()) await expect(tiles.nth(i).locator('strong')).toHaveText(n);
    await expect(tiles.first()).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    const xs = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(1); // one column
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('start screen: Sign and Scan to text open the file in their task', async ({ page }) => {
  await page.goto('/');
  await choose(page, () => page.locator('.mode[data-task=sign]').click(), [fixture('small.pdf')]);
  await expect(page.locator('.task.on')).toHaveText(/Sign/, { timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.mode[data-task=ocr]').click(), [fixture('small.pdf')]);
  await expect(page.getByRole('button', { name: 'Add searchable text' })).toBeVisible({ timeout: 30_000 });
});

test('start screen: Combine opens the first file in Organize with the other files added', async ({ page }) => {
  await page.goto('/');
  await choose(page, () => page.locator('.mode[data-task=organize]').click(), [fixture('small.pdf'), fixture('three.pdf')]);
  await expect(page.locator('.count').first()).toHaveText('3 selected', { timeout: 30_000 }); // three.pdf's pages were added after small.pdf and are selected
});
