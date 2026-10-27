import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { saved, fixture } from './helpers';

const pdf = (b: Uint8Array) => m.Document.openDocument(b, 'application/pdf');
// owner "own", user "pw", print only (copying off)
const lockedFile = (path: string, src: string) => {
  const out = pdf(fs.readFileSync(src)).asPDF()!.saveToBuffer('encrypt=aes-256,user-password=pw,owner-password=own,permissions=' + ((1 << 2) | ~0xfff) + ',garbage').asUint8Array();
  fs.writeFileSync(path, out);
  return path;
};
async function openLocked(page: Page, file: string, pw: string) {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.locator('#pdfpw').fill(pw);
  await page.locator('.lock').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
}
const stillLocked = (b: Uint8Array, pages: number) => {
  const d = pdf(b);
  expect(d.needsPassword()).toBe(true);
  expect(d.authenticatePassword('wrong')).toBe(0);
  expect(d.authenticatePassword('own')).toBeGreaterThan(0); // the password typed to open it
  const P = d.asPDF()!.getTrailer().get('Encrypt').get('P').asNumber(); // read from the file: the owner password would grant everything
  expect(P & (1 << 4)).toBe(0); // copy off
  expect(P & (1 << 2)).not.toBe(0); // print on
  expect(d.countPages()).toBe(pages);
};

test('save after Organize keeps the password and limits (owner password known)', async ({ page }, info) => {
  test.setTimeout(120_000);
  await openLocked(page, lockedFile(info.outputPath('limited.pdf'), fixture('three.pdf')), 'own');
  await page.getByRole('button', { name: 'Organize' }).click();
  await page.locator('.cell').nth(1).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.cell')).toHaveCount(2);
  const file = await saved(page, () => page.getByRole('button', { name: 'Save', exact: true }).first().click());
  stillLocked(file.bytes, 2);
});

test('save after Comment keeps the password and limits (owner password known)', async ({ page }, info) => {
  test.setTimeout(120_000);
  const small = fixture('small.pdf');
  await openLocked(page, lockedFile(info.outputPath('limited2.pdf'), small), 'own');
  const q = [...pdf(fs.readFileSync(small)).loadPage(0).search('Quarterly Report')[0][0]];
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const layer = page.locator('.layer').first();
  await expect(layer).toBeVisible();
  const box = (await layer.boundingBox())!, k = box.width / 595, at = (x: number, y: number) => [box.x + x * k, box.y + y * k] as const, mid = (q[1] + q[5]) / 2;
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await page.mouse.move(...at(q[0] + 1, mid)); await page.mouse.down();
  await page.mouse.move(...at((q[0] + q[2]) / 2, mid), { steps: 5 }); await page.mouse.move(...at(q[2] - 1, mid), { steps: 5 }); await page.mouse.up();
  await expect(page.locator('.layer polygon.hl')).toHaveCount(1);
  const file = await saved(page, () => page.getByRole('button', { name: 'Save', exact: true }).first().click());
  stillLocked(file.bytes, 1);
  const d = pdf(file.bytes); d.authenticatePassword('pw');
  expect(d.loadPage(0).getAnnotations()).toHaveLength(1);
});
