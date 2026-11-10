// Zoom keeps every page in proportion: after Ctrl+wheel in/out cycles, the zoom buttons and a viewport resize, each page of a
// mixed-size file is its own PDF size times ONE common scale, and the fit-width scale comes back to the same number.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const mixed = path.join(import.meta.dirname, '..', 'fixtures', 'mixed.pdf');
const SIZES = [[595, 842], [842, 595], [300, 400], [1000, 400], [595, 842]];

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(mixed);
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 });
}
const widths = (page: Page) => page.locator('.scroller .page').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
const wheel = (page: Page, up: boolean) => page.locator('.scroller').evaluate((n, up) => {
  const r = n.getBoundingClientRect();
  n.dispatchEvent(new WheelEvent('wheel', { deltaY: up ? -120 : 120, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
}, up);
async function expectProportional(page: Page) {
  const w = await widths(page), s = w[0][0] / SIZES[0][0];
  w.forEach(([pw, ph], i) => { expect(Math.abs(pw / SIZES[i][0] - s)).toBeLessThan(0.01 * s + 0.01); expect(Math.abs(ph / SIZES[i][1] - s)).toBeLessThan(0.01 * s + 0.01); });
  return s;
}

test('Zoom: in/out cycles and a resize leave every mixed-size page in proportion, and fit width returns to the same size', async ({ page }) => {
  await open(page);
  const s0 = await expectProportional(page), first = await widths(page);
  for (let i = 0; i < 4; i++) { await wheel(page, true); await page.waitForTimeout(80); }
  expect(await expectProportional(page)).toBeGreaterThan(s0 * 1.5);
  for (let i = 0; i < 4; i++) { await wheel(page, false); await page.waitForTimeout(80); }
  await expectProportional(page);
  await page.keyboard.press('Control+2'); // fit width
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(400);
  await expectProportional(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect.poll(async () => (await widths(page))[0][0]).toBeCloseTo(first[0][0], 0);
  await expectProportional(page);
  // zoomed by number, then resized: the scale stays where it is
  await page.keyboard.press('Control+1');
  const s1 = await expectProportional(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(400);
  expect(await expectProportional(page)).toBeCloseTo(s1, 2);
});

test('Comment: mixed-size pages share one scale in the page list, also after zooming', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Comment' }).first().click();
  const sheets = page.locator('.comment .sheet');
  await expect(sheets.first()).toBeVisible({ timeout: 30_000 });
  const ok = async () => {
    const w = await sheets.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    const s = Math.max(...w) / 1000; // the widest page is 1000 pt
    w.forEach((pw, i) => expect(Math.abs(pw / SIZES[i][0] - s)).toBeLessThan(0.01));
  };
  await ok();
  for (let i = 0; i < 3; i++) await page.locator('.comment .pages').evaluate((n) => n.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true, clientX: 300, clientY: 300 })));
  await page.waitForTimeout(200);
  await ok();
});
