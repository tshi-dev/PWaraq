<script lang="ts" module>
  // set before a fix reloads the document (the workspace is built again): the new workspace checks the file again and says so
  let after = '';
  // across the reload a fix causes: the ids fixed so far (they keep a done tick), the ids "Fix all" still has to do, and the last scan (kept while the person looks at a page)
  import { fingerprint } from '../lib/fingerprint';
  import type { Finding } from '../lib/engine/checkshare';
  let fixed: string[] = [], queue: string[] = [], seen: { key: string; report: Finding[] } | null = null;
</script>

<script lang="ts">
  // Whole-document tools, one screen per task: page numbers and watermark (Edit → Whole document), pages
  // as images (Convert), password protect and unlock (Protect). A preview of page 1 on the left, options on the right.
  // Changes to the document itself go to `onReplace` (then Save as usual); copies (smaller, protected, images) are saved
  // as new files and the open document stays as it is.
  import { isCancelled, type EnginePool } from '../lib/engine/pool';
  import { onMount } from 'svelte';
  import { i18n, t, type Key } from '../lib/i18n.svelte';
  import { mb } from '../lib/size';
  import { icon } from '../lib/icons.js';
  import { saveFile } from '../lib/store';
  import { CONVERTIBLE_ACCEPT, desktop, toPdf } from '../lib/convert';
  import { zip } from '../lib/zip';
  import { addUnique } from '../lib/names';

  let { pool, kind, sizes, name, bytes, password, onReplace, onGoto }: { pool: EnginePool; kind: 'stamp' | 'convert' | 'protect';
    sizes: { w: number; h: number }[]; name: string; bytes: Uint8Array; password?: string; onReplace: (bytes: Uint8Array, password?: string, task?: 'protect') => Promise<void>; onGoto?: (page: number) => void } = $props();
  const base = $derived(name.replace(/\.pdf$/i, ''));
  let busy = $state(''), note = $state(''), error = $state('');
  async function run(label: string, job: () => Promise<void>) {
    busy = label; error = ''; note = '';
    try { await job(); } catch (e) { const msg = String((e as Error)?.message); error = isCancelled(e) ? '' : /NEED_OWNER/.test(msg) ? t('needOwner') : /PASSWORD/.test(msg) ? t('wrongPassword') : t('toolFailed'); }
    busy = '';
  }
  const all = () => sizes.map((_, page) => ({ doc: 0, page }));

  // preview: page 1, with the numbers and the watermark drawn over it as they will appear
  const P = 300, s0 = $derived(sizes[0]), k = $derived(Math.min(P / s0.w, (P * 1.35) / s0.h));
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    const c = canvas; if (!c) return;
    pool.run<ImageBitmap>({ op: 'render', page: 0, priority: 1, key: 'toolpreview', args: { scale: (P / s0.w) * Math.min(devicePixelRatio || 1, 2) } })
      .then((bmp) => { c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => {});
  });

  // Edit → Whole document
  let numbersOn = $state(true), position = $state<'bl' | 'bc' | 'br' | 'tl' | 'tc' | 'tr'>('bc'), start = $state(1), total = $state(false), digits = $state<'latn' | 'arab'>('latn');
  let markOn = $state(false), markText = $state(''), opacity = $state(20), angle = $state(45), tile = $state(false);
  const indic = (v: string) => v.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + +d));
  const label = $derived(digits === 'arab' ? indic(total ? `${start} من ${start + sizes.length - 1}` : String(start)) : total ? `${start} / ${start + sizes.length - 1}` : String(start));
  const stamp = () => run(t('applying'), async () => {
    const out = await pool.build({ items: all(), numbers: numbersOn, numberStyle: { position, start, total, digits },
      watermark: markOn && markText.trim() ? { text: markText.trim(), opacity: opacity / 100, angle, tile } : undefined });
    await onReplace(out);
  });

  // Convert
  let dpi = $state(150);
  const images = () => run(t('reading'), async () => {
    const files: Record<string, Uint8Array> = {};
    for (let page = 0; page < sizes.length; page++) {
      const bmp = await pool.run<ImageBitmap>({ op: 'render', page, priority: 1, args: { scale: dpi / 72 } });
      const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
      addUnique(files, `${base} ${String(page + 1).padStart(3, '0')}.png`, new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    }
    if (sizes.length === 1) await saveFile(Object.values(files)[0], `${base}.png`, 'image/png');
    else await saveFile(zip(files), `${base} (${t('images')}).zip`, 'application/zip');
  });

  const canOffice = !!desktop();
  const office = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (file) run(t('officeConverting'), async () => {
      try { await saveFile(await toPdf(file), file.name.replace(/\.[^.]+$/, '') + '.pdf'); }
      catch (e) { if ((e as Error)?.message !== 'NO_PACKS') error = t('officeFailed'); } // declined download: no message
    });
  };

  // Protect
  let pw = $state(''), pw2 = $state(''), print = $state(true), copy = $state(false);
  const pwOk = $derived(pw.length >= 4 && pw === pw2 && !pw.includes(','));
  const lock = () => run(t('applying'), async () => {
    await saveFile(await pool.tool('protect', { bytes: bytes.slice(), password: pw, print, copy, current: password ?? '' }), `${base} (${t('protected')}).pdf`);
    note = t('protectedSaved'); pw = pw2 = '';
  });
  // a file with limits (no copy, no print …) opened without its owner password: only a copy with the same limits
  let held = $state<{ restricted: boolean; owner: boolean } | null>(null);
  $effect(() => { pool.tool<typeof held>('guard', { bytes: bytes.slice(), current: password ?? '' }).then((g) => (held = g)).catch(() => {}); });
  const limited = $derived(!!held?.restricted && !held.owner);
  const copyAs = () => run(t('applying'), async () => { await saveFile(bytes, `${base} (${t('copyWord')}).pdf`); });

  // Check before sharing (Protect): the scan runs in the engine; each fix replaces the open document (Save as usual, protection kept like Organize does)
  let report = $state<Finding[] | null>(null), doneIds = $state<string[]>([...fixed]);
  const issues = $derived((report ?? []).filter((f) => f.id !== 'ocr'));
  const gone = $derived(doneIds.filter((id) => !(report ?? []).some((f) => f.id === id)));
  const SAFE = ['fake', 'meta', 'comments', 'files', 'script']; // fixes that lose nothing the person wants and do not clash; clearing answers, bookmarks and a smaller copy stay one by one
  const fixable = $derived(issues.filter((f) => f.fix && SAFE.includes(f.id)));
  const ICON: Record<string, string> = { fake: 'redact', white: 'eye', outside: 'extract', tiny: 'search', invisible: 'eye', ocr: 'ocr', meta: 'metadata', comments: 'annotate', forms: 'forms', files: 'link', script: 'warning', layers: 'layers', bookmarks: 'bookmarks', size: 'compress' };
  const key = () => name + ':' + bytes.length + ':' + fingerprint(bytes);
  const scan = () => run(t('chkChecking'), async () => { report = await pool.tool<Finding[]>('checkscan', { bytes: bytes.slice(), password: password ?? '' }); seen = { key: key(), report }; });
  const check = () => { fixed = []; doneIds = []; queue = []; return scan(); };
  const mend = (f: Finding) => run(t('applying'), async () => {
    try {
      const out = await pool.tool('checkfix', { bytes: bytes.slice(), password: password ?? '', kind: f.id });
      if (f.id === 'size' && out.length >= bytes.length) { note = t('chkNoSmaller'); return; }
      after = t('chkDone'); fixed = [...fixed, f.id];
      await onReplace(await pool.keep(out), password, 'protect'); // like Organize: a file opened with only its open password keeps it too
    } catch (e) { after = ''; queue = []; fixed = fixed.filter((x) => x !== f.id); throw e; } // a failed fix also ends Fix all (no stale queue left for a later single fix)
  });
  // Fix all: one fix at a time (each one opens the document again and checks it again), then the next in the queue
  const next = async (): Promise<void> => { const f = issues.find((x) => x.id === queue.shift()); if (f) await mend(f); else if (queue.length) await next(); };
  const fixAll = () => { queue = fixable.map((f) => f.id); return next(); };
  onMount(() => {
    if (after && kind === 'protect') { const msg = after; after = ''; scan().then(() => { note = msg; if (queue.length) next(); }); }
    else { after = ''; if (seen?.key === key()) report = seen.report; }
  });
  const pagesOf = (f: Finding) => [...new Set(f.pages)];
  const say = (f: Finding) => t(`chk_${f.id}` as Key).replace('{n}', f.n.toLocaleString(i18n.lang));
  const shown = (v: string) => v.replace(/^D:(\d{4})(\d\d)(\d\d).*$/, '$1-$2-$3');
  const free = () => run(t('applying'), async () => { await onReplace(await pool.tool('unlock', { bytes: bytes.slice(), password: password ?? '' })); });
