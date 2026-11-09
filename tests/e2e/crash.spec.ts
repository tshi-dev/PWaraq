import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, fixture } from './helpers';

// Part 3 of the recovery plan: every crash is saved on the device (no document content, no real file names); on the next start
// the person sees the exact text and chooses; nothing is sent without a click.
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const COMBOS = ['light', 'dim', 'dark', 'graphite'].flatMap((th) => ['en', 'ar'].map((l) => [l, th] as const));
const DEAD = () => localStorage.setItem('waraq-sessions', JSON.stringify(['crashed-run'])); // an earlier run that never said goodbye
const entries = (page: Page) => page.evaluate(async () => {
  const out: string[] = [];
  try { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('vault')).getDirectoryHandle('crash-log'); for await (const [, h] of (d as any).entries()) out.push(await (await h.getFile()).text()); } catch { /* none yet */ }
  return out;
});
// this run logs an error, then "dies" (its id stays in the list): the next start is a real crash and the dialog asks
async function crashed(page: Page, message = 'boom') {
  await page.evaluate((m) => { setTimeout(() => { throw new Error(m); }); }, message);
  await expect.poll(async () => (await entries(page)).some((e) => e.includes(`"message":"${message}"`))).toBe(true); // the start may still be writing its own entry: no counting
  await page.evaluate(DEAD);
}
const outside = (page: Page) => { const urls: string[] = []; page.on('request', (r) => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) urls.push(r.url()); }); return urls; };

test('a crash is saved by itself, without file names, folders or document text', async ({ page }) => {
  test.setTimeout(120_000);
  const sent = outside(page);
  await open(page, fixture('three.pdf'));
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox').or(page.locator('input[type=search], .find input')).first().fill('Page one');
  await page.getByRole('button', { name: 'Organize' }).click();
  await expect(page.locator('.cell')).toHaveCount(3);
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('boom reading three.pdf in C:\\Users\\Sara\\Documents\\تقرير سري.pdf'); });
    Promise.reject(new Error('later, \\\\nas\\share\\تقرير.docx'));
    console.error('render failed for three.pdf');
  });
  await expect.poll(async () => (await entries(page)).length).toBe(2);
  const all = (await entries(page)).join('\n') + (await page.evaluate(() => Object.values(localStorage).join('\n')));
  for (const secret of ['Sara', 'تقرير', 'three.pdf', 'nas', '.docx', 'Page one', 'Page two', 'Page three']) expect(all, secret).not.toContain(secret);
  const e = JSON.parse((await entries(page)).find((x) => x.includes('"error"'))!);
  expect(e).toMatchObject({ kind: 'error', task: 'organize', lang: 'en', theme: 'light' });
  expect(e.message).toContain('file.pdf');
  expect(e.version).toBeTruthy();
  expect(e.system).toMatch(/Windows|Linux|macOS/);
  expect(e.log.join('\n')).toContain('task: organize');
  expect(e.log.length).toBeLessThanOrEqual(50);
  expect(sent).toEqual([]); // nothing left the page
});

test('after an unclean exit: the dialog shows the exact text; email and GitHub links carry it; nothing is sent without a click', async ({ page }, info) => {
  test.setTimeout(120_000);
  const visited: string[] = [];
  await page.context().route('https://github.com/**', (r) => { visited.push(r.request().url()); r.abort(); }); // the click is allowed to go there; the test does not
  const sent = outside(page);
  await page.goto('/');
  await crashed(page);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Waraq closed unexpectedly' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Send a report?');
  await page.screenshot({ path: info.outputPath('crash-en.png') });
  await dialog.getByRole('button', { name: 'Preview' }).click();
  const shown = await dialog.locator('pre').innerText();
  expect(shown).toContain('What happened: Waraq closed without a clean exit');
  expect(shown).toContain('error: boom'); // what went wrong before it closed
  expect(shown).not.toMatch(/three\.pdf|Users/);
  await page.screenshot({ path: info.outputPath('crash-preview-en.png') });
  const mail = new URL((await dialog.getByRole('link', { name: 'Send by email' }).getAttribute('href'))!);
  expect(mail.protocol + mail.pathname).toBe('mailto:support@pwaraq.com');
  expect(mail.searchParams.get('body')).toBe(shown.replace(/\r\n/g, '\n'));
  const gh = dialog.getByRole('link', { name: 'Report on GitHub' });
  expect((await gh.getAttribute('href'))!.startsWith('https://github.com/tshi-dev/PWaraq/issues/new?template=problem.md')).toBe(true);
  expect(sent).toEqual([]); // reading it sent nothing
  const href = await gh.getAttribute('href');
  const [popup] = await Promise.all([page.waitForEvent('popup'), gh.click()]);
  await popup.waitForEvent('close', { timeout: 100 }).catch(() => {});
  expect(visited).toHaveLength(1);
  expect(visited[0]).toBe(href); // the link itself, nothing else
  expect(visited[0].startsWith('https://github.com/tshi-dev/PWaraq/issues/new?template=problem.md&')).toBe(true);
  await expect(dialog).toBeHidden();
});

