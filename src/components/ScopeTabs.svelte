<script lang="ts">
  // Edit's switch between the open page and the whole document; sits in the page editor's toolbar (or on its own band for the whole document).
  import { t } from '../lib/i18n.svelte';
  let { scope = $bindable('page') }: { scope?: 'page' | 'document' } = $props();
</script>

<div class="scope" role="tablist" aria-label={t('edit')}>
  <button role="tab" aria-selected={scope === 'page'} class:on={scope === 'page'} onclick={() => (scope = 'page')}>{t('thisPage')}</button>
  <button role="tab" aria-selected={scope === 'document'} class:on={scope === 'document'} onclick={() => (scope = 'document')}>{t('wholeDocument')}</button>
</div>

<style>
  .scope { display: flex; flex: none; gap: var(--s-8); }
  button { min-height: var(--control); padding: 0 var(--s-16); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); font-weight: 600; color: var(--muted); white-space: nowrap; }
  button.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
</style>
