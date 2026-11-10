import { i18n, t } from './i18n.svelte';

/** A file size; never "0 MB" for a small file. */
export const mb = (n: number) => n < 104858 ? t('sizeTiny') : (n / 1048576).toLocaleString(i18n.lang, { maximumFractionDigits: 1 }) + ' MB';
