# Waraq — plan after 1.0 beta 2 (written 27 Oct 2026, Fable; executed by the Opus manager with the TEAM.md structure)

Status: **1.0 beta 2 is live** — pwaraq.com (Cloudflare prod `4d61b37e`, rollback `9f6d79da` = 0.3.3 site), GitHub release
`v1.0.0-beta.2` (installer SHA-256 `eeb74a21…3fd7`), PWaraq synced to waraq-next `a21bf12`. Backup `Backups\2026-10-22-golive`.
Open problem: Defender flags the installer (`Trojan:Win32/Wacatac.H!ml`, ML false positive); submitted to Microsoft 23 Oct from alb2131@hotmail.com.

Rules unchanged: release gate (test + owner's clearance per release), owner is the git author, no secrets in sessions, EN+AR for every UI string, design audit green on 4 themes.

## Phase 0 — unblock the Windows download (this week, highest priority)
| # | Step | Who | Done = |
|---|---|---|---|
| 0.1 | Check Microsoft's answer on the false positive (owner's hotmail). Rescan `release\Waraq_1.0.0-beta.2_x64-setup.exe` with `MpCmdRun -Scan -ScanType 3`. | Manager (2 calls) | clean, or still flagged |
| 0.2 | If still flagged: owner double-clicks `build-signed.cmd`; manager scans the new exe; if clean → owner runs `gh release upload v1.0.0-beta.2 <exe> <sig> --clobber`; Releaser regenerates `manifest.json` (SHA + sig change) and re-stages the site; owner says "yes" → manager deploys production. | Owner + Manager + Releaser | download works in Chrome without a warning |
| 0.3 | Code-signing certificate — the lasting fix. Researcher: one-page memo on Azure Trusted Signing (≈ $10/month; needs an Azure account + identity check; signs with `signtool` in CI or locally) vs an OV certificate (≈ $200–400/yr, hardware token). Owner decides and buys. Builder: add the signing step to `tools/dev/build-signed.ps1` (+ GitHub Actions later). | Researcher → Owner → Builder | installer shows the publisher name; SmartScreen reputation starts |
| 0.4 | Release automation so the owner only double-clicks: GitHub Actions `release.yml` on tag `v*`: build Tauri, sign the updater with `TAURI_SIGNING_PRIVATE_KEY` from repo secrets (owner pastes the key once in GitHub → Settings → Secrets), run `installer-test.ps1`, attach exe+sig to the release. The site's `manifest.json` is then generated from the release asset. | Builder (Sonnet) | a tag push produces a tested, signed release |

## Phase 1 — beta feedback loop (weeks 1–3)
| # | Step | Who |
|---|---|---|
| 1.1 | Owner's own use: iPhone/iPad check of pwaraq.com/app (Portfolio, Edit), 3 real drawings through Edit white-cover, 2 scanned Arabic docs through OCR. Report problems in this chat; manager turns each into a Builder brief. | Owner |
| 1.2 | Crash-log triage: once a week the manager asks a Tester to read reports that arrive at support@pwaraq.com / GitHub issues and reproduce the top 3. | Tester |
| 1.3 | Ctrl+wheel zoom in the tasks that still lack it (Comment, Forms, Redact, OCR, Sign): give them the Viewer's zoom (one shared `zoomable` action) — one Builder, one spec `ctrlwheel.spec.ts` extended. | Builder |
| 1.4 | Comment: Arabic text box drawn with Tajawal (today Helvetica → nothing). Reuse `annots.ts` Arabic picture path already used for FreeText. | Builder |
| 1.5 | Edit on drawings: "Cover + type" in one gesture (draw the white box, the text box opens inside it, same size as the covered strip). Owner asked for easy drawing edits; this is the next step after the white cover. | Builder |
| 1.6 | Save after Organize/Comment keeps protection (PLAN.md line 746 "Not yet"). | Builder |
| 1.7 | Beta 3 release when 1.3–1.6 land: full suite on the built app + Tester Chrome pass + owner's yes. | Manager + Releaser |

