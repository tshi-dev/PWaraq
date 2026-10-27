// Renders public/brand-mark.svg into the PWA icons (run once: node tools/dev/make-icons.mjs). Needs Edge (as the e2e tests do).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const svg = fs.readFileSync('public/brand-mark.svg', 'utf8');
const b = await chromium.launch({ channel: 'msedge' });
const shot = async (size, pad, bg, file) => {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const m = Math.round(size * pad);
  await p.setContent(`<body style="margin:0;background:${bg};display:grid;place-items:center;height:100vh"><div style="width:${size - 2 * m}px;height:${size - 2 * m}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`);
  await p.screenshot({ path: file, omitBackground: bg === 'transparent' });
  await p.close();
};
await shot(192, 0.06, 'transparent', 'public/icon-192.png');
await shot(512, 0.06, 'transparent', 'public/icon-512.png');
await shot(512, 0.2, '#fafbf8', 'public/icon-maskable-512.png'); // safe zone: the mark stays inside the inner 60 %
await shot(180, 0.12, '#fafbf8', 'public/apple-touch-icon.png'); // iOS rounds the corners itself and wants no transparency
await b.close();
