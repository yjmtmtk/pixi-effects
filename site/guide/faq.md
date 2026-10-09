---
title: FAQ and troubleshooting
section: More
order: 2
summary: The questions people ask first, and the fixes for the problems people hit first.
---

## The canvas is black

Open the browser's developer console. pixi-effects prints a warning for almost every mistake, and the warning says what to change. Common causes: a typo in a layer's `type`, an asset that failed to load (a wrong path, or a file opened from `file://` that the browser blocks), or `window.__ready` never reached because `init` threw. Use a local web server (`npx serve`) for pages that load files; a page with no asset files works when opened directly.

## There is no sound

- Browsers keep sound off until the page has had a click or a key press. Press play (that is a click). The sound starts from the right place when it is allowed.
- A music file shorter than the movie needs `loop: true`.
- Run `movie.inspectAudio()` (or *check*): it lists layers that are inaudible, cut off or clipped.

## My text is cut off or in the wrong place

Text is positioned by its **top-left** unless you set `anchorX: 0.5` and `anchorY: 0.5`. A text layer's size is `w` and `h` in expressions. Run `movie.inspect(frame)`, which reports text off the canvas, cut by an edge, or overlapping. A web font must be loaded before `init` (`await document.fonts.load('48px "My Font"')`), or the fallback font is measured and drawn.

## The export fails or has no audio

- **"This specific encoder configuration is not supported" with sound.** That was Chrome on Linux, which has no AAC encoder. Current versions fall back to Opus inside the MP4 with a warning; or export WebM.
- Very long, high-bitrate exports are built in memory; lower the bitrate or split the video.
- Rendering in a script: `npx -p pixi-effects pixi-effects-render page.html -o out.mp4` needs Node 22+ and Chrome.

## A filter does nothing, or paints a black box

Centres of `twist`, `shockwave` and similar are in **canvas pixels** (the default is the top-left corner). `grayscale` and `oldFilm` paint a widened `filterArea` black; glow and blur need one. See [Filters](filters.html).

## It looks different in Safari or Firefox

Chrome is the most tested browser. Safari 16.4+ and Firefox 130+ are supported, but they are less tested (autoplay rules, WebCodecs support and some codecs differ). If you find a difference, an issue with the page and the browser version helps a lot.

## Do I have to use the player bar?

No. The bar is the `Controller`, a separate import. You can change its colours with one option, or build your own player on the movie's events: see [The player](player.html).

## Can I use it without a bundler?

Yes: [Your first video](getting-started.html) is one HTML file with an import map. With npm, `pixi.js` and `gsap` are peer dependencies (they must be the same copy your page uses), so install them next to `pixi-effects`.

## Can I use my own fonts, images and video?

Yes. Images and video are `assets` (a URL, a `data:` URL or a `blob:` URL). Fonts must be loaded before `init`. For a sample page with no external files, use shapes, system fonts and generated sounds.

## How stable is the API?

It is **pre-1.0**. Minor versions can change the API; the [changelog](https://github.com/yjmtmtk/pixi-effects/blob/main/CHANGELOG.md) lists every change. Pin the version in your import map (`pixi-effects@0.9.0`).

## Can I make slides with it?

Yes. Put `stops` in the composition (or lay out pages with `deck()`) and the movie pauses where you say; a `Presenter` moves through them with the arrow keys, a click or a swipe, with a page overview (G) and a presenter view with notes (P). A deck exports to PDF too. See [Presenting](presenting.html).

## Can the picture react to music?

Yes, and it stays deterministic: `audioEnvelope()` analyses the file before `init`, and `react()` turns loudness, bass / mid / treble and the beats into ordinary keyframes, so a render looks exactly like the preview. See [Audio](audio.html#visuals-that-follow-the-music).

## Where do I report a problem or ask something?

[GitHub issues](https://github.com/yjmtmtk/pixi-effects/issues). Include the page (or a small piece of it), the browser and its version, and the warnings from the console.
