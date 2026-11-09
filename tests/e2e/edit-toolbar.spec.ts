import { test, expect } from '@playwright/test';
import { open, fixture } from './helpers';

// Edit toolbar at a 1366 px laptop (English and Arabic): every tool and "Save page" share one row.
for (const [lang, edit] of [['en', 'Edit'], ['ar', 'تحرير']])
  test(`edit toolbar is one row at 1366 px (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
    await open(page, fixture('small.pdf'));
    await page.getByRole('button', { name: edit, exact: true }).click();
    const tools = page.locator('.editor .tools');
    await expect(tools).toBeVisible({ timeout: 20_000 });
    const ys = await tools.locator('> *').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().width > 2).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(20);
    await expect(tools.locator('.btn.primary')).toBeVisible();
  });