test('"Don\'t send" and "Always ask" off: no dialog next time, the crash is still in the log and can be copied', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await crashed(page);
  await page.reload();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'Always ask' }).uncheck();
  await dialog.getByRole('button', { name: 'Don’t send' }).click();
  await expect(dialog).toBeHidden();
  await crashed(page, 'boom again');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open a PDF' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await entries(page)).length).toBe(4); // both crashes were saved (each: its error and the unclean exit)
  await page.getByRole('button', { name: 'Copy crash report' }).click();
  await expect(page.getByRole('button', { name: 'Copied.' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Waraq crash report/);
});

test('the Arabic dialog', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await page.goto('/');
  await crashed(page);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'أُغلق ورق بشكل غير متوقع' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'معاينة' }).click();
  await expect(dialog.locator('pre')).toContainText('Language: ar');
  await page.screenshot({ path: info.outputPath('crash-ar.png') });
});

test('an unclean exit alone (a closed browser, a discarded tab): no dialog, a quiet line on the start screen, kept in the log', async ({ page }) => {
  await page.addInitScript(DEAD);
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Waraq did not close normally last time. It is noted in the crash log.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await entries(page)).filter((e) => e.includes('"unclean"'))).toHaveLength(1);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); // still visible: stays in the list
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('waraq-sessions')!).length)).toBe(1);
});

// the desktop program: links go through open_external, the log file is shown for attaching; the folder button reveals the folder
const desktopStub = () => {
  const calls: { cmd: string; args: any }[] = [], files = new Map<string, Uint8Array>(); (window as any).tauriCalls = calls;
  files.set('crash-log/1-error.json', new TextEncoder().encode(JSON.stringify({ id: '1-error', at: 1, kind: 'error', message: 'boom', log: [] }))); // the run before logged an error
  const win = { isMaximized: async () => false, onResized: () => {}, onCloseRequested: async () => () => {}, minimize() {}, toggleMaximize() {}, close() {} };
  (window as any).__TAURI__ = {
    core: { invoke: async (cmd: string, args: any, opts: any) => {
      calls.push({ cmd, args: cmd === 'vault_put' ? { path: decodeURIComponent(opts.headers.path) } : args });
      if (cmd === 'vault_put') { files.set(decodeURIComponent(opts.headers.path), args); return; }
      if (cmd === 'vault_get') return files.get(args.path)!.buffer;
      if (cmd === 'vault_list') return [...files].filter(([p]) => p.startsWith(args.dir + '/')).map(([p, b]) => ({ name: p.slice(args.dir.length + 1), size: b.length, at: Date.now() }));
      if (cmd === 'vault_remove') { files.delete(args.path); return; }
      return cmd === 'launch_paths' ? [] : undefined;
    } },
    event: { listen: async () => () => {} }, dialog: {}, window: { getCurrentWindow: () => win },
  };
};
test('desktop: Send by email opens the mail program and shows the log file; GitHub opens the issue page; the folder button works', async ({ page }) => {
  await page.addInitScript(desktopStub);
  await page.addInitScript(DEAD);
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: 'Send by email' }).click();
  await expect(dialog.getByRole('status')).toContainText('Attach it to your email');
  const calls = () => page.evaluate(() => (window as any).tauriCalls as { cmd: string; args: any }[]);
  const open1 = (await calls()).find((c) => c.cmd === 'open_external')!;
  expect(open1.args.url.startsWith('mailto:support@pwaraq.com?subject=')).toBe(true);
  const reveal = (await calls()).find((c) => c.cmd === 'vault_reveal')!;
  expect(reveal.args.path).toMatch(/^crash-log\/\d+-unclean\.json$/);
  expect(reveal.args.select).toBe(true);
  await dialog.getByRole('link', { name: 'Report on GitHub' }).click();
  expect((await calls()).filter((c) => c.cmd === 'open_external')[1].args.url.startsWith('https://github.com/tshi-dev/PWaraq/issues/new?template=problem.md')).toBe(true);
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open crash log folder' }).click();
  expect((await calls()).filter((c) => c.cmd === 'vault_reveal').at(-1)!.args).toEqual({ path: 'crash-log', select: false });
});

