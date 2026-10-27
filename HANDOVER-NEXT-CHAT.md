# Hand-over to the next chat — Waraq (updated 27 October 2026)

**Start here, in this order:** `TEAM.md` (how the manager works: one manager, small single-job workers, token rules) →
`NEXT-PLAN.md` (what to do next, phases 0–3, first three actions) → the sections below (owner's rules) → `waraq-next/PLAN.md` only when a brief needs a detail.

**State on 27 Oct 2026:** Waraq **1.0 beta 2 is live**: pwaraq.com (Cloudflare production `4d61b37e`; rollback `9f6d79da`), GitHub release
`v1.0.0-beta.2` with the signed installer, PWaraq synced to waraq-next `a21bf12`, backup `Backups6-10-22-golive`. Open problem: Windows
Defender flags the installer as `Trojan:Win32/Wacatac.H!ml` (ML false positive, submitted to Microsoft 23 Oct) — NEXT-PLAN Phase 0.
Owner-only steps: `waraq-nextuild-signed.cmd` (signed installer), `gh release create/upload`, Cloudflare production "yes" (then
`node tools/deploy.cjs --production --yes-owner-approved` in waraq-site-1.0 — wrangler is logged in), Microsoft/Apple accounts.

## 1. The product and the owner
- **Waraq (ورق) PDF Studio** — Arabic + English PDF tools; website **pwaraq.com** (Cloudflare Pages project
  `pwaraq`), Windows desktop app. "Waraq" everywhere; "pwaraq" only in the web address and internal storage keys.
- Owner: Abdullah (Abdullah Designs). Writes short messages, often Arabic/English mixed; prefers action over
  questions for clear requests, wants to see results (screenshots), rated 0.3.x **6/10** and asked for a rebuild.
- **Licence: GNU AGPL v3 or later** (owner's decision, 15 Oct) because Waraq ships MuPDF (AGPL) and LibreDWG (GPL).
  Source is **public since 19 Oct 2026**: https://github.com/tshi-dev/PWaraq (`app/` = 0.3.3 snapshot without
  binaries, `next/` = waraq-next with history). Local copy: `PWaraq\`. Update it: `git -C PWaraq subtree pull
  --prefix=next ../waraq-next master` (and copy changed 0.3.x files into `app/`), then `git push` — GitHub CLI is
  signed in as tshi-dev (`C:\Program Files\GitHub CLI\gh.exe`). Ask the owner before each push.

## 2. Rules the owner set (keep them)
- **Release gate (owner, 21 Oct 2026): NOTHING goes live on GitHub or pwaraq.com until it is tested properly (full unit + e2e + audit green, EN+AR, a manual look at screenshots) AND the owner has given the clearance in chat for that specific release.** A past "you can push" does not cover later work. Prepare, test, stage; then ask.
- Never publish/upload (website, installers, GitHub) or buy anything without asking. A **second agent** does the
  publishing from `OTHER-AGENT-TO-DO.md` (Chrome + Cloudflare); we prepare packages and write its tasks there.
- Git (owner, 20 Oct): **the owner is the author of every commit**, Claude only a contributor. waraq-next and PWaraq
  have a repo-local author `tshi-dev <272740088+tshi-dev@users.noreply.github.com>` — just `git -C <repo> commit`,
  never `-c user.name="Claude"`, never change global config. Message ends with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; no session links anywhere. Push only when the work is
  tested and ready, and only after the owner says yes. History was rewritten to tshi-dev on 20 Oct (local);
  the next PWaraq push must be `git push --force-with-lease` once.
- Design rules (from github.com/gholtzap/lintapple): type 12/14/16/18/20/24/32/40, contrast ≥ 4.5, controls ≥ 36 px
  (40 touch), 8 px between controls, sentence case, tabular numbers. Audit script: `waraq/tools/ui-audit.js`.
- **Waraq colours** (owner, 15 Oct): paper `#fafbf8`, green `#15775d`, mint `#eaf3eb`, ink `#233c36`; light only —
  no automatic dark theme from Windows.
- Drawings must be **100 % crisp** (CAD users; e.g. the owner's MV Trenches A0 drawing).
- Organize and editing should feel like **Adobe Acrobat / PDFCraft**.
- Desktop window top bar must be **Waraq-branded**, not the Windows default (Tauri custom title bar, Phase 4).
- Code signing was declined (SmartScreen help is on the download page).

## 3. Folder map (`C:\Users\Abdullah\Documents\ChatGPT\PDF Open Source`)
| Folder | What |
|---|---|
| `waraq\` | **0.3.x** — live product (vanilla JS in `dist\`, Electron desktop, backend engines). Git repo. |
| `waraq-next\` | **Waraq 1.0** rebuild (Vite + Svelte 5 + TypeScript, MuPDF WebAssembly). Git repo. |
| `toolchain\mupdf` | MuPDF 1.28.5 source (Windows copy; the build uses the Linux copy in WSL `/root/mupdf`). |
| `Designs\` | Logo masters. |
| `Archive-2026-10-12\` | Old releases, reviews, earlier hand-overs, screenshots. |
| `Waraq 1.0 preview.cmd` | Double-click: builds Waraq 1.0 and opens it in its own Edge window (owner's preview). |
| `OTHER-AGENT-TO-DO.md` | Tasks + results of the publishing agent. `WORK-STATUS.md` — 0.3.x status. |

## 4. Waraq 0.3.x — where it stands
- **Live: 0.3.3** (published by the other agent 16 Oct; live checks, download SHA-256 and drag/crop journeys passed).
- Its one finding (Arabic Edit at 1366x768: page cards ended 21 px below the screen) is **fixed** (waraq commit
  `1c56d9d`: less space above the page tools with a document open; cards end at 745/736 px; cache name -14; audit 0).
  **Waiting for upload:** `waraq\publish\Waraq-Website-0.3.3-layout-fix.zip` (383 083 104 bytes, SHA-256
  `72c657a2…1359a`, same 0.3.3 installer). The task for the other agent is in `OTHER-AGENT-TO-DO.md` (upload,
  re-check the finding in both languages, and a **read-only backend review**: Pages settings, headers vs `_headers`,
  pages.dev/redirects, `/api/*` and secret-file 404s, DNS/TLS, the open traffic questions; report to
  `Archive-2026-10-12
eviews\BACKEND-REVIEW-2026-10.md`, change nothing). The published 0.3.3 ZIP is kept as is.
- 0.3.x architecture: small core installer (MuPDF + qpdf) + **add-on packs** downloaded on first use (Office & CAD
  137 MB, OCR 48 MB, zstd, SHA-256 pinned in `desktop/packs.json`), branded WPF setup window around NSIS,
  one-click auto-update, parallel downloads, `_headers` caching. Rebuild recipe in `WORK-STATUS.md`
  (`pnpm desktop:build:full` → `package-desktop-downloads.cjs` → `package-offline.cjs` → `tools/make-website-zip.cjs`).
- 0.3.x keeps getting only fixes; new work goes into 1.0.

## 5. Waraq 1.0 (`waraq-next`) — where it stands
**Phase 1 (foundation) — done (19 Oct).** Engine: our own MuPDF 1.28.5 WASM (`engine/`, CAD hairlines ≥ 1 px),
worker pool (`src/lib/engine/pool.ts`: page n → worker n % size; jobs for `any` worker go to an idle one, and when all
are mid-drawing one is restarted with the sources reopened — applying Organize on the A0 drawing went 14 s → 0.24 s),
exact-resolution viewer with deep-zoom tiles, thumbnails, search, text layer, page cache.
- **Start screen:** Open (system picker with file handles), New portfolio, **Recent** (IndexedDB, first-page
  thumbnails, reopen by click; portfolios from browser storage), drop PDF or `.waraq`.
- **Preview for the owner:** double-click `Waraq 1.0 preview.cmd` (top folder) → builds and opens
  http://localhost:4188 in its own Edge window. Screenshots: `Archive-2026-10-12\screenshots\waraq-1.0-preview\`.
- **Design rules as a test:** `tests/e2e/audit.spec.ts` runs `tools/ui-audit.js` (lintapple; controls ≥ 36 px) on
  start, View, Organize, Portfolio in English and Arabic — all clean.

**Phase 2 — started (19 Oct):**
- **Organize** (`Organize.svelte` + shared `PageGrid.svelte`): Acrobat-style full-window grid; click/Ctrl/Shift
  select, drag several pages (green drop bar), turn, delete, "+" between pages, drop files, insert file/photo/blank,
  extract, undo/redo, thumbnail size; leaving Organize (or Save) rebuilds the file and reopens it in View
  ("Changed — not saved yet" until saved). Build = `src/lib/engine/assemble.ts` (graft pages, turns, photo pages sized
  like the neighbour, blank pages, page numbers, bookmarks, links).
- **Portfolio** — first version with the owner's 18 Oct wishes (contents with page numbers + links, titles from
  file names highlighted until renamed, divider pages written on in place, numbers for all or one section,
  bookmarks, `.waraq`). Details and what is left: PLAN.md "Portfolio". Written pages (contents, dividers) are real
  Arabic text: `src/lib/engine/textpage.ts` (Tajawal presentation forms + own ToUnicode; no HarfBuzz yet).
- **Page editor** — first version (19 Oct, owner's question "edit one page's photos and text like PDFCraft"):
  double-click a page (or "Edit page") in Organize/Portfolio, or the **Edit** task in View. Add text (real Tajawal
  text, English/Arabic, size/colour/bold/alignment), add/move/resize/replace/delete photos (also the PDF's own),
  replace a line of text (old line redacted, new one **in the line's own embedded font via HarfBuzz**, 19 Oct; missing
  letters: full/closest bundled Noto font, named in the panel; PLAN.md "Owner's ideas" 2),
  undo/redo; Save page = a new one-page source that takes the page's place. `src/lib/engine/editpage.ts` +
  `PageEditor.svelte`; details and what is left: PLAN.md "Page editor". Screenshots:
  `Archive-2026-10-12\screenshots\waraq-1.0-preview\page-editor-2026-10-19\` (8–12).
- **Signing mode** — first version (19 Oct, owner's idea): **Sign** task. Signature library on this device (draw /
  type / photo with background removal, crop, recolour), set = signature + session date (Gregorian/Hijri) + name with
  fixed spacing; finds places to sign (empty /Sig fields, التوقيع / Signature / التاريخ / Date + blank), highlights
  them, bars "Signature needed on page N — Go"; click or Enter signs and moves to the next place/file; Save all signed.
  Details + what is left: PLAN.md "Signing mode". Screenshots: `Archive-2026-10-12\screenshots\waraq-1.0-preview\signing-2026-10-19\` (13–17).
- Tests: `pnpm check` 0/0 · `pnpm test:unit` 12 engine/logic self-checks · `pnpm test:e2e` **17 journeys** (dev) and
  `PREVIEW=1` against the build — all pass; the two CAD journeys run only where `public/_test/mv-trenches.pdf` exists.

**Next phases (see PLAN.md):**
2. Everyday tools **done 19 Oct** (split, crop, page numbers, watermark, compress, pages as PNG, protect/unlock,
   password prompt; engine `src/lib/engine/tools.ts`; 25 engine checks, 23 journeys). Left: Portfolio drag whole
   sections, font subsetting. Portfolio round 2 done 19 Oct (cover, 4 designs, logos, paper pages, hide/lock sections,
   number position, page bar, Edit page in the panel; `src/lib/engine/designs.ts`; 28 engine checks, 24 journeys).
3. Editing (page editor first version done; next: text in its own font incl. Arabic via HarfBuzz, whole paragraphs,
   redaction tool, forms, OCR, Office/CAD via packs).
4. Tauri desktop (branded title bar, file associations, right-click menu, packs, signed updater, branded setup),
   website split (product page + /app), switch 0.3.x users over.

## 6. Environment (this PC: Windows 11, 24 cores, 15 GB in WSL)
- Node 24: `C:\Program Files\nodejs` (not on PATH in Bash; use the full path). pnpm 12 in `%APPDATA%\npm` —
  **run pnpm from PowerShell** (`$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path`); its Bash
  launcher is broken.
- WSL **Ubuntu-24.04** (installed 15 Oct) with build-essential, Emscripten **4.0.8** in `/opt/emsdk`, MuPDF source in
  `/root/mupdf`. Rebuild the engine:
  `wsl -d Ubuntu-24.04 -u root -- bash "/mnt/c/Users/Abdullah/Documents/ChatGPT/PDF Open Source/waraq-next/engine/build-mupdf-wasm.sh"`
- Dev server: `pnpm dev` in `waraq-next` → http://localhost:5188. The Claude browser pane is usually **hidden, which
  pauses drawing** — use `waraq-next/tools/dev/drive-window.mjs` (real window, DevTools) for drawing/perf checks,
  and Playwright for journeys. Electron for that tool: `waraq\node_modules\electron\dist\electron.exe`.
- PowerShell 5.1 reads scripts without a BOM as ANSI — save .ps1 with Arabic text as UTF-8 **with BOM**.
- The owner's test drawing: `C:\Users\Abdullah\OneDrive - ACWA Power International\Site Things\KSH\MV Trenches Work\SAU1002-W101-AHQ-&CTL-00001-2.pdf`
  (copy in `waraq-next/public/_test/mv-trenches.pdf`, git-ignored).

## 7. Lessons from 0.3.x / 1.0 work (avoid repeating)
- Verify in a real visible window or Playwright, not the hidden pane; check `.page canvas` width ≠ 300 (= undrawn).
- Every fixed layout container needs a bounded height (`#app { height: 100% }`) or fit/zoom maths breaks.
- Module workers that `await` at top level lose early messages — listen first, load the engine after (done).
- MuPDF display lists of CAD pages are huge (~800 MB); never cache many per worker.
- Don't trust the size of a Python/sed edit to Windows files with non-ASCII text — re-read after editing.
- Git Bash: `sed -i` drops CR (write .cmd files from PowerShell), `printf` turns `>nul` into `>/dev/null`, and a stray
  `cat > file` without a heredoc waits for input forever.
- Engine jobs cannot be interrupted: never let a short job wait behind a heavy CAD page — use `any: true` (idle or
  restarted worker) for whole-document work.
- MuPDF's PDF writer rebuilds glyph→text maps from the font: write text pages directly (`pageWriter`) to keep them.
- After each release step, write the publishing agent's tasks into `OTHER-AGENT-TO-DO.md` with sizes + SHA-256.

## 8. Immediate next actions (updated 20 Oct 2026)
Done since 19 Oct: everyday tools; Portfolio rounds 2–4 (cover with logos/names/supervisor/photo, 8 designs in any
colour, paper pages, drag/hide/lock sections, number position, page bar, Edit page in the panel); Phase 3 (real
redaction incl. a Redact tool in the page editor, forms incl. wrapping Arabic answers, OCR text layer);
`waraq-next/CLAUDE.md` (short working notes — read it first, it saves tokens); 0.3.3 website: layout fix + real
404 page are LIVE. GitHub CLI signed in as **tshi-dev** (account renamed from aalbihlal-dev); public repo
github.com/tshi-dev/PWaraq is synced up to the Portfolio/404 work (1b619bc) — **Phase 3 not pushed yet** (ask first).
1. Publishing agent: `OTHER-AGENT-TO-DO.md` steps 1–2 done (404 live); steps 3–5 open (backend review, GitHub check,
   full Waraq 1.0 preview test). When its report arrives, fix what it finds.
2. Phase 3 left: Office (Word/Excel/PowerPoint) and CAD (DWG) via the 0.3.3 add-on packs; font subsetting in exports.
3. Phase 4: Tauri desktop (branded title bar, installer, updater, file associations, right-click), website split
   (product page + /app; owner: beta online only when everything is done), switch 0.3.3 users.
4. Work cheaply: one fresh session per task in `waraq-next`, start from CLAUDE.md, batch the owner's requests,
   screenshots only at the end. The parent folder `PDF Open Source` is an EMPTY git repo — never commit there.

## Update 20 Oct 2026 — Phase 3 built (waraq-next, 3 commits, not pushed)
Redact, Forms and OCR are tasks in the Waraq 1.0 task bar (details in `waraq-next/PLAN.md`, "Phase 3"). All tests green
(unit 36, e2e 32, `pnpm check` 0/0). OCR needs `node tools/get-ocr.mjs` once on a fresh checkout (copies 19 MB from `../waraq`).
Screenshots: `Archive-2026-10-12/screenshots/waraq-1.0-preview/phase3/`. Next: Office/CAD conversions, then polish.
