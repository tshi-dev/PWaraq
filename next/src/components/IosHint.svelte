<script lang="ts">
  // iPhone/iPad Safari only, once: how to install the web app. Dismissed = remembered; never shown in the installed app.
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const installed = (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  const seen = () => { try { return localStorage.getItem('waraq-ios-hint') === '1'; } catch { return true; } };
  let show = $state(ios && safari && !installed && !(globalThis as { __TAURI__?: unknown }).__TAURI__ && !seen());
  const dismiss = () => { show = false; try { localStorage.setItem('waraq-ios-hint', '1'); } catch { /* private mode */ } };
</script>

{#if show}
  <p class="hint" role="status">
    <span>{t('iosHint')}</span>
    <button class="btn icon" onclick={dismiss} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button>
  </p>
{/if}

<style>
  .hint { display: flex; align-items: center; gap: var(--s-8); margin: 0; padding: var(--s-8); padding-inline: var(--s-16) var(--s-8); max-width: 520px;
    border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); color: var(--muted); }
</style>
