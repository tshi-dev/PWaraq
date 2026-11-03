import { test, expect, type Page } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, fixture } from './helpers';
import { pageObjects } from '../../src/lib/engine/editpage';

// overlap.pdf (seen from the top, points): background picture 72,60 400x240; chart picture 200,120 150x100 on it; green box 90,340 100x40 with "MOVE ME"
const edit = async (page: Page) => {
  await open(page, fixture('overlap.pdf'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 20_000 });
};
const geo = async (page: Page) => { const b = (await page.locator('.editor .sheet').boundingBox())!; return { b, s: b.width / 595 }; };
const finish = async (page: Page) => {
  await page.getByRole('button', { name: 'Save page' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  return m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0);
};
const rgbAt = (p: m.Page, x: number, y: number) => { const pm = p.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false), i = (Math.round(y) * pm.getWidth() + Math.round(x)) * 3, d = pm.getPixels(); return [d[i], d[i + 1], d[i + 2]]; };
const red = (c: number[]) => c[0] > 200 && c[1] < 60 && c[2] < 60, blue = (c: number[]) => c[0] === 200 && c[1] === 220 && c[2] === 255, green = (c: number[]) => c[1] > 140 && c[0] < 60, white = (c: number[]) => c.every((v) => v > 245);

test('edit: a picture on top of a bigger one — the smaller wins the click, one press-and-drag moves it, no copy stays behind', async ({ page }) => {
  await edit(page);
  const { b, s } = await geo(page);
  const at = (x: number, y: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.getAttribute('aria-label'), [b.x + x * s, b.y + y * s]);
  expect(await at(275, 170)).toBe('Change photo 2'); // the chart, not the background under it
  expect(await at(100, 70)).toBe('Change photo 1');
  // one gesture: press on the chart, drag it right, let go
  await page.mouse.move(b.x + 275 * s, b.y + 170 * s); await page.mouse.down();
  await page.mouse.move(b.x + 355 * s, b.y + 170 * s, { steps: 4 }); await page.mouse.move(b.x + 435 * s, b.y + 170 * s, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('.obj.pic.on')).toHaveCount(1);
  const o = (await page.locator('.obj.pic.on').boundingBox())!;
  expect(Math.abs(o.x - (b.x + 360 * s))).toBeLessThan(2);
  await expect.poll(() => page.locator('.obj.pic.on').evaluate((el) => (el as HTMLElement).style.backgroundImage)).toContain('blob:'); // the photo alone, not a cut of the page
  const p = await finish(page);
  const images = pageObjects(p).images;
  expect(images.length, JSON.stringify(images)).toBe(2);
  expect(images.some((i) => Math.abs(i.x - 72) < 1 && Math.abs(i.y - 60) < 1 && Math.abs(i.w - 400) < 1)).toBe(true); // the background stayed
  expect(images.some((i) => Math.abs(i.x - 360) < 1 && Math.abs(i.y - 120) < 1 && Math.abs(i.w - 150) < 1)).toBe(true);
  expect(blue(rgbAt(p, 275, 170)), 'the old place shows the background, not a copy').toBe(true);
  expect(red(rgbAt(p, 435, 170))).toBe(true);
});

test('edit: Move area at 100 % zoom — drag a rectangle, move it, save: shape and text are at the new place only, still real text', async ({ page }, info) => {
  await edit(page);
  await page.getByRole('combobox', { name: 'Zoom' }).selectOption({ label: '100%' });
  await expect.poll(async () => (await geo(page)).s).toBeCloseTo(1, 1);
  const { b, s } = await geo(page);
  await page.getByRole('button', { name: 'Move area' }).click();
  await page.mouse.move(b.x + 80 * s, b.y + 330 * s); await page.mouse.down();
  await page.mouse.move(b.x + 150 * s, b.y + 360 * s, { steps: 4 }); await page.mouse.move(b.x + 200 * s, b.y + 390 * s, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('.obj.area.on')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Move area' })).toBeVisible();
  const area = (await page.locator('.obj.area.on').boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2); await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 150, area.y + area.height / 2 + 100, { steps: 6 }); await page.mouse.up();
  await page.screenshot({ path: info.outputPath('move-area-editor.png') });
  // undo / redo bring the move back and forth
  await page.keyboard.press('Control+z');
  expect(Math.abs((await page.locator('.obj.area').boundingBox())!.x - area.x)).toBeLessThan(2);
  await page.keyboard.press('Control+y');
  expect(Math.abs((await page.locator('.obj.area').boundingBox())!.x - (area.x + 150))).toBeLessThan(2);
  const p = await finish(page);
  const text = p.toStructuredText().asText(), line = pageObjects(p).lines.find((l) => l.text === 'MOVE ME');
  expect(text.match(/MOVE ME/g)?.length, text).toBe(1);
  expect(line && Math.abs(line.x - (100 + 150 / s)) < 2 && Math.abs(line.y - (340 + 100 / s)) < 14, JSON.stringify(line)).toBe(true);
  expect(white(rgbAt(p, 110, 360)), 'the old place is clean').toBe(true);
  expect(green(rgbAt(p, 95 + 150 / s, 345 + 100 / s)), 'the box at the new place').toBe(true);
  expect(blue(rgbAt(p, 100, 70)) && red(rgbAt(p, 275, 170)), 'the pictures were not touched').toBe(true);
});