test('the log keeps 20 entries', async ({ page }) => {
  test.skip(!!process.env.PREVIEW, 'imports the source module');
  await page.goto('/');
  const count = await page.evaluate(async () => {
    const vault = await import('/src/lib/vault.ts'), crash = await import('/src/lib/crashlog.ts');
    for (let i = 0; i < 25; i++) await vault.put(`crash-log/${1000 + i}-error.json`, JSON.stringify({ id: `${1000 + i}-error`, at: 1000 + i, kind: 'error', message: 'old' }));
    await crash.record('error', 'one more');
    return (await vault.list('crash-log')).length;
  });
  expect(count).toBe(20);
});

for (const [lang, theme] of COMBOS) test(`design rules hold on the crash dialog and the restore offer (${lang}, ${theme})`, async ({ page }, info) => {
  test.setTimeout(90_000);
  test.skip(!!process.env.PREVIEW, 'imports the source module');
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await page.goto('/');
  await page.evaluate(async (bytes) => { const d = await import('/src/lib/drafts.ts'); await d.saveDraft('x1', 'draft.pdf', new Uint8Array(bytes), 3); }, [...fs.readFileSync(fixture('three.pdf'))]);
  await crashed(page);
  await page.reload(); // the draft exists now: "Your work was restored"
  await expect(page.locator('.banner')).toBeVisible(); // the restore offer comes first; the crash dialog waits
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const r2 = await page.evaluate(audit) as { sample: unknown[] };
  expect(r2.sample, 'restore offer').toEqual([]);
  await page.screenshot({ path: info.outputPath(`restore-${lang}-${theme}.png`) });
  await page.locator('.banner .btn').nth(1).click(); // Discard
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('.btn').first().click(); // Preview
  await expect(dialog.locator('pre')).toBeVisible();
  const r1 = await page.evaluate(audit) as { sample: unknown[] };
  expect(r1.sample, 'dialog').toEqual([]);
  await page.screenshot({ path: info.outputPath(`crash-${lang}-${theme}.png`) });
});

test('Send report: one press posts the report to the form in the background; no tab, window or page opens', async ({ page, context }) => {
  test.setTimeout(120_000);
  const posts: { url: string; body: string }[] = [];
  await context.route('https://docs.google.com/**', (r) => { posts.push({ url: r.request().url(), body: r.request().postData() ?? '' }); r.fulfill({ status: 200, body: '' }); });
  let opened = 0; context.on('page', () => opened++);
  await page.goto('/');
  await crashed(page);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Waraq closed unexpectedly' });
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('Sent — thank you')).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toContain('/formResponse');
  const f = new URLSearchParams(posts[0].body);
  expect(f.get('entry.2023254085')).toContain('Waraq crash report');
  expect(f.get('entry.2138058848')).toBeTruthy();
  expect(opened).toBe(0);
  await expect(dialog).toBeHidden();
});

test('Send report offline: says it could not send and keeps the email and GitHub buttons', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route('https://docs.google.com/**', (r) => r.abort());
  await page.goto('/');
  await crashed(page);
  await page.reload();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('Could not send (offline?)')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Send by email' })).toBeVisible();
});
