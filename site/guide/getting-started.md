---
title: Your first video
section: Start
order: 2
summary: A complete page you can save, open in a browser and export. About ten minutes.
---

You need a browser, a text editor and nothing else. No install, no build step.

## 1. Save this page

Save the following as `video.html` and open it in Chrome, Edge, Safari or Firefox. You will see a title rise into place, a line draw itself under it, and hear a short sound. Press play on the bar under the picture.

{{code examples/_guide/first-video.html html}}

{{demo examples/_guide/first-video.html}}

## 2. What each part does

- **`<canvas>`** is where the video is drawn. Its `width` and `height` attributes are the video's size (1280×720 here); your CSS can scale it on the page without changing the video.
- **The import map** tells the browser where to load `pixi-effects` and its companions from. `pixi.js` is not bundled into pixi-effects on purpose: your page and the library must share one copy.
- **`new Movie()`** is the video. **`new Controller(movie, { canvas })`** adds the player bar. Both are separate: you can use the movie without the bar, or build your own bar ([Your own player](player.html)).
- **`poster: 2.5`** names the moment that stands for the video: the canvas shows it before you press play (the frame at 0 s is empty here), and play still starts from 0. It is the same idea as `<video poster>`, derived from the data, with no image file. Leave it out and the first frame is shown.
- **`movie.init({ … composition })`** is where the video is described. `composition.sequences` is the list of **layers**, drawn in order (later ones on top).

Each layer is a plain object with a `type` (`text`, `shape`, `image`, `video`, `audio`, `composition`…), the things that belong to that type, and optionally `initial` values and `keyframes`:

```js
{ type: 'text', text: 'Hello', style: { fontSize: 120, fill: '#fff' },
  initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },          // where it starts
  keyframes: [{ at: 0.3, from: { alpha: 0 }, to: { alpha: 1 }, duration: 1 }] }   // how it changes
```

## 3. Change something

Edit the file, save, and reload. Try these:

1. Change `'Hello, motion'` to your own text.
2. Make the line yellow→pink: change `strokeColor: '#ffd166'` to `'#ff5c8a'`.
3. Add a second text layer under the title: copy the text object, change `text`, `y`, and give its keyframe `at: 0.8` so it arrives after the title.
4. Change the `sfx` to `'chime'` (or `'pop'`, `'click'`, `'riser'`…; see [Audio](audio.html)).

> **Tip:** if the page stays black, open the browser's developer console. pixi-effects prints a warning for almost every mistake, and the warning says what to change.

## 4. Get a video file

Press the download icon on the player bar, choose MP4 / WebM / MOV and a quality, and the browser renders the video and saves it. To render from a script, with no window, see [Exporting](export.html).

## 5. With npm and a bundler

```bash
npm install pixi-effects pixi.js
```

`pixi.js` is a **peer dependency**: it must be the same copy your app uses, so it is not bundled inside pixi-effects (npm 7 and later installs them for you). Optional extras: `three` for the three.js layer, `pixi-filters` for filters such as `glow` and `crt`.

```js
import { Movie } from 'pixi-effects';
import { Controller } from 'pixi-effects/controller';
```

## Next

[How it works](concepts.html) explains layers, time, keyframes and expressions, which is everything the other guides build on.
