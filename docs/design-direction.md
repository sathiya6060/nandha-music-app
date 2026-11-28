# Nandha Music — Design Direction (STEP 0)

> **Status: PROPOSAL — needs Sathiya's approval before STEP 1–10.**
> Nothing in this doc changes any code. The font change in §2 is a brand
> decision and is proposed here, not decided. Approve / change / reject
> each item in the morning review; STEP 1–10 only starts after approval.

## Direction — "Tamil print/poster culture"

One committed direction: the app should feel like a **Tamil film poster /
printed ticket**, not a generic dark streaming template. Warm paper-sand
surfaces against ink-slate, bold Tamil display lettering, poster-style
composition (big title, one Play button, waveform strip), halftone/grain
texture, and amber used like a **stamp / highlighter — sparingly, never
as a wash**. Dark mode stays the default shell; the light Warm Sand
paper surface is used for **lyrics, featured-release cards and the
full-player sheet**, so the app is never one flat slate field.

Presentation, layout, copy and motion only — no feature, route, data or
logic changes.

## 1. Palette tokens

Brand anchors (unchanged, exact):

| Token | Hex | Role |
|---|---|---|
| `--gold` | `#F59E0B` | Amber Gold — primary action, stamp/highlight, icons on dark |
| `--slate` | `#1E293B` | Charcoal Slate — raised surface, primary text on paper |
| `--sand` | `#FEF3C7` | Warm Sand — paper surface, primary text on dark |
| `--steel` | `#64748B` | Steel Grey — secondary text **on light surfaces only** |
| `--white` | `#FFFFFF` | Pure White — strongest text on dark |

Derived tokens (proposed — 3 only):

| Token | Hex | Role |
|---|---|---|
| `--ink-deep` | `#0F172A` | Deepened slate — the app **background**. Darker than `--slate`, so raised surfaces finally read as raised. (Already in use today as the Discover scrim colour.) |
| `--slate-raised` | `#2C3E55` | Raised surface — visibly lighter than `#1E293B`, with a 1px inner top highlight. Replaces the current `--surface == --bg` flatness. |
| `--gold-deep` | `#92400E` | **Already in `theme.css`** — confirmed, not new. The only gold allowed as **text on light surfaces** (5.9:1 on white, 5.3:1 on Warm Sand, WCAG AA). Brand gold `#F59E0B` must never be body/link text on sand. |

Contrast rules (kept from today, verified in STEP 10): gold `#F59E0B` on
slate is 6.81:1 and on the darker `--ink-deep` only better; sand text on
`--slate-raised` stays well above 4.5:1; steel `#64748B` is never text on
dark (too low contrast) — dark-surface secondary text stays a sand tint.

## 2. Type — PROPOSAL (needs approval)

**Display face: Anek Tamil** (Ek Type, variable 100–800, SIL OFL, on
Google Fonts / Fontsource). *Justification in one line: it is the only
candidate that draws Tamil and Latin display type in the same family at
poster weights (700–800), so a Tamil title and its English secondary
line share one voice — no fallback mismatch — and its heavy strokes
hold up at 320px like Tamil film-poster lettering.*

**Text face: Instrument Sans (Latin) + Noto Sans Tamil (Tamil).**
*Justification in one line: Instrument Sans stays quiet and neutral
under the display face, and Noto Sans Tamil is already the proven Tamil
text renderer in this app — keeping it means Tamil shaping is never
re-proved.*

Alternatives considered and set aside: Baloo Thambi 2 (too rounded /
playful for a label), Mukta Malar (elegant but lighter display voice),
Hind Madurai (clean, but less poster character than Anek Tamil).

**Self-hosting plan (STEP 1):** woff2 only, via Fontsource
(`@fontsource-variable/anek-tamil`, `@fontsource/instrument-sans`,
Noto Sans Tamil Tamil+Latin subsets); `font-display: swap`; preload
the 2 critical files (Anek Tamil 800 display, Instrument Sans 400
body); **delete the current Google Fonts `@import`** (slow on slow
data, privacy, CSP); total font budget **≤ 120 KB**.

**Type scale:** 12 / 14 / 16 / 18 / 22 / 30 / 44 px, hero with
`clamp(30px, 8vw, 44px)`. Tamil line-height 1.5–1.6, English 1.35.
Titles: **Tamil first**, English as a quiet secondary line.
Lyrics max 70ch. `tabular-nums` for durations/counts.
`text-wrap: balance` on headings. Max 2 families, no more.

## 3. Spacing scale

4px base unit: **4 / 8 / 12 / 16 / 20 / 24 / 32 / 48**.
Section gap 28–32, card padding 16–20, list row gap 2, rail gap 12–16.
Nothing sized off-scale.

## 4. Radius rules

- **4px** — chips, inputs, buttons (crisp, print-like).
- **8px** — menus, toasts, small inline cards only.
- **16px** — cover art and sheets only.
- No 12px default anywhere. Stop rounding everything the same.

## 5. Elevation rules

- **Paper (sand) cards only** get layered soft shadows.
- **Dark surfaces** get depth from borders + a subtle 1px inner top
  highlight — never glow, never drop-shadow on slate.
- Hero / poster: one soft shadow + grain, no stacked cards.

## 6. Surfaces & texture

Three real levels, never equal: `--bg` = `--ink-deep` (deep slate),
`--surface` = `--slate-raised`, `--paper` = Warm Sand `#FEF3C7`
(lyrics, featured release, full-player sheet).
Texture: **3–4% noise/grain overlay** (tiny data-URI / SVG filter) on
hero + paper surfaces only. Covers: deterministic poster compositions
from the track id (amber sun-disc, kolam pattern, halftone stripes,
huge cropped Tamil letter) — **CSS/SVG, not AI images** — with blur-up
and fixed aspect-ratio; artist photos get a slate+amber duotone so
mixed-quality photos look consistent.

## 7. Motion rules

- `--ease-out: cubic-bezier(.2,.8,.2,1)`; durations **120 / 200 / 320 ms**
  (press / state / sheet). Full-player sheet: spring ease, 280 ms.
- Staggered fade-up on first paint of rails, 40 ms steps, once.
- Button press `scale(.97)`; Like = small amber burst; page transition
  150 ms fade. Waveform/equaliser animates **only while playing**.
- `prefers-reduced-motion`: disable all but opacity.

## 8. Never do (5)

1. **No Inter / Roboto / Poppins as the identity**, no purple/blue
   gradients, no glassmorphism, no neon glow, no gradient text.
2. **No identical rounded-12px card grids for every section** — a
   different section gets a different layout (rail / dense list /
   poster tiles / circular portraits).
3. **No grey "N" placeholder boxes**, no emoji as icons (Lucide only),
   no centred-everything hero.
4. **No generic stock copy** ("Discover amazing music", "Oops!") —
   short, human, Tamil-first, sentence case, verbs on buttons.
5. **No amber text on light surfaces** (gold `#F59E0B` as body text on
   sand fails contrast) and **no surface == background** flat slate.

## Approval checklist (morning review)

- [ ] Direction "Tamil print/poster culture" — approve / change
- [ ] Display font **Anek Tamil** + text **Instrument Sans / Noto Sans Tamil** — approve / pick another
- [ ] Derived tokens `--ink-deep #0F172A`, `--slate-raised #2C3E55`, `--gold-deep #92400E` (confirmed) — approve / change
- [ ] Paper-sand full-player sheet + lyrics surface — approve / change

*Shared with the admin redesign: the admin panel reuses these tokens
(fonts, colours, radius, focus ring) but stays denser and quieter.*
