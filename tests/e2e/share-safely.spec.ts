import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter } from '../../src/lib/engine/textpage';
import { open, saved } from './helpers';

const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const font = (f: string) => new m.Font(f, fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'public', 'fonts', f + '.ttf')));

// text with a black box drawn over it (the text is still in the file), an author, and one comment
function risky(file: string) {
  const doc = new m.PDFDocument(), w = pageWriter(m, doc, { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') });
  doc.insertPage(-1, w.add({ w: 595, h: 842, lines: [{ text: 'Account 987654321 is secret', x: 72, y: 100, size: 14 }, { text: 'Nothing to hide here', x: 72, y: 300, size: 14 }] }));
  w.finish();
  const page = doc.findPage(0), box = doc.addStream('q 0 0 0 rg 60 715 260 40 re f Q', {}), c = page.get('Contents');
  if (c.isArray()) c.push(box); else { page.put('Contents', doc.newArray()); page.get('Contents').push(c); page.get('Contents').push(box); }
  const pg = doc.loadPage(0);
  pg.createAnnotation('Text').setContents('ask Sami about this');
  pg.destroy();
  doc.setMetaData('info:Author', 'Abdullah');
  fs.writeFileSync(file, doc.saveToBuffer('').asUint8Array());
  return file;
}
const clean = async (page: Page, where: string) => expect(((await page.evaluate(audit)) as { sample: unknown[] }).sample, where).toEqual([]);

test('share safely: the check finds a fake redaction, the author and a comment; each fix removes its finding', async ({ page }, info) => {
  test.setTimeout(150_000);
  await open(page, risky(info.outputPath('risky.pdf')));
  await page.getByRole('button', { name: 'Protect' }).click();
  await page.getByRole('button', { name: 'Check this file' }).click();
  const list = page.locator('.finds');
  await expect(list).toContainText('Black boxes with the text still under them: 1');
  await expect(list).toContainText('Author');
  await expect(list).toContainText('Abdullah');
  await expect(list).toContainText('Comments and annotations: 1');
  await clean(page, 'findings');
  await page.screenshot({ path: info.outputPath('findings-en.png') });

  await page.getByRole('button', { name: 'Redact for real' }).click(); // the document is replaced, then checked again
  await expect(page.locator('.state')).toHaveText('Done. The file was checked again.', { timeout: 30_000 });
  await expect(list).not.toContainText('Black boxes');
  await page.getByRole('button', { name: 'Remove details' }).click();
  await expect(list).not.toContainText('Abdullah', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Remove comments' }).click();
  await expect(page.locator('.clean')).toContainText('Nothing found', { timeout: 30_000 });

  const file = await saved(page, () => page.getByRole('button', { name: 'Save', exact: true }).first().click());
  const d = m.Document.openDocument(file.bytes, 'application/pdf');
  expect(d.loadPage(0).toStructuredText().asText()).not.toContain('987654321');
  expect(d.loadPage(0).toStructuredText().asText()).toContain('Nothing to hide');
  expect(d.getMetaData('info:Author') ?? '').toBe('');
  expect(d.asPDF()!.loadPage(0).getAnnotations().length).toBe(0);
});

test('share safely: Arabic, the findings list follows the design rules', async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await open(page, risky(info.outputPath('risky-ar.pdf')));
  await page.locator('.task').nth(5).click();
  await page.locator('.side .btn').first().click();
  await expect(page.locator('.finds > li')).toHaveCount(3, { timeout: 30_000 });
  await clean(page, 'findings (ar)');
  await page.screenshot({ path: info.outputPath('findings-ar.png') });
});