## Phase 2 — iPhone / iPad (start after beta 3; parallel with Phase 1 research)
| # | Step | Who | Notes |
|---|---|---|---|
| 2.1 | **PWA now (free, 1–2 days):** `manifest.webmanifest` for `/app/` (name ورق / Waraq, icons 192/512/maskable, `display: standalone`, `start_url: /app/`), `apple-touch-icon`, `apple-mobile-web-app-*` metas, a tiny service worker that caches the shell + engine WASM (not documents), "Add to Home Screen" hint on iOS Safari (EN+AR). Measure memory on an iPad with the owner's A0 drawing and a 50-page OCR job; write limits into PLAN.md. | Builder + owner's iPad | the existing 0.3.3 `sw.js` at `/` must keep ignoring `/app/` (stage.cjs already patches it) |
| 2.2 | **Licence check before any App Store work:** Researcher memo — MuPDF is AGPL-3.0; App Store terms vs (A)GPL (VLC 2011 precedent); options: Artifex commercial licence (ask for an indie quote), or ship the iOS app outside the store (TestFlight only / enterprise) . Owner emails Artifex. | Researcher → Owner | **gate for 2.4** |
| 2.3 | Apple Developer Program enrolment ($99/yr, owner's identity) + App Store Connect API key (Issuer ID, Key ID, .p8) saved as GitHub secrets `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`. No Mac needed with Tauri's automatic signing. | Owner |
| 2.4 | `tauri ios init` in `src-tauri/gen/apple`, iOS-only config (`tauri.ios.conf.json`: no updater, no single-instance, no window-state, no Office/CAD packs, no Surya), Files-app open/save via the share sheet, touch layout from a120675. GitHub Actions `ios.yml` on `macos-latest` (free for the public repo — verify on docs.github.com billing first): `tauri ios build --export-method app-store-connect` → `xcrun altool --upload-app … --apiKey --apiIssuer` → TestFlight. | Builder (Sonnet, high) | owner installs TestFlight on iPhone/iPad |
| 2.5 | iPad polish round from TestFlight use (pencil, split view, external keyboard shortcuts), then App Store submission (screenshots EN+AR, privacy "no data collected", review notes). | Builder + Owner |
| 2.6 | Android later by the same route (Tauri android, Play Console $25 once) — not before iOS ships. | — |

## Phase 3 — 1.0 final (after ≥ 4 weeks of beta with no new majors)
- Arabic editing residue 29 → re-run `pnpm stress`; fix only what is cheap; document the rest.
- OCR "Best" pack (Surya) as an optional desktop download (OCR-STRENGTHEN-BRIEFS §C).
- Microsoft Store listing (MSIX exists in `release/`; needs the Partner Center account, $19 once).
- 1.0.0 tag, press-style notes EN+AR, 0.3.3 classic retired from the site menu (kept at /classic.html).

## Standing items
- Weekly: `Backups\<date>` bundles after any release; `pnpm stress:quick` nightly via `tools/stress/schedule.ps1` (register once).
- Memory/handover: keep HANDOVER-NEXT-CHAT.md ≤ 60 lines; details live in PLAN.md and this file.
- Tokens: TEAM.md rules; the manager never reads whole transcripts — workers' 5-line reports only.

## First three actions for the Opus manager
1. Phase 0.1 (2 tool calls). If flagged → tell the owner to double-click `build-signed.cmd`, then 0.2.
2. Start Researcher **R1** (code signing memo, 0.3) and Researcher **R2** (MuPDF/App Store licence memo, 2.2) — both read-only, Haiku/Sonnet low, ≤ 1 page each.
3. Start Builder **B1** (PWA, 2.1) — Sonnet medium; brief = this file's row 2.1 + `waraq-site-1.0/tools/stage.cjs` sw.js note.
