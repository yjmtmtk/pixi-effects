---
title: Reviewing your video
section: Guides
order: 10
summary: See what you made without playing it, scrub it against a timeline, and check the sound you cannot hear.
---

A video is hard to judge from code, so pixi-effects ships ways to look at it. They matter most when an AI wrote the video, but they are just as useful for yours.

## One command: check

```bash
npx pixi-effects-check my-video.html
```

It opens your page in a private headless Chrome and reports, in one go:

- **warnings** the library printed (every one says what to change);
- **layout** problems found by `movie.inspect` over the whole timeline: text off the canvas, cut by an edge, empty, or overlapping other text (overlaps are listed for you to look at, since they are often on purpose);
- **sound**: `movie.inspectAudio()`, the loudness of the mix and a list of problems;
- **a real export**, decoded again: its size, length and loudness per second;
- a **contact sheet** (`sheet.png`, twelve labelled frames) and a **timeline** (`timeline.html`) to open.

The exit code is 0 when there is nothing to fix and 1 otherwise, so it also works in CI. This is its real output for the piece in the demo further down:

```text
pixi-effects check — examples/gallery/still-water.html
  page      ready in 2 s · 1280×720 · 30 fps · 360 frames (12 s) · audio
  warnings  none
  layout    no cut-off / off-canvas text over 61 frames (movie.inspect)
  audio     3 source(s) · mix peak -19.4 dBFS · no issues (movie.inspectAudio)
  export    mp4 ok · 8.55 MB · video 12.03 s 1280×720 · audio 12.031 s, peak -19.4 dBFS
  files     check-out/still-water/sheet.png  timeline.html  still-water.mp4  report.json
RESULT: OK — nothing to fix. Look at the contact sheet before you call it done.
```

The last line is on purpose: *check* cannot tell you whether a video is **good**, only that nothing is **broken**. Look at the contact sheet.

![A contact sheet of twelve frames](assets/contact-sheet.jpg)

*`sheet.png`: twelve labelled frames. The cheapest way to check a whole animation by eye.*

## See the timeline, and scrub it

```bash
npx pixi-effects-view my-video.html
```

Your browser opens on the page with a **timeline under it**: every layer as a bar on a time axis, ◆ at each keyframe, a shaded band for each transition, and a red playhead that follows the movie.

- Click or drag on the timeline to seek; click a layer's name to jump to where it starts.
- Space plays, ← and → step a frame (Shift: a second), + and − (or Ctrl/⌘ and the wheel) zoom; the whole movie fits the width at the start, and the names stay in place while you scroll sideways.
- Layers whose names differ only by numbers (`ring1`, `ring2`…) share one row, so a video with seven hundred generated layers is a screenful.

The same chart is available in code: `movie.timelineChart()` returns an HTML page, `movie.timelineData()` returns the rows, and `movie.timelineSvg()` returns just the chart.

![The timeline of a 706-layer piece, collapsed to 28 rows](assets/timeline-collapsed.jpg)

*The timeline of the countdown piece: 706 layers become 28 rows, because layers named `ring10-0`, `ring9-1`… share a row.*

{{demo examples/gallery/countdown-newyear.html}}

## In code

| Call | Gives you |
|---|---|
| `await movie.inspect(frame)` | where every layer is drawn at that frame, and the layout problems |
| `movie.inspectAudio()` | each sound's time, loudness and pitch, and the problems |
| `await movie.contactSheet({ count: 12, as: 'dataURL' })` | many frames on one labelled image |
| `await movie.snapshot(frame, { as: 'dataURL' })` | one frame as an image |

## The warnings are instructions

pixi-effects prints a console warning for almost every mistake: an unknown option (with a "did you mean"), a keyframe outside its layer, a text style typo, a mix that would clip. They are written to say what to change, so read them before anything else.