</script>

<div class="tools">
  <section class="preview" aria-label={t('page') + ' 1'}>
    <div class="sheet" style="width:{s0.w * k}px;height:{s0.h * k}px">
      <canvas bind:this={canvas}></canvas>
      {#if kind === 'stamp'}
        {#if markOn && markText.trim() && tile}<div class="tiles" style="opacity:{opacity / 100 + 0.1};transform:translate(-50%,-50%) rotate({-angle}deg)" aria-hidden="true">{#each Array(48) as _, n}<span class="mark" class:half={Math.floor(n / 6) % 2}>{markText}</span>{/each}</div>
        {:else if markOn && markText.trim()}<span class="mark" style="opacity:{opacity / 100 + 0.1};transform:translate(-50%,-50%) rotate({-angle}deg)">{markText}</span>{/if}
        {#if numbersOn}<span class="pno num {position}">{label}</span>{/if}
      {/if}
    </div>
    <p class="muted num">{t(sizes.length === 1 ? 'docInfoOne' : 'docInfoMany').replace('{n}', String(sizes.length)).replace('{size}', mb(bytes.length))}</p>
  </section>

  <aside class="side">
    {#if kind === 'stamp'}
      <h2>{t('wholeDocument')}</h2>
      <label class="switch"><input type="checkbox" bind:checked={numbersOn} />{t('numbers')}</label>
      {#if numbersOn}
        <label class="field"><span>{t('numberPosition')}</span>
          <select bind:value={position}>
            <option value="bc">{t('posBottomCentre')}</option><option value="br">{t('posBottomRight')}</option><option value="bl">{t('posBottomLeft')}</option>
            <option value="tc">{t('posTopCentre')}</option><option value="tr">{t('posTopRight')}</option><option value="tl">{t('posTopLeft')}</option>
          </select></label>
        <div class="row">
          <label class="field"><span>{t('startAt')}</span><input type="number" min="0" bind:value={start} /></label>
          <label class="switch"><input type="checkbox" bind:checked={total} />{t('withTotal')}</label>
        </div>
        <div class="row" role="radiogroup" aria-label={t('digitsLabel')}>
          <button class="btn" role="radio" class:on={digits === 'latn'} aria-checked={digits === 'latn'} onclick={() => (digits = 'latn')}>{t('digitsWestern')}</button>
          <button class="btn" role="radio" class:on={digits === 'arab'} aria-checked={digits === 'arab'} onclick={() => (digits = 'arab')}>{t('digitsArabic')}</button>
        </div>
      {/if}
      <label class="switch"><input type="checkbox" bind:checked={markOn} />{t('watermark')}</label>
      {#if markOn}
        <label class="field"><span>{t('watermarkText')}</span><input bind:value={markText} placeholder={t('watermarkExample')} /></label>
        <label class="switch"><input type="checkbox" bind:checked={tile} />{t('tileMark')}</label>
        <div class="row">
          <label class="field"><span>{t('opacity')} {opacity}%</span><input type="range" min="5" max="60" bind:value={opacity} /></label>
          <label class="field"><span>{t('angle')} {angle}°</span><input type="range" min="0" max="90" step="15" bind:value={angle} /></label>
        </div>
      {/if}
      <span class="grow"></span>
      <button class="btn primary" onclick={stamp} disabled={!!busy || (!numbersOn && !(markOn && markText.trim()))}>{@html icon('check')}{t('applyAll')}</button>
    {:else if kind === 'convert'}
      <h2>{t('images')}</h2>
      <label class="field"><span>{t('resolution')}</span>
        <select bind:value={dpi}><option value={96}>96 dpi</option><option value={150}>150 dpi</option><option value={300}>300 dpi</option></select></label>
      <button class="btn" onclick={images} disabled={!!busy}>{@html icon('png')}{t('imagesSave')}</button>
      <h2>{t('officeTitle')}</h2>
      <p class="help">{canOffice ? t('officeHelp') : t('officeDesktopOnly')}</p>
      <label class="btn" class:disabled={!canOffice || !!busy}>{@html icon('upload')}{t('officeChoose')}
        <input type="file" accept={CONVERTIBLE_ACCEPT} hidden disabled={!canOffice || !!busy} onchange={office} /></label>
    {:else}
      <div class="ph"><h2>{t('chkTitle')}</h2><p>{t('chkHelp')}</p></div>
      {#if report}
        {#if issues.length}<p class="sum" role="status">{@html icon('warning')}{issues.length === 1 ? t('chkFoundOne') : t('chkFound').replace('{n}', issues.length.toLocaleString(i18n.lang))}</p>
        {:else}<p class="clean" role="status">{@html icon('check')}<span><b>{t('chkSafe')}</b><br />{t('chkClean')}</span></p>{/if}
        <ul class="finds" aria-label={t('chkTitle')}>
          {#each report as f (f.id)}
            <li class:fine={f.id === 'ocr'}>
              <span class="ic" class:risk={f.id !== 'ocr'}>{@html icon(ICON[f.id])}</span>
              <div class="body">
                <h3>{t(`chkh_${f.id}` as Key)}</h3>
                <p>{say(f)}</p>
                {#if f.items.length}<ul class="items">{#each f.items as [k, v]}<li><span>{t(`chk_m_${k}` as Key)}</span>{#if v}<bdi>{shown(v)}</bdi>{/if}</li>{/each}</ul>{/if}
                {#if pagesOf(f).length && onGoto}<div class="pages">{#each pagesOf(f).slice(0, 8) as p}<button class="btn num" onclick={() => onGoto(p)} aria-label={t('goPageN').replace('{n}', String(p))}>{t('pageN').replace('{n}', String(p))}</button>{/each}{#if pagesOf(f).length > 8}<span class="muted">…</span>{/if}</div>{/if}
                {#if f.fix && !limited}<button class="btn" onclick={() => mend(f)} disabled={!!busy}>{t(`chk_${f.id}_fix` as Key)}</button>{/if}
              </div>
            </li>
          {/each}
          {#each gone as id (id)}
            <li class="done"><span class="ic">{@html icon('check')}</span><div class="body"><h3>{t(`chkh_${id}` as Key)}</h3><p>{t('chkFixed')}</p></div></li>
          {/each}
        </ul>
        {#if limited && issues.some((f) => f.fix)}<p class="help">{t('chkLimited')}</p>{/if}
      {/if}
      {#if limited}
      <h2>{t('limitedTitle')}</h2>
      <p class="help">{t('limitedHelp')}</p>
      <button class="btn" onclick={copyAs} disabled={!!busy}>{@html icon('download')}{t('copySave')}</button>
      {:else}
      <h2>{t('protectTitle')}</h2>
      <p class="help">{t('protectHelp')}</p>
      <label class="field"><span>{t('password')}</span><input type="password" bind:value={pw} autocomplete="new-password" /></label>
      <label class="field"><span>{t('passwordAgain')}</span><input type="password" bind:value={pw2} autocomplete="new-password" /></label>
      {#if pw.includes(',')}<p class="error">{t('noComma')}</p>{/if}
      <label class="switch"><input type="checkbox" bind:checked={print} />{t('allowPrint')}</label>
      <label class="switch"><input type="checkbox" bind:checked={copy} />{t('allowCopy')}</label>
      <button class="btn" onclick={lock} disabled={!!busy || !pwOk}>{@html icon('protect')}{t('protectSave')}</button>
      <h2>{t('unlockTitle')}</h2>
      {#if password}
        <p class="help">{t('unlockHelp')}</p>
        <button class="btn" onclick={free} disabled={!!busy}>{@html icon('unlock')}{t('unlockApply')}</button>
      {:else}<p class="help">{t('notLocked')}</p>{/if}
      {/if}
    {/if}
    <div class="pf">
      {#if kind === 'protect'}
        {#if !report}<button class="btn primary" onclick={check} disabled={!!busy}>{@html icon('search')}{t('chkRun')}</button>
        {:else if fixable.length && !limited}<button class="btn primary" onclick={fixAll} disabled={!!busy}>{@html icon('check')}{t('chkFixAll')}</button>
        {:else}<button class="btn" onclick={check} disabled={!!busy}>{@html icon('search')}{t('chkAgain')}</button>{/if}
      {/if}
      <p class="state num" aria-live="polite">{busy || note}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  </aside>
</div>

<style>
  .tools { height: 100%; display: grid; grid-template-columns: 1fr var(--panel); min-height: 0; }
  .preview { display: grid; place-content: center; justify-items: center; gap: var(--s-12); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; background: #fff; box-shadow: var(--shadow); overflow: hidden; }
  .sheet canvas { width: 100%; height: 100%; display: block; }
  .tiles { position: absolute; left: 50%; top: 50%; width: 220%; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-24) var(--s-32); pointer-events: none; }
  .tiles .mark { position: static; font-size: var(--fs-16); }
  .tiles .mark.half { margin-inline-start: var(--s-32); }
  .mark { position: absolute; left: 50%; top: 50%; white-space: nowrap; font: 700 var(--fs-32)/1 var(--font); color: var(--green); pointer-events: none; }
  .pno { position: absolute; font-size: var(--fs-12); color: var(--muted); }
  .pno.bc, .pno.tc { left: 50%; transform: translateX(-50%); } .pno.bl, .pno.tl { left: 8px; } .pno.br, .pno.tr { right: 8px; }
  .pno.bl, .pno.bc, .pno.br { bottom: 6px; } .pno.tl, .pno.tc, .pno.tr { top: 6px; }
  .muted { margin: 0; color: var(--muted); }
  .help { margin: 0; color: var(--muted); }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input:not([type='range']), .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .field input[type='range'] { accent-color: var(--green); min-height: var(--control); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-12); align-items: end; }
  .switch, .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .clean, .sum { display: flex; gap: var(--s-8); align-items: flex-start; margin: 0; font-weight: 600; }
  .clean { color: var(--green); } .clean b { font-size: var(--fs-16); } .clean span { font-weight: 400; color: var(--muted); } .clean b { color: var(--green); }
  .finds, .items { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--s-8); }
  .finds > li { display: flex; gap: var(--s-12); align-items: flex-start; padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .finds .body { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-8); min-width: 0; } /* the page links and the fix button share a line when they fit */
  .finds .body > h3, .finds .body > p, .finds .body > .items { flex: 1 0 100%; }
  .finds h3 { margin: 0; font-size: var(--fs-14); font-weight: 600; }
  .finds p { margin: 0; color: var(--muted); }
  .finds .ic { flex: none; display: grid; place-items: center; color: var(--green); }
  .finds .ic.risk { color: var(--danger); }
  .finds .fine, .finds .done { background: var(--green-soft); }
  .pages { display: flex; flex-wrap: wrap; gap: var(--s-8); align-items: center; }
  .items { gap: var(--s-4); font-size: var(--fs-12); color: var(--muted); }
  .items span::after { content: ': '; }
  .items bdi { color: var(--ink); }
  label.btn { cursor: pointer; } label.btn.disabled { opacity: 0.5; cursor: not-allowed; }
  .state { margin: 0; color: var(--muted); font-size: var(--fs-12); min-height: 18px; }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .tools { display: block; overflow-y: auto; } .side { overflow: visible; border-inline-start: 0; border-top: 1px solid var(--line); } } /* one scroll for the preview and the options (no small inner scroll on a phone); the footer stays pinned */
</style>
