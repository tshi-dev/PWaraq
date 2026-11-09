// Middle-button auto-scroll: a short middle press starts it, moving away from the round marker scrolls (faster the further), Esc stops it;
// press + hold + drag scrolls only while the button is down.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, '..', 'fixtures', 'three.pdf'));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 });
}
const top = (page: Page) => page.locator('.scroller').evaluate((n) => n.scrollTop);
// how far it should get: 100 px, or the bottom when the document is shorter than that
const far = async (page: Page) => Math.min(100, (await page.locator('.scroller').evaluate((n) => n.scrollHeight - n.clientHeight)) - 2);

test('Middle click starts auto-scroll in the Viewer, the mouse decides the direction, Esc stops it', async ({ page }) => {
  await open(page);
  const box = (await page.locator('.scroller').boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  await expect(page.locator('.autoscroll-mark')).toBeVisible();
  await page.mouse.move(x, y + 120);
  await expect.poll(() => top(page)).toBeGreaterThan(await far(page));
  await page.mouse.move(x, y - 120);
  const was = await top(page);
  await expect.poll(() => top(page)).toBeLessThan(was / 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.autoscroll-mark')).toHaveCount(0);
  const stopped = await top(page); await page.waitForTimeout(300);
  expect(await top(page)).toBe(stopped);
});

test('Middle button held and dragged scrolls while held, a click ends the scroll mode', async ({ page }) => {
  await open(page);
  const box = (await page.locator('.scroller').boundingBox())!, x = box.x + box.width / 2, y = box.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x, y + 150, { steps: 5 });
  await expect.poll(() => top(page)).toBeGreaterThan(await far(page));
  await page.mouse.up({ button: 'middle' });
  await expect(page.locator('.autoscroll-mark')).toHaveCount(0);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  await expect(page.locator('.autoscroll-mark')).toBeVisible();
  await page.mouse.click(x, y + 10);
  await expect(page.locator('.autoscroll-mark')).toHaveCount(0);
});
