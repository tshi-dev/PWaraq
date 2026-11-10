import { test, expect, devices, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, fixture } from './helpers';
import { pageObjects } from '../../src/lib/engine/editpage';

// Edit: several things at once, like Acrobat — Ctrl+click, a box dragged on an empty spot, Ctrl+A; Delete takes them all in one
// undo step, a drag moves them together; the saved PDF no longer has the deleted lines' text (taken out, not covered).
const T = {
  en: { edit: 'Edit', savePage: 'Save page', save: 'Save', changed: 'Changed — not saved yet', n: (k: number) => `${k} selected`, several: 'Select several' },
  ar: { edit: 'تحرير', savePage: 'حفظ الصفحة', save: 'حفظ', changed: 'تغيّر — لم يُحفظ بعد', n: (k: number) => `تم تحديد ${k}`, several: 'تحديد متعدد' },
};
const scale = (page: Page) => page.locator('.editor .sheet').evaluate((el) => el.getBoundingClientRect().width / 595);
const many = (page: Page) => page.getByTestId('many');
async function start(page: Page, lang: 'en' | 'ar', file: string) {
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await open(page, fixture(file));
  await page.getByRole('button', { name: T[lang].edit, exact: true }).click();
  await expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 20_000 });
}
/** Drags a box on the page from (x0, y0) to (x1, y1) in points; `shot` is taken while the mouse is still down. */
async function band(page: Page, x0: number, y0: number, x1: number, y1: number, shot?: string) {
  const b = (await page.locator('.editor .sheet').boundingBox())!, s = await scale(page);
  await page.mouse.move(b.x + x0 * s, b.y + y0 * s);
  await page.mouse.down();
  await page.mouse.move(b.x + x1 * s, b.y + y1 * s, { steps: 6 });
  await expect(page.locator('.editor .band')).toBeVisible();
  if (shot) await page.screenshot({ path: shot });
  await page.mouse.up();
  await expect(page.locator('.editor .band')).toHaveCount(0);
}
const savedText = async (page: Page, lang: 'en' | 'ar') => {
  await page.getByRole('button', { name: T[lang].savePage }).click();
  await expect(page.getByText(T[lang].changed)).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: T[lang].save, exact: true }).first().click());
  return pageObjects(m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0));
};

test('several at once (en): Ctrl+click, a box, Ctrl+A, layers; Delete is one undo step; a drag moves them all; the saved PDF lost the deleted text', async ({ page }, info) => {
  await start(page, 'en', 'edit.pdf'); // lines: Old heading, Keep this line; photos at 72,242 and 350,242
  const lines = page.locator('.hit.line'), photos = page.locator('.hit.photo');

  // Ctrl+click two lines: both chosen, the panel says so; Esc lets go
  await lines.nth(0).click({ modifiers: ['Control'] });
  await lines.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('.hit.line.on')).toHaveCount(2);
  await expect(many(page)).toHaveText('2 selected');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hit.on')).toHaveCount(0);

  // a box over both photos (from an empty spot) chooses them; the layers list shows them chosen
  await band(page, 60, 225, 470, 360, info.outputPath('area-select-en.png'));
  await expect(page.locator('.hit.photo.on')).toHaveCount(2);
  await expect(page.locator('.layers .list li.on')).toHaveCount(2);

  // Ctrl+A: everything; Ctrl+click in the layers list takes one out again
  await page.keyboard.press('Control+a');
  await expect(many(page)).toHaveText('4 selected');
  await page.locator('.layers .list li.on .pick').first().click({ modifiers: ['Control'] });
  await expect(many(page)).toHaveText('3 selected');
  await page.screenshot({ path: info.outputPath('three-selected-en.png') });

  // Delete takes all chosen at once; one Ctrl+Z brings all of them back
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(page.locator('.hit')).toHaveCount(0);
  await expect(page.locator('.obj:visible')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(lines).toHaveCount(2);
  await expect(photos).toHaveCount(2);

  // a drag on one of several chosen moves all of them; one undo puts both back
  await photos.nth(0).click({ modifiers: ['Control'] });
  await photos.nth(1).click({ modifiers: ['Control'] });
  const b = (await photos.nth(0).boundingBox())!, s = await scale(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 100 * s, { steps: 6 });
  await page.mouse.up();
  const moved = page.locator('.obj.pic.on');
  await expect(moved).toHaveCount(2);
  const ys = await moved.evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.top)));
  ys.forEach((y) => expect(Math.abs(y / s - 342)).toBeLessThan(2)); // both from 242 to 342
  await page.keyboard.press('ArrowDown'); // a nudge moves both one point
  await expect.poll(() => moved.first().evaluate((e) => parseFloat((e as HTMLElement).style.top))).toBeCloseTo(ys[0] + s, 1);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.obj.pic')).toHaveCount(0);
  await expect(photos).toHaveCount(2);

  // delete both lines and save: their text is no longer in the file, the photos are
  await lines.nth(0).click({ modifiers: ['Control'] });
  await lines.nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Backspace');
  const o = await savedText(page, 'en');
  expect(o.lines.map((l) => l.text)).toEqual([]);
  expect(o.images.length).toBe(2);
});

