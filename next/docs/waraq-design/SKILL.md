---
name: waraq-design
description: "Design language for Waraq (ورق), the Arabic/English PDF studio. Load when building or restyling any Waraq screen, panel, dialog or component (start screen, Edit, Layers, polish). Not for user-document content such as covers."
version: 1.0.0
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# Waraq design

Source of truth: `src/styles/tokens.css`. Use its CSS variables only; never write a raw hex, px size or shadow in a component. If a value is missing, add a token there first.

## Philosophy
A calm, crisp, Acrobat-like tool: paper, one green, thin lines. Hierarchy comes from size, weight and spacing, not colour or decoration. The document is the hero; chrome stays quiet. One primary action per view. Bilingual by default: every screen is designed in English and Arabic at once.

## Colour (Waraq colours only)
Light: paper `#fafbf8`, green `#15775d`, mint `#eaf3eb`, ink `#233c36`. Themes are chosen by hand (never from Windows) via `data-theme` on `<html>`: light (default), `dim`, `dark`, `graphite`. Dark modes are hand-tuned (no pure black, no inversion), so never derive a dark colour; use the variable.

| Var | Role |
|---|---|
| `--paper` | app background |
| `--surface` | cards, panels, inputs, menus |
| `--canvas` | behind pages, scroll tracks |
| `--page` | PDF page, white in every theme |
| `--line` | all borders and dividers |
| `--ink` / `--muted` | text / secondary text, icons |
| `--green`, `--green-deep` | primary fill, links, selected; hover of primary |
| `--green-soft` | hover and selected tint |
| `--on-green` | text on green |
| `--danger` | destructive and errors |
| `--focus` | focus ring |
| `--veil`, `--select-tint` | busy cover, hover on a page |

Values: light `--line #e0e7de`, `--muted #56695f`, `--danger #a34438`, `--canvas #eef1eb`. Dim and Dark use sage greens (`--green #5fa98d`, ink ~`#e3eae5`); Graphite swaps the accent to soft teal-blue `#6aa6b8` on charcoal. Always check a new screen in all four themes.

Rules: green is the only accent; at most one green-filled button per view. State is shown by `--green-soft` fill + green text, not new colours. Contrast ≥ 4.5:1 for every text/background pair in every theme (muted text included). Never use colour alone to carry meaning.

## Type
Font var `--font`: Segoe UI Variable / Segoe UI; Arabic (`dir=rtl`) switches to Tajawal; Amiri only for Arabic reading text in documents. Sizes (tokens `--fs-*`): 12, 14, 16, 18, 20, 24, 32, 40 and nothing else.

| Use | Size | Weight |
|---|---|---|
| Body, controls, labels | 14 | 400 / 600 on buttons |
| Captions, hints, badges | 12 | 400 |
| Section title | 16 | 600 |
| Dialog or panel title | 18-20 | 600 |
| Screen title | 24 | 600 |
| Start-screen hero | 32-40 | 600 |

Line height 1.5. Counters, page numbers and sizes use `.num` (tabular). Sentence case everywhere: no Title Case, no ALL CAPS, no tracked uppercase labels. No gradient or text effects.

## Space, shape, size
8 px grid, tokens `--s-4/8/12/16/24/32/48`; gap between controls is 8 minimum. Radii `--r-8` (controls, inputs), `--r-12` (cards, menus), `--r-16` (dialogs). Controls `--control` = 36 px tall (44 on `pointer: coarse`); never hand-set heights below it. Icons 18 px, `svg.icon`, stroke style, one set, `currentColor`. Hit areas of icon buttons are the full 36/44 square.

## Depth
Flat first: 1 px `--line` border on `--surface`. `--shadow` only for floating things (menus, popovers, dialogs). No gradients, glows, glass, blur, neon, emoji, decorative illustrations, pulsing or bouncing. Motion: 120-200 ms ease-out on colour/opacity/position, nothing else; respect `prefers-reduced-motion`.

## Components (reuse, don't reinvent)
- `.btn` default: surface, 1 px line, radius 8, weight 600; hover mint + green border.
- `.btn.primary`: green fill, `--on-green` text; hover `--green-deep`.
- `.btn.icon`: transparent, muted; hover mint + ink. Needs `aria-label` + tooltip.
- Disabled: opacity .5, no hover. Focus: `:focus-visible` 2 px `--focus` outline, offset 2; never remove it.
- Inputs: surface, 1 px line, radius 8, 36 px; focus ring as above; label always visible above, not placeholder-only.
- Menus/popovers: surface, line, `--r-12`, `--shadow`, items 36 px; arrow-key navigable.
- Cards (start-screen modes): surface, 1 px line, `--r-12`, 16-24 padding, icon 18-24 + 16/600 title + 14 muted line; hover mint border green; whole card is one button.
- Seamless top edge: title bar, tab strip and toolbar share `--paper`/`--surface` with a single 1 px `--line` underneath; no gap, shadow or colour change at the top of the window. Desktop title strip is 40 px.
- Side panels (Layers etc.): `--surface`, one 1 px line on the inner edge, row 36 px, 8 px gaps, selected row `--green-soft`.
- Empty and error states: one sentence in `--muted` plus one action; errors in `--danger` with text, not colour alone.
- Scrollbars: use the global thin ones; don't restyle.

## Language and RTL
- Every string exists in EN and AR in `src/lib/i18n.svelte.ts` (grep for duplicate keys). No hard-coded text, no strings built by concatenation; Arabic needs its own word order, so use full-sentence keys with placeholders.
- Layout mirrors fully under `dir=rtl`: use logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`, `border-inline-*`) and flex/grid order, never `left/right`. Directional icons (back, next, chevrons, undo/redo, indent, panel toggles) flip; logos, clocks, checkmarks, media and document pages don't.
- Numbers: keep tabular figures; Arabic UI may use Western digits as the app already does. Mixed EN+AR strings get `dir="auto"` or `<bdi>`.
- Arabic text is ~15% wider or taller; never fix widths, never truncate labels without a tooltip, give Tajawal the same sizes (no smaller than 12).

## Responsive and touch
Nothing scrolls sideways; narrow screens (≤ 820 px) fill `100dvh`. Touch targets 44 px via `--control`. Never rely on hover for a function.

## Banned
Hex literals or off-scale sizes in components; third accent colours; gradients, glows, shadows on inline elements; emoji or "New" badges; Title Case or uppercase labels; icon-only buttons without label; placeholder-only fields; `left/right` CSS; theme from `prefers-color-scheme`; modal on top of modal; toasts that hide the only error message.

## Done checklist
1. Tokens only. 2. Sizes on the scale. 3. All text ≥ 4.5:1 in light, dim, dark, graphite. 4. Controls ≥ 36 px. 5. 8 px grid. 6. Sentence case. 7. EN and AR strings, RTL mirrored and visually checked. 8. Keyboard: tab order, focus ring, Esc closes. 9. `tests/e2e/audit.spec.ts` green for the new screen, English and Arabic (add the screen to it).
