# pixi-effects landing page — design notes

## The idea

The product's one sentence is "a video is data". So the page borrows the visual language of the thing it produces: a timeline. Chapters are tracks (`01 ◆ What you get ———`), a 2 px accent playhead at the top of the viewport scrubs as you scroll and the top bar shows the position as a timecode (`00:00:00 / 00:12:00`, the page is "12 seconds at 30 fps", the length of a typical gallery piece), keyframe diamonds are the only ornament, and the hero is a "composition panel": the real minimal snippet on the left, a gallery poster on the right, and underneath the code a tiny timeline that plots exactly the two layers in that snippet (`text "Hello"` 0.5 → 6 s with its 0.6 s tween; `chime` at 1.1 s). Data in, video out, in one object.

Code panels stay dark in both themes (they are "monitors"); the page chrome flips between ink and warm paper. The paper tone echoes the cream of several gallery posters (間 MA, Form Follows, The Quiet Hours) so the posters sit well in the light theme too.

## Palette

- Ink `#0b0d12` (dark background) / paper `#f4f1ea` (light background)
- Text `#eceef2` · `#a3a9b5` · `#7f8694` on dark; `#16150f` · `#5c5a52` · `#706d64` on light (all ≥ 4.5:1 on their background; checked with a small script)
- One accent, vermilion: `#ff5a3c` on dark, `#c43316` on light (4.9:1 on paper). The playhead, the diamonds, the word "data.", the audio track.
- Amber `#f2c14e` / `#e0a526`, only for the "clip" bars (the timeline viewer's colour for visual layers) — decorative, never text.
- Type: system stack. Display and body `Helvetica Neue / Inter / Segoe UI / system-ui`, data and labels `ui-monospace / SF Mono / Menlo`. Hero at `clamp(50px, 14.5vw, 128px)`, body 17 px, labels 11–12 px mono with tracking.

## Sections, and what each is for (restructured 2026-10-15: show, do not teach)

The page shows what the library can do and that one sentence to an AI is enough. Everything an AI reads lives on `for-ai.html`; there is no Guide, no comparison, no music lab and no tour.

0. **Top bar**: wordmark, the four entrances (Gallery, Interactive, Playground, For AI), theme button.
1. **Hero**: headline, one sentence of lede, the reel (played live from the published page), the two films (`ink-and-paper`, `light-as-material`, played live the same way) and the composition panel with the real minimal snippet and its plotted timeline.
2. **01 One sentence**: the sentence an AI is told, with endings that swap and a Copy button. The heart of the page.
3. **02 Gallery**: 43 pieces; a real piece plays on a click, a masonry of 12 posters opens each piece in a dialog.
4. **03 Interactive**: six posters of the live samples and a link.
5. **04 Start**: links to For AI, GitHub and npm, and the status line.
6. **Footer**: from `scripts/site-parts.mjs`.

## How it was checked

- Headless Chrome screenshots at 1440 and 390 in **both** themes (forced via `data-theme`), five rounds of fixes: mobile overflow (brand pill, grid `min-width:auto`, nowrap labels), Copy buttons overlapping text, unbalanced figure heights, card-soup (two sections re-cut as open lists), chapter headers wrapping on phones, dead space in the hero panel (replaced an overlay caption with a real info block), a hole between lede and CTAs (grid alignment), mustard amber in light.
- No horizontal scroll at 390 px (verified by the shoot script and an element-by-element probe).
- Interactions verified in headless Chrome: scroll timecode and playhead, theme cycling (background actually changes), iframe facade, copy buttons; console clean; headings h1 → h2 → h3; every image has alt; ~59 KB.
- `prefers-reduced-motion` turns off the headline rise, the timeline draw-on and the playhead sweep. Focus rings on everything; skip link; the facade button says what it loads and from where.

## Not verified / inferred

- The `timeline-collapsed.jpg` caption says repeated layers are "collapsed into one row": inferred from the `×70`, `×10` suffixes visible in the image and the file name, not from the fact sheet.
- "AI models wrote most of them": the fact sheet says "many"; the per-piece model list in PIECES.txt covers all 52, so "most" is conservative.
- Links to `skills/pixi-effects/template.html`, `skills/pixi-effects/SKILL.md`, `ai/CHAT.md` on GitHub `main`: the files exist in the local repo; the public URLs were not fetched.
- The live iframe and the external links were not loaded over the network in this environment.

## With more time

- A real recorded loop of a piece (muted WebM, a few seconds) in the hero facade instead of a still poster — the page claims motion but shows stills until the click.
- Per-piece deep links once every gallery page is published, and `srcset` for the posters (the 640 px sources are soft on 2× screens at 1440).
- An inline SVG "how it fits" diagram (data → one frame path → play / scrub / export) in section 01.
- Tighten the `Not pixi-effects when…` copy with the author; it is the paragraph that earns the reader's trust and deserves their voice.
