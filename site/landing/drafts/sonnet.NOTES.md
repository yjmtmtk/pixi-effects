# pixi-effects LP (sonnet) - notes

## Design idea
The product is "video as data", so the page is a timeline. A sticky ruler with a playhead (scroll = time, section diamonds = keyframes you can click) runs along the top. Keyframe diamonds, track bars, a faint 12-column frame grid, corner crop marks and an easing curve are the only ornaments. Headlines are heavy tight sans with one serif-italic word in the accent colour. Palette: ink / paper / one surface step / mid grey line, plus one vermilion accent (lighter in dark, darker in light for contrast). The code and timeline panels stay dark in both themes, like a monitor.

## Sections and what they are for
1. Hero: headline, one-line explanation, CTAs, install line. Then "data in" (the real FACTS snippet, reformatted to short lines), "video out" (click-to-load live iframe of a published piece, 6 switchable) and a full-width timeline of the same snippet whose playhead loops and lights the matching code lines and a mini "Hello" frame. Makes "data in, video out" literal in ten seconds.
2. What you get: six tracks (Write, Run, Look, Move, Sound, Present), facts only, plus an animated power2.out curve.
3. Built for AI: write/check/look/fix loop, check tool + contact sheet, view tool + two timeline images, skill, chat-only prompt (copyable).
4. Gallery: count (11/12/16 by model), the 48 s MA poster, 15 posters in four balanced columns of natural ratios; all link to the live gallery.
5. Comparison: 9-row table (turns into labelled cards on mobile), "Choose X when" for all three including "do not choose pixi-effects when", trust note, links to their pages, "checked 2026-10-07".
6. Get started: install, one-file path, chat path, trimmed import map, honest status.
7. Footer: links, licence, plain description.

## Could not verify
- Live iframes load from the published site; I only tested that the iframe is created on click, not that each piece plays (no network use).
- The trimmed import map is copied from the repo's ai/template.html; I did not run it as a standalone page.
- The snippet is reformatted (line breaks only) and `kenBurns` (unused) is dropped from the import.
- Layer-duration drawing in the hero timeline follows the guide ("duration defaults to the parent's", keyframe `at` is relative to the layer).
- Gallery tiles link to the gallery root, not per-piece pages (not all are published).
- Remotion sound is marked "not compared here" because FACTS has no data.
- Safari/Firefox rendering untested (checked in headless Chrome only, widths 390 and 1440, dark and light, plus theme toggle, facade click, piece switch).

## With more time
- Real per-piece deep links once all pages are published; a self-hosted looping poster video instead of stills.
- A "diff" view in the comparison (filter rows) and a short note on what each tool's own AI loop looks like in practice.
- Replace the system-font stack tuning with per-OS checks (Windows/Android), and add print styles.
- Tighten mobile hero (the three CTAs stack tall) and test with real iOS Safari.
