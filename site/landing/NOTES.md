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

## Sections, and what each is for

0. **Top bar**: wordmark + version pill, chapter links, timecode readout, theme button (auto → light → dark, persisted in `localStorage`; `data-theme` on `<html>` also lets you force a theme).
1. **Hero**: headline, lede, three CTAs (gallery / guide / GitHub), a "slate" of hard facts (output, where it runs, install, dependency, licence), then the composition panel with the real snippet, the plotted timeline, and the poster facade. Clicking the poster loads `examples/gallery/kinetic-manifesto.html` in an iframe (one of the published pieces). Nothing loads from the network until that click.
2. **01 What you get**: six capability groups as an open, rule-separated track list (composition, export, camera, motion, audio, presenter) — every claim taken from FACTS.md, including the browser-support caveat.
3. **02 Written by AI, checked by AI**: the differentiator, as a four-step loop (write → check → look → fix), with the real contact sheet and both timeline screenshots, and the chat-only entry with the prompt from the README and a Copy button.
4. **03 Gallery**: 16 of the 42 posters in a CSS-columns masonry (16:9, 9:16, 1:1, 4:5), each with title, size, duration and model; all link to the live gallery index (per-piece pages are not all published). The tally gives the fable / opus / sonnet counts.
5. **04 Compare**: a nine-row table (responsive: becomes labelled cards under 820 px) and four "Choose … when" blocks, including "Not pixi-effects when…". "Checked 2026-10-07, from their own pages" with links; where the fact sheet had nothing (Remotion and sound) the cell says so instead of guessing.
6. **05 Start**: one file (CDN address + link to `ai/template.html`), npm (install and headless render lines), chat/agent; then the honest status block (experimental, pre-1.0, no GUI editor, WebCodecs browser, no benchmark, 99 s export figure).
7. **Footer**: links (GitHub, npm, guide, gallery, music lab, skill), the plain-sentence description, licence.

## How it was checked

- Headless Chrome screenshots at 1440 and 390 in **both** themes (forced via `data-theme`), five rounds of fixes: mobile overflow (brand pill, grid `min-width:auto`, nowrap labels), Copy buttons overlapping text, unbalanced figure heights, card-soup (two sections re-cut as open lists), chapter headers wrapping on phones, dead space in the hero panel (replaced an overlay caption with a real info block), a hole between lede and CTAs (grid alignment), mustard amber in light.
- No horizontal scroll at 390 px (verified by the shoot script and an element-by-element probe).
- Interactions verified in headless Chrome: scroll timecode and playhead, theme cycling (background actually changes), iframe facade, copy buttons; console clean; headings h1 → h2 → h3; every image has alt; ~59 KB.
- `prefers-reduced-motion` turns off the headline rise, the timeline draw-on and the playhead sweep. Focus rings on everything; skip link; the facade button says what it loads and from where.

## Not verified / inferred

- The `timeline-collapsed.jpg` caption says repeated layers are "collapsed into one row": inferred from the `×70`, `×10` suffixes visible in the image and the file name, not from the fact sheet.
- "AI models wrote most of them": the fact sheet says "many"; the per-piece model list in PIECES.txt covers all 42, so "most" is conservative.
- Links to `ai/template.html`, `ai/SKILL.md`, `ai/CHAT.md` on GitHub `main`: the files exist in the local repo; the public URLs were not fetched.
- The live iframe and the external links were not loaded over the network in this environment.

## With more time

- A real recorded loop of a piece (muted WebM, a few seconds) in the hero facade instead of a still poster — the page claims motion but shows stills until the click.
- A second interactive moment: hovering a row of the comparison table could highlight the matching "Choose when" card.
- Per-piece deep links once every gallery page is published, and `srcset` for the posters (the 640 px sources are soft on 2× screens at 1440).
- An inline SVG "how it fits" diagram (data → one frame path → play / scrub / export) in section 01.
- Tighten the `Not pixi-effects when…` copy with the author; it is the paragraph that earns the reader's trust and deserves their voice.
