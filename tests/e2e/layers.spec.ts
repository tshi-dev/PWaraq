import { test, expect, type Page } from '@playwright/test';
import { open, choose, fixture } from './helpers';

// Layers: two added photos lie exactly on each other; the one underneath is picked from the panel, sent to the front, and undone.
const names = async (page: Page) => (await page.locator('.layers .list .name').allTextContents()).filter((n) => n.startsWith('Photo')); // small.pdf's own picture is listed too, at the bottom
const onTop = (page: Page) => page.evaluate(() => {
  const r = document.querySelector('.editor .sheet')!.getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return el?.closest('.obj')?.getAttribute('data-obj') ?? '';
});

test('layers: pick a covered photo in the panel, bring it to the front, undo; hide only changes the view', async ({ page }) => {
  await open(page, fixture('small.pdf'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.editor .sheet')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Add photo' })).toBeEnabled({ timeout: 20_000 });
  for (let i = 0; i < 2; i++) await choose(page, () => page.getByRole('button', { name: 'Add photo' }).click(), [fixture('photo.png')]);
  await expect(page.locator('.obj.pic')).toHaveCount(2);
  expect(await names(page)).toEqual(['Photo 2', 'Photo 1']); // front first
  const [under, over] = await page.locator('.obj.pic').evaluateAll((els) => els.map((e) => e.getAttribute('data-obj')!));
  expect(await onTop(page)).toBe(over);

  // the covered one is picked from the panel: it is selected although a click on the page would hit the other
  await page.getByRole('button', { name: 'Photo 1', exact: true }).click();
  await expect(page.locator(`.obj[data-obj="${under}"]`)).toHaveClass(/on/);
  await expect(page.getByRole('button', { name: 'Bring to front' })).toBeEnabled();
  await page.getByRole('button', { name: 'Bring to front' }).click();
  expect(await names(page)).toEqual(['Photo 1', 'Photo 2']);
  expect(await onTop(page)).toBe(under);
  await expect(page.getByRole('button', { name: 'Bring to front' })).toBeDisabled();

  // one step back, then undo and redo with the editor's own buttons
  await page.getByRole('button', { name: 'Backward' }).click();
  expect(await names(page)).toEqual(['Photo 2', 'Photo 1']);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(['Photo 1', 'Photo 2']);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(['Photo 2', 'Photo 1']);
  expect(await onTop(page)).toBe(over);

  // the eye hides the layer on the stage only; its tooltip says it is still saved
  const eye = page.locator('.layers .list li').first().locator('.eye');
  await expect(eye).toHaveAttribute('title', /still saved/);
  await eye.click();
  await expect(page.locator(`.obj[data-obj="${over}"]`)).toBeHidden();
  expect(await names(page)).toEqual(['Photo 2', 'Photo 1']);
  await eye.click();
  await expect(page.locator(`.obj[data-obj="${over}"]`)).toBeVisible();
});
