---
title: Exporting video
section: Guides
order: 9
summary: MP4, WebM and MOV from the player, from code, or from a script with no window.
---

## From the player bar

The download icon on the bar opens a small panel: pick MP4, WebM or MOV and a quality, and the browser renders every frame, encodes it, and saves the file. Nothing is uploaded anywhere.

## From code

```js
const blob = await movie.render({ format: 'mp4', video: { bitrate: 'high' }, audio: { bitrate: 'high' } });
const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'video.mp4' });
a.click();
```

| Option | Values | Default |
|---|---|---|
| `format` | `'mp4' 'mov' 'webm' 'mkv'` | `'mp4'` |
| `video.bitrate`, `audio.bitrate` | `'very-low' 'low' 'medium' 'high' 'very-high'` | `'high'` |
| `video.codec`, `audio.codec` | a codec name | mp4 / mov: H.264 + AAC, webm / mkv: VP9 + Opus |

Listen to `movie.on('progress', ({ progress }) => …)` for a percentage and `movie.on('error', …)` for a failure.

- **Audio codec fallback.** Not every browser can encode every codec; Chrome on Linux has no AAC encoder. Unless you name a codec, the first one the browser can encode is used (for an MP4: AAC, then Opus), with a warning. A codec you name is never swapped: if it cannot be encoded the error says which one would.
- The finished file is built **in memory**, so a very long, high-bitrate video needs that much memory.
- Rendering steps through the frames one by one, so the result does not depend on how fast your computer is.

{{demo examples/08-presets-export.html}}

## Motion blur

Fast motion looks choppy at 30 frames a second. **Motion blur** exposes every frame the way a film camera does: it draws the frame several times at moments spread over the shutter interval and averages them, so fast things smear along their path.

```js
await movie.init({ /* … */ motionBlur: true });          // 8 samples, a 180° shutter (the film look)
// or per call: movie.render({ motionBlur: { samples: 16, shutter: 0.75 } }), movie.snapshot(90, { motionBlur: false })
```

It applies to what you *make*: the exported video, snapshots and contact sheets, so `pixi-effects-check` shows what the file will look like. Live playback in the browser is not blurred. A render takes about `samples` times as long. `shutter` is how long the shutter stays open as a fraction of a frame (0.5 is the film look, 1 blurs more); `samples` is 2 to 64. More samples smooth very fast motion, which otherwise shows as separate ghost images.

{{demo examples/gallery/hanabi-night.html}}

The piece above is exported with motion blur (`motionBlur: { samples: 8, shutter: 0.55 }`): the rockets are streaks in the file. In the page you are playing, live playback is not blurred.

## From a script, with no window

```bash
npx pixi-effects-render my-video.html -o my-video.mp4
```

It starts a private web server and a headless Chrome, opens your page, waits for `window.__ready === true`, renders, and saves the file. The container follows the extension (`.mp4 .webm .mov .mkv`). Options:

| Flag | Does |
|---|---|
| `--quality very-low…very-high` | video and audio bitrate |
| `--query lang=ja` | adds a query string to the page's address, so one page can render variants |
| `--fail-on-warn` | exit code 1 if the page logged a warning (the file is still written) |
| `--motion-blur 8` / `--shutter 0.5` | [motion blur](#motion-blur) for this file: the number of samples, and how long the shutter is open |
| `--quiet` | no progress line |

Exit code 0 means the file was written; 1 means the page or the render failed (no file); 2 means bad usage. It needs Node 22 or later and Chrome installed (or `CHROME=/path/to/chrome`). Your page must set `window.movie` and `window.__ready = true`, which the [first video](getting-started.html) already does. This is what you run in CI or in a batch.

## Pictures

A deck (a movie with `stops`) can also be exported as a **PDF** (the player bar's download panel offers it too: PDF (pages) or PDF (every step)), one page per page of the talk: `npx pixi-effects-render my-talk.html -o my-talk.pdf` or `await movie.exportPDF()`. See [Presenting](presenting.html#a-deck-as-a-pdf).

`movie.init({ poster: 9.5 })` names the moment that stands for your video (seconds; a negative value counts back from the end). The canvas shows it before play, and `await movie.posterImage({ as: 'dataURL', type: 'image/jpeg', scale: 0.5 })` returns it as a picture: a thumbnail, a card, a share image, with no separate file to keep in step with the video.

`await movie.snapshot(frame, { as: 'dataURL' })` returns one frame as an image, and `movie.contactSheet({ count: 12, as: 'dataURL' })` returns many frames on one labelled sheet. They are for [looking at your video](review.html) as much as for thumbnails.