test('several at once (ar): a box over three Arabic lines, Delete, Undo, Delete; the saved page keeps only the other lines', async ({ page }, info) => {
  await start(page, 'ar', 'arabic/edge-arial.pdf');
  const before = pageObjects(m.Document.openDocument(fs.readFileSync(fixture('arabic/edge-arial.pdf')), 'application/pdf').loadPage(0)).lines.map((l) => l.text);
  // lines 2–4 (y 82 to 152); x 60 is left of every line
  await band(page, 60, 80, 560, 150, info.outputPath('area-select-ar.png'));
  await expect(page.locator('.hit.line.on')).toHaveCount(3);
  await expect(many(page)).toHaveText(T.ar.n(3));
  await page.screenshot({ path: info.outputPath('three-selected-ar.png') });
  await page.keyboard.press('Delete');
  await expect(page.locator('.hit.line')).toHaveCount(before.length - 3);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.hit.line')).toHaveCount(before.length);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.hit.line')).toHaveCount(before.length - 3);
  const after = (await savedText(page, 'ar')).lines.map((l) => l.text);
  expect(after).toEqual(before.filter((_, i) => i < 1 || i > 3));
});

for (const lang of ['en', 'ar'] as const) test(`several at once on a phone (${lang}): Select several makes taps add, a finger drag draws the box`, async ({ browser }, info) => {
  const { defaultBrowserType, ...phone } = devices['iPhone 14'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 }, locale: lang === 'ar' ? 'ar-SA' : 'en-US', baseURL: info.project.use.baseURL });
  await ctx.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fixture('edit.pdf'));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /▾/ }).first().tap();
  await page.getByRole('menuitem', { name: T[lang].edit, exact: true }).tap();
  await expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 30_000 });
  const toggle = page.getByRole('button', { name: T[lang].several });
  // the dock holds the toggle, Cancel and Save page whole (nothing cut off at its edge)
  const bar = (await page.locator('.dock .bar').boundingBox())!;
  for (const el of [toggle, page.getByRole('button', { name: T[lang].savePage })]) {
    const r = (await el.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(36);
    expect(r.x).toBeGreaterThanOrEqual(bar.x - 0.5); expect(r.x + r.width).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
  }
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.hit.line').nth(0).tap();
  await page.locator('.hit.line').nth(1).tap();
  await expect(page.locator('.hit.line.on')).toHaveCount(2);
  await expect(page.locator('.editor textarea')).toHaveCount(0); // taps chose, they did not open a line for typing

  // one finger dragged from an empty spot over both photos adds them (well clear of them: a finger's touch snaps to a button near it)
  const b = (await page.locator('.editor div.sheet').boundingBox())!, s = b.width / 595, cdp = await ctx.newCDPSession(page);
  const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: b.x + x * s, y: b.y + y * s, id: 1 }] });
  await touch('touchStart', 20, 190);
  for (let k = 1; k <= 6; k++) await touch('touchMove', 20 + (450 * k) / 6, 190 + (170 * k) / 6);
  await page.screenshot({ path: info.outputPath(`phone-area-select-${lang}.png`) });
  await touch('touchEnd', 0, 0);
  await expect(page.locator('.hit.photo.on')).toHaveCount(2);
  await expect(page.locator('.hit.on')).toHaveCount(4);
  await ctx.close();
});
