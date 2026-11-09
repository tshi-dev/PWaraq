import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { saved, choose, fixture } from './helpers';

test('images: two PNGs dropped on the start screen become one 2-page PDF in Organize', async ({ page }) => {
  await page.goto('/');
  const files = ['img-a.png', 'img-b.png'].map((f) => ({ name: f, b64: fs.readFileSync(fixture(f)).toString('base64') }));
  const dt = await page.evaluateHandle((fs) => {
    const d = new DataTransfer();
    for (const f of fs) d.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: 'image/png' }));
    return d;
  }, files);
  await page.locator('.start').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.locator('.cell')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByText('Changed — not saved yet')).toBeVisible(); // a new document: unsaved
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  expect(file.name).toBe('img-a.pdf');
  const doc = m.Document.openDocument(file.bytes, 'application/pdf');
  expect(doc.countPages()).toBe(2);
  expect(doc.loadPage(0).getBounds().map(Math.round)).toEqual([0, 0, 90, 60]); // 120x80 px at 96 dpi
});

test('images: Combine takes a PDF and a PNG in order', async ({ page }) => {
  await page.goto('/');
  await choose(page, () => page.locator('.mode[data-task=organize]').click(), [fixture('small.pdf'), fixture('img-a.png')]);
  await expect(page.locator('.cell')).toHaveCount(2, { timeout: 30_000 });
});

test('images: Open with a PNG first, then a PDF, makes one document', async ({ page }) => {
  await page.goto('/');
  await choose(page, () => page.getByRole('button', { name: 'Open a PDF' }).click(), [fixture('img-a.png'), fixture('small.pdf')]);
  await expect(page.locator('.cell')).toHaveCount(2, { timeout: 30_000 });
});
