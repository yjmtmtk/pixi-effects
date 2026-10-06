---
title: The player
section: Guides
order: 10
summary: Use the built-in player bar, change its colours, or build a player of your own.
---

## The built-in bar

```js
import { Controller } from 'pixi-effects/controller';
const controller = new Controller(movie, { canvas });
```

It adds play and pause, a seek bar, mute and volume, fullscreen and an export button over the canvas, and the keyboard shortcuts you expect (Space, arrows, F for fullscreen, M for mute). **Clicking or tapping the picture plays and pauses**, like a `<video>`. Options: `showExportButton` (default `true`), `enableKeyboardShortcuts` (default `true`), `clickToPlay` (default `true`; `false` leaves the canvas alone, for a page that has its own click handler).

Before play the canvas shows the movie's **poster frame** if you gave one with `poster` in `movie.init` (see [Exporting video](export.html#pictures)); the bar shows 0:00 and play starts from the beginning.

On browsers that cannot fullscreen an element (iPhone Safari), the fullscreen button is not shown.

## Change the colours

The bar is blue by default. Every colour and the track thickness are CSS custom properties, so you have two ways to change them:

```js
new Controller(movie, { canvas, theme: { accent: '#ff4d6d', foreground: '#ffe9a8', trackHeight: 5 } });
controller.setTheme({ accent: '#7bd88f' });          // later, live; null puts a value back to the default
```

```css
:root { --mc-accent: #ff4d6d; }                      /* or in your page CSS, on the canvas's parent or :root */
```

| `theme` key | CSS property | What it colours |
|---|---|---|
| `accent` | `--mc-accent` | the progress bar, its thumb, focus rings, the export button |
| `foreground` | `--mc-fg` | icons, the time, the volume slider |
| `track` | `--mc-track` | the unfilled part of the bars |
| `barBackground` | `--mc-bar-bg` | the background behind the buttons (any CSS background) |
| `trackHeight` | `--mc-track-height` | the thickness of the progress bar (a number is pixels) |
| `font` | `--mc-font` | the bar's font |

## While it loads

A piece with many layers can keep the page busy for a moment while it is built, and a first visit also downloads the libraries. Nothing in the page moves during that time unless you plan for it. Two rules:

- **Put a loader in the HTML, and animate it with CSS `transform` and `opacity` only.** The browser runs those animations on its compositor thread, so the loader keeps moving smoothly even while the main thread is busy building your piece. A loader driven by JavaScript, `requestAnimationFrame`, `setInterval`, an SVG stroke or the canvas itself freezes together with the page. It should be on screen before any script runs (plain HTML and CSS), and you remove it when `await movie.init(...)` is done: by then the poster is on the canvas.
- **Keep the build light.** Hundreds of particle layers are fine; thousands cost time. (The library adds each layer's animation to the timeline in one piece, so the cost grows with the number of layers, not with the square of the number of keyframes.)

`ai/template.html` and the gallery's [hanabi-night](../examples/gallery/hanabi-night.html) are examples (a spinning ring, and a tiny rocket that bursts).

## Build your own

The bar is optional: everything it does is public on the movie, and the events use the names an HTML5 `<video>` does. A complete player is about forty lines:

```js
const el = id => document.getElementById(id);
movie.on('ready', () => { el('seek').max = movie.totalFrames; });
movie.on('frame', ({ frame }) => { el('seek').value = frame; el('time').textContent = (frame / movie.frameRate).toFixed(1) + ' s'; });
movie.on('play',  () => { el('play').textContent = '❚❚'; });
movie.on('pause', () => { el('play').textContent = '▶'; });
movie.on('ended', () => { el('play').textContent = '↻'; });            // play() at the end starts again from 0
movie.on('volumechange', ({ volume, muted }) => { el('vol').value = muted ? 0 : volume; });
el('play').onclick = () => (movie.isPlaying ? movie.pause() : movie.play());
el('seek').oninput = e => movie.gotoFrame(+e.target.value);
```

{{demo examples/15-custom-player.html}}

| You have | Names |
|---|---|
| Methods | `play()`, `pause()`, `gotoFrame(frame)`, `toggleMute()`, `render()`, `snapshot()` |
| Properties | `volume`, `muted`, `currentFrame`, `totalFrames`, `frameRate`, `duration`, `isPlaying`, `isReady` |
| Events | `ready`, `frame`, `play`, `pause`, `ended`, `seeking`, `seeked`, `volumechange`, `error`, `progress` |

`seeking` and `seeked` fire for a jump you asked for (`gotoFrame`, a seek bar), not for each frame of playback, so a spinner does not flicker. The [API reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/api.md) has the payload of each event.
