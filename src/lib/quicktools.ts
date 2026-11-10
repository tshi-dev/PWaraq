// Quick tools on the start screen and the deep link /app/#tool=<id>: which task the opened file lands in, what the
// workspace opens at (a dialog, a panel, a hint), and what the file chooser accepts.
import type { Key } from './i18n.svelte';

export type ToolId = 'images-to-pdf' | 'merge' | 'split' | 'compress' | 'rotate' | 'delete-pages' | 'pdf-to-images' | 'protect' | 'unlock' | 'sign' | 'ocr';
export type Quick = { task: Key; at?: ToolId; accepts: 'pdf' | 'images'; multiple: boolean; icon: string; name: Key; title: Key };

export const TOOLS: Record<ToolId, Quick> = {
  'images-to-pdf': { task: 'organize', accepts: 'images', multiple: true, icon: 'images', name: 'qtImages', title: 'qtImagesTitle' },
  merge: { task: 'organize', accepts: 'pdf', multiple: true, icon: 'merge', name: 'qtMerge', title: 'qtMergeTitle' },
  split: { task: 'organize', at: 'split', accepts: 'pdf', multiple: false, icon: 'split', name: 'qtSplit', title: 'qtSplitTitle' },
  compress: { task: 'view', at: 'compress', accepts: 'pdf', multiple: false, icon: 'compress', name: 'qtCompress', title: 'qtCompressTitle' },
  rotate: { task: 'organize', at: 'rotate', accepts: 'pdf', multiple: false, icon: 'rotate', name: 'qtRotate', title: 'qtRotateTitle' },
  'delete-pages': { task: 'organize', at: 'delete-pages', accepts: 'pdf', multiple: false, icon: 'delete', name: 'qtDelete', title: 'qtDeleteTitle' },
  'pdf-to-images': { task: 'convert', at: 'pdf-to-images', accepts: 'pdf', multiple: false, icon: 'png', name: 'qtToImages', title: 'qtToImagesTitle' },
  protect: { task: 'protect', at: 'protect', accepts: 'pdf', multiple: false, icon: 'protect', name: 'qtProtect', title: 'qtProtectTitle' },
  unlock: { task: 'protect', at: 'unlock', accepts: 'pdf', multiple: false, icon: 'unlock', name: 'qtUnlock', title: 'qtUnlockTitle' },
  sign: { task: 'sign', accepts: 'pdf', multiple: false, icon: 'signature', name: 'qtSign', title: 'qtSignTitle' },
  ocr: { task: 'ocr', accepts: 'pdf', multiple: false, icon: 'ocr', name: 'qtOcr', title: 'qtOcrTitle' },
};

export const isTool = (id: unknown): id is ToolId => typeof id === 'string' && Object.hasOwn(TOOLS, id);
/** `#tool=compress` → 'compress'; no tool or an unknown one → null. */
export const toolFromHash = (hash: string): ToolId | null => { const id = new URLSearchParams(hash.replace(/^#/, '')).get('tool'); return isTool(id) ? id : null; };
