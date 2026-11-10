import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { choose, fixture } from './helpers';

// Quick tools on the start screen and the deep link /#tool=<id>: the tool is armed, the file lands in the right task.
const IDS = ['images-to-pdf', 'merge', 'split', 'compress', 'rotate', 'delete-pages', 'pdf-to-images', 'protect', 'unlock', 'sign', 'ocr'];
const S = {
  en: { start: 'Open or drop files', compress: 'Compress a PDF', choosePdf: 'Choose a PDF', chooseImages: 'Choose images', smaller: 'Save a smaller copy', organize: 'Organize',
    rotateHint: 'Choose the pages to turn', deleteHint: 'Choose the pages to delete', split: 'Split', cancel: 'Cancel', protect: 'Protect' },
  ar: { start: 'افتح الملفات أو أفلتها', compress: 'اضغط ملف PDF', choosePdf: 'اختر ملف PDF', chooseImages: 'اختر الصور', smaller: 'احفظ نسخة أصغر', organize: 'تنظيم',
    rotateHint: 'اختر الصفحات المراد تدويرها', deleteHint: 'اختر الصفحات المراد حذفها', split: 'تقسيم', cancel: 'إلغاء', protect: 'حماية' },
};
const go = async (page: Page, lang: 'en' | 'ar', hash = '') => {
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await page.goto('/' + hash);
};

for (const lang of ['en', 'ar'] as const) {
  const s = S[lang];
  test(`quick tools: eleven tiles, two columns and no sideways scroll on a phone (${lang})`, async ({ page }) => {
    await go(page, lang);
    await expect(page.locator('.qt')).toHaveCount(11);
    expect(await page.locator('.qt').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tool))).toEqual(IDS);
    await expect(page.locator('.mode')).toHaveCount(8); // the mode tiles stay
    await page.setViewportSize({ width: 390, height: 844 });
    const xs = await page.locator('.qt').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`deep link: #tool=compress arms Compress, the hash goes, the file opens with the smaller-copy dialog (${lang})`, async ({ page }) => {
    await go(page, lang, '#tool=compress');
    await expect(page.locator('#open-h')).toHaveText(s.compress);
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('.qt[data-tool=compress]')).toHaveAttribute('aria-pressed', 'true');
    await choose(page, () => page.getByRole('button', { name: s.choosePdf }).click(), [fixture('small.pdf')]);
    await expect(page.getByRole('dialog', { name: s.smaller })).toBeVisible({ timeout: 30_000 });
  });

  test(`deep link: #tool=rotate lands in Organize with all pages and a hint (${lang})`, async ({ page }) => {
    await go(page, lang, '#tool=rotate');
    await choose(page, () => page.getByRole('button', { name: s.choosePdf }).click(), [fixture('three.pdf')]);
    await expect(page.locator('.task.on')).toHaveText(new RegExp(s.organize), { timeout: 30_000 });
    await expect(page.locator('.cell')).toHaveCount(3);
    await expect(page.locator('.org .hint')).toContainText(s.rotateHint);
  });

  test(`deep link: #tool=split opens the split panel, #tool=protect starts in the password field (${lang})`, async ({ page }) => {
    await go(page, lang, '#tool=split');
    await choose(page, () => page.getByRole('button', { name: s.choosePdf }).click(), [fixture('three.pdf')]);
    await expect(page.getByRole('complementary', { name: s.split })).toBeVisible({ timeout: 30_000 });

    await page.goto('about:blank'); // a fresh load (a hash change alone is ignored while a document is open)
    await page.goto('/#tool=protect');
    await choose(page, () => page.getByRole('button', { name: s.choosePdf }).click(), [fixture('small.pdf')]);
    await expect(page.locator('.task.on')).toHaveText(new RegExp(s.protect), { timeout: 30_000 });
    await expect(page.locator('.side input[type=password]').first()).toBeFocused();
  });

  test(`deep link: #tool=images-to-pdf asks for images and they become one PDF in Organize (${lang})`, async ({ page }) => {
    await go(page, lang, '#tool=images-to-pdf');
    await expect(page.getByRole('button', { name: s.chooseImages })).toBeVisible();
    await expect(page.locator('input[type=file]').first()).toHaveAttribute('accept', '.png,.jpg,.jpeg');
    await choose(page, () => page.getByRole('button', { name: s.chooseImages }).click(), [fixture('img-a.png'), fixture('img-b.png')]);
    await expect(page.locator('.cell')).toHaveCount(2, { timeout: 30_000 });
  });

  test(`deep link: an unknown id gives the plain start screen; Cancel disarms (${lang})`, async ({ page }) => {
    await go(page, lang, '#tool=nope');
    await expect(page.locator('#open-h')).toHaveText(s.start);
    expect(new URL(page.url()).hash).toBe('');
    await page.goto('/#tool=compress');
    await page.getByRole('button', { name: s.cancel, exact: true }).click();
    await expect(page.locator('#open-h')).toHaveText(s.start);
    await expect(page.locator('.qt[aria-pressed=true]')).toHaveCount(0);
  });
}

test('quick tool tiles: delete pages, PDF to images, merge, sign and OCR land in their task', async ({ page }) => {
  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=delete-pages]').click(), [fixture('three.pdf')]);
  await expect(page.locator('.org .hint')).toContainText('Choose the pages to delete', { timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=pdf-to-images]').click(), [fixture('small.pdf')]);
  await expect(page.locator('.side h2').first()).toHaveText('Pages as images', { timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=merge]').click(), [fixture('small.pdf'), fixture('three.pdf')]);
  await expect(page.locator('.count').first()).toHaveText('3 selected', { timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=sign]').click(), [fixture('small.pdf')]);
  await expect(page.locator('.task.on')).toHaveText(/Sign/, { timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=ocr]').click(), [fixture('small.pdf')]);
  await expect(page.getByRole('button', { name: 'Add searchable text' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/');
  await choose(page, () => page.locator('.qt[data-tool=unlock]').click(), [fixture('small.pdf')]);
  await expect(page.locator('.task.on')).toHaveText(/Protect/, { timeout: 30_000 });
});

test('deep link: a file dropped on the armed start screen opens in that tool (compress)', async ({ page }) => {
  await page.goto('/#tool=compress');
  const b64 = fs.readFileSync(fixture('small.pdf')).toString('base64');
  const dt = await page.evaluateHandle((b) => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'small.pdf', { type: 'application/pdf' })); return d; }, b64);
  await page.locator('.start').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('dialog', { name: 'Save a smaller copy' })).toBeVisible({ timeout: 30_000 });
});
