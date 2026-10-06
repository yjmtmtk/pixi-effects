# Changelog

## Unreleased

**Performance**

- **A piece with many layers builds in a fraction of the time.** Every layer now builds its animation in a small timeline of its own, which is added to its parent once finished. Adding thousands of tweens one by one to a single GSAP timeline made GSAP re-measure the whole timeline at every add, so the cost grew with the square of the count: the 700-layer `hanabi-night` took 3.2 s to build with two 1.3–1.6 s freezes of the page, and now takes 0.5 s with none above 170 ms. Positions stay absolute, so every frame is the same.
- **A shared loader.** `pixi-effects/loader.css` (shipped as `dist/loader.css`) and one line of HTML, `<div class="pe-loader" data-label="LOADING"></div>` next to the canvas: a ring, `--pulse` (a breathing dot) or `--bar` (a sweeping line), or `--custom` for a drawing of your own, restyled with `--pe-loader-color` / `-bg` / `-track` / `-size`. It is HTML and CSS, so it is on screen before any script runs, and it animates only `transform` and `opacity`, which the browser runs off the main thread, so it keeps moving while the page builds the piece. `movie.init()` finds it, fades it out when the movie is ready and, if init fails, stops it and says so (`init({ loader })` names another element or turns it off). Every gallery piece has one (`hanabi-night` has a rocket of its own on the shared frame), `ai/template.html` has one, and the guide's player page says how to use it.

**Changed**

- The gallery pieces `orbit-rig` and `shape-shift` were redesigned as pieces first and feature showcases second: an orrery plate in ivory and brass ("Orrery") and a Bauhaus poster in motion ("Form Follows"). Same ids, so existing links keep working.

**Added**

- A gallery piece that uses particles and motion blur (`hanabi-night`: a fireworks festival title card, 36 pieces now), with its demo in the guide.
- **Motion blur.** `movie.init({ motionBlur: true })` (or a sample count, or `{ samples, shutter }`, or the same option on one `render()`, `snapshot()` or `contactSheet()`) exposes every frame over a shutter interval: the frame is drawn several times at moments around its time and averaged, so fast motion smears like on film. It applies to what is made (the export, snapshots, contact sheets, so `pixi-effects-check` shows what the file will have), not to live playback. `pixi-effects-render --motion-blur 8 --shutter 0.5` sets it for one file.
- **`particles()`**: bursts, fountains, snow, confetti and sparks as plain layers. Every particle has its own seeded start, launch angle and speed, size, colour and life, and a path baked into keyframes (gravity, wind, drag, sway), so playback, seeking and export agree. `emit` spreads births over time, `fade` / `scale` shape the life, `shape` is `circle` / `rect` / `star` or any `template` layer, `blendMode: 'add'` makes overlaps glow.

**Fixed**

- **The last frame of an export was empty.** The final frame sits at the exact end of the movie, where every layer's lifespan has just closed, so a layer that lasts to the end vanished in it (the exported video, and the last cell of a contact sheet, ended on a blank frame). That frame is now drawn a hair before the end, so the final composition stays on screen.

## 0.10.0

**Added**

- **Seeded randomness.** Expressions gain `rand(seed)` (0…1) and `noise(x, seed)` (smooth, −1…1), plus `lerp`, `clamp`, `smoothstep`, `mod`, `step` (the way to write an "if") and `PI`. For plain JS, `random(seed)` returns a repeatable stream. The same seed always gives the same picture, in playback, seeking and export.
- **Null layers and `parent`.** `{ type: 'null', name: 'rig' }` draws nothing and only moves; layers with `parent: 'rig'` are drawn inside it and follow its position, rotation, scale and alpha (orbits, clock hands, a whole group fading). Nulls chain; a child's `x` / `y` are measured from the null's origin. A wrong parent (unknown name, not a null, a cycle, a `threeD` layer) warns and the layer is drawn without one.
- **`stagger()`**: delays for a wave of items, GSAP style (`each` or `amount`, `from: 'start' | 'end' | 'center' | 'edges' | 'random' | index`, `grid: [cols, rows]`, `ease`, seeded `random`). `stagger(8, { each: 0.08 })` returns the delays; `stagger(layers, …)` returns the layers with `at` pushed back.
- A gallery piece for the path and text tools (`shape-shift`, 35 pieces now: morphing outlines, a comet on a loop, a title that arrives letter by letter), with the demo in the guide.
- A guide page on these four (`Motion: groups, waves and randomness`, with tested recipes) and a gallery piece that uses all of them (`orbit-rig`, 34 pieces now).
- **Click the picture to play / pause** in the `Controller` (a tap on a phone too), like a `<video>`; the pointer cursor shows it. A tap that only closes the export popover does not also toggle. `new Controller(movie, { canvas, clickToPlay: false })` turns it off.
- **`animateText()`**: per-character, per-word or per-line text animation in one call (`...animateText('Hello', style, { x, y, align, at, duration, in: 'rise', out: 'fade', stagger: { each: 0.05, from: 'center' }, idle: { y: 4 } })`). One text layer per piece laid out like the whole text, entering and leaving in a wave; presets `rise drop fade pop zoom slide spin` or your own `from` / `to`; an optional seeded idle drift; a clear error when `duration` is too short for the wave.
- **`followPath()`**: a layer travelling along an SVG path as keyframes (`keyframes: followPath({ d, duration, ease, orient: true, frameRate: 30 })`), by arc length so the speed is even, one sample per frame, with optional heading (`orient` / `rotate`) that never jumps by a turn, and `from` / `to` fractions.
- **Path morphing.** A `shape: 'path'` with `morphTo` (another SVG path) and an animatable `morph` (0 → 1) turns into the other outline: closed outlines are lined up so they do not twist, sub-paths are paired in order, fill, stroke and a trim follow, and the ends are drawn exactly as the paths.
- **`wiggle()`**: a seeded shake or drift as keyframes (`keyframes: [...wiggle({ duration: 6, props: { x: { around: 'GW/2', amp: 6 } } })]`); every property moves on its own and ends back at its resting value.

## 0.9.0

**Added**

- **Poster time.** `movie.init({ poster: 9.5 })` names the moment that stands for the movie (a negative value counts back from the end). Once the movie is ready the canvas shows that frame while the playhead stays at 0, and play still starts from 0, like `<video poster>` but derived from the same data, with no separate image file. `movie.poster`, `movie.posterFrame` and `movie.posterImage()` (a `snapshot()` at the poster time that leaves the movie as it was); `pixi-effects-check` writes `poster.jpg`. The gallery uses it: every piece declares `poster` once (the `?poster` handling copied into all 33 pieces and `posterFrame` in their meta are gone), `node scripts/make-posters.mjs` takes the posters and writes `posters/manifest.json` (with a hash of each page, so a poster that is out of date fails a test).
- A guide for people, as a standalone site on GitHub Pages (`/guide/`, next to the gallery and the live demos): your first video, how it works, guides for text, shapes, images and video, audio, filters, transitions, 2.5D, exporting, the player and reviewing, a cookbook of tested recipes with live demos, a page on working with an AI, and a FAQ. It puts the AI-development tools up front: `check`, the contact sheet, the timeline and viewer, `inspect`, `inspectAudio` and `render`. Pages are markdown in `site/guide/`, built to HTML by `scripts/build-guide.mjs` (`npm run guide` previews it in `guide-preview/`); the recipes in them are built and linted by the tests, and the first-video page is a real file checked in Chrome.

## 0.8.0

**Added**

- Movie events with the names an HTML5 `<video>` uses: `ended` (playback ran off the end, after `pause`), `seeking` / `seeked` (a `gotoFrame()` to another frame; not for playback ticks, `render()`, `snapshot()` or `contactSheet()`), `volumechange` (`{ volume, muted }`) and `error` (`{ where: 'init' | 'render' | 'playback', message, error }`; the call still rejects). A player of your own needs nothing else: `examples/15-custom-player.html` is a complete one, and `docs/api.md` has a section on it.
- `Controller` theme: the bar's colours and thickness are CSS custom properties (`--mc-accent`, `--mc-fg`, `--mc-track`, `--mc-bar-bg`, `--mc-track-height`, `--mc-font`) with the old values as defaults, set by `new Controller(movie, { canvas, theme: { accent: '#ff4d6d' } })`, by `controller.setTheme(…)` (`null` = default) or by your page CSS. `CONTROLLER_CSS` is exported.
- `{ type: 'colorGradient', gradientType: 'linear' | 'radial' | 'conic' }`: the filter's own `type` option clashes with the DSL's `type`. 40 of the named filters are now rendered and exported in a real browser (`examples/_checks/named-filters-2.html` is the second half); the table in `docs/dsl.md` lists each one's options, and which ones are driven by `time` or need a texture.
- CI (`.github/workflows/ci.yml`): typecheck, build and unit tests on every push and pull request (Node 22), and the real-browser tool tests in headless Chrome as a non-blocking job.

**Fixed**

- The player showed a fullscreen button on browsers without the Fullscreen API for elements (iPhone Safari, which can only fullscreen a `<video>`): a button that did nothing. It is not shown there now, and the F key does nothing.
- Exporting a movie WITH SOUND to mp4 / mov failed on browsers without an AAC encoder (Chrome on Linux, which is also what a Linux server or CI runs) with "This specific encoder configuration (mp4a.40.2 …) is not supported". The audio codec is now the first one the browser can encode (aac, then opus, mp3, flac for mp4; opus, vorbis for webm), with a warning that says so; a codec you name with `audio.codec` is never swapped, and its failure says which one would work. Found by the real-browser CI job; checked by making `AudioEncoder.isConfigSupported` refuse AAC: the file was h264 + opus.

## 0.7.0

**Fixed**

- The player (`Controller`) wrapped a canvas sized in percent (`canvas { width: min(960px, 100%) }`, the usual page CSS) in a wrapper as wide as the canvas's width ATTRIBUTE (1280): in a window wider than that the picture sat at the left edge with an empty strip beside it, and the bar was wider than the picture. The wrapper is now fitted to the canvas (measured as the page styled it, re-measured on resize and after fullscreen). Checked in a real browser at 1600, 700 and 1600 px.

**Added**

- `pixi-effects-view` (`node ai/tools/view.mjs page.html`): opens your browser on the page with its timeline under it and a playhead that follows the movie. Click or drag the timeline to seek, click a layer's name to jump to its start, Space plays / pauses, ← / → step a frame (Shift: a second), + / − or Ctrl/⌘ + wheel zoom (fit = the whole movie, no sideways scrolling; at most about 12 px per frame; the names stay in a fixed column; the view follows the playhead). The page is shown whole above the timeline, scaled down to leave room for it. `movie.timelineSvg({ chartWidth, labels })` is the chart alone, with its geometry in `data-*` attributes (the ticks get finer as it gets wider).
- The timeline as a picture: `movie.timelineChart()` returns one self-contained HTML page (an inline SVG): a bar per layer on a time axis, ◆ at each keyframe, a shaded band per transition, tooltips. `movie.timelineData()` is the same as data (absolute start / end / keyframe times). Layers of one type whose names differ only by numbers (four or more) are one row, so the 706-layer `countdown-newyear` is 28 rows. `pixi-effects-check` writes it as `timeline.html`.
- `pixi-effects-render` (`node ai/tools/render.mjs page.html -o out.mp4`): renders a composition page to a video file, headless, in one command. Its own private static server and Chrome; waits for `window.__ready`; the file is streamed to disk by an upload from the page (no base64 over DevTools, so long videos are fine); mp4 / webm / mov / mkv from the extension; `--quality`, `--query`, `--fail-on-warn`, `--quiet`; exit 0 = written, 1 = failed (no file), 2 = bad usage. Rendered a 12 s gallery piece with audio in 11 s (h264 + aac).
- Filters by name, as plain data: `filters: [{ type: 'glow', name: 'halo', outerStrength: 3 }]` instead of `{ type: 'custom', filter: new GlowFilter(…) }`. The type is the class name without `Filter` in camelCase: `blur noise alpha colorMatrix` (pixi.js; `colorMatrix` has presets `sepia grayscale negative polaroid technicolor vintage kodachrome browni`) and the 38 filters of `pixi-filters` (`glow dropShadow outline pixelate crt rgbSplit oldFilm glitch twist …`). `pixi-filters` is an optional peer dependency, loaded on first use (an import-map entry or `npm i pixi-filters`; `ai/template.html` has it). A misspelt type says what you probably meant. 24 of them were rendered and exported in a real browser (`examples/_checks/named-filters.html`); the gotchas that showed up (centres in canvas pixels, margins filled black, pixelate's `sizeX`) are in `docs/dsl.md` and the cheatsheet.

## 0.6.0

**Added**

- `examples/gallery/teatime.html` (33rd piece): transparent images. Four museum teapots cut out of their studio backgrounds are saved as lossless-alpha WebP (64–94 KB each; 650–700 KB as PNG) and stand in front of a giant word, on feathered RGBA PNG shadows (`examples/_assets/cutouts/`, licences in `examples/_assets/LICENSES.md`).
- `examples/gallery/still-water.html` (32nd piece): the first piece built on real photographs (three public-domain lake photos in `examples/_assets/photos/`, licences in `examples/_assets/LICENSES.md`): Ken Burns, a dip and a crossfade, a viewfinder drawn on with `trimEnd`, a caption re-typed with `set: { text }` and `visibleChars`.
- `examples/gallery/blueprint-house.html` (31st piece): a blueprint that draws itself with `trimEnd`, `visibleChars` and `set: { text }`.
- Draw-on strokes: `trimStart` / `trimEnd` (0–1 of the outline, animatable) on `line`, `polygon`, `path`, `rect`, `circle` and `ellipse`. `trimEnd: 0` plus a keyframe `to: { trimEnd: 1 }` draws it on; `trimStart` wipes it off; both give a travelling dash. The fill is not trimmed. A rect starts top-left and a circle at 12 o'clock, both clockwise; a polygon counts its closing edge; an SVG path's curves are followed. Not for `arc` (it warns: animate `endAngle`). `examples/14-draw-on.html`.
- Text that changes over time: a keyframe `set: { text: 'Two' }` swaps the string at that time (undone on seek back), and `visibleChars` (a number, the first N characters) is a typewriter. `to` / `from` with `text` warn: a string cannot be tweened. The `{value}` lint knows about swapped strings.
- `movie.on('play', fn)`: emitted when `play()` starts a paused movie.

**Fixed**

- The player bar showed the ▶ icon while a host page's `movie.play()` was running (it only updated for its own button): it follows the movie's `'play'` / `'pause'` events now.
- `movie.play()` before the browser allows sound (an AudioContext stays `suspended` until a user gesture): the picture ran on silently and the audio was scheduled at a stale position. It now starts the sound when the context runs (it asks to resume again on the first click / key press), from the position the movie has reached by then.
- Gallery: a deep link or a reload opened the piece at its poster frame (e.g. 0:09). Every piece now opens at 0:00; a card click plays at once, a deep link keeps the poster with a play button (a browser would block the sound without a click).

## 0.5.0

**Added**

- Sound effects without files: an `audio` layer with `sfx: 'swoosh'` (or `{ preset, pitch, brightness, seed }`, or a custom `{ voices: [...] }`) plays a synthesised sound — click, pop, swoosh, swipe, hit, riser, chime, beep, coin, glitch, typewriter. The layer's `duration` is the sound's length. Deterministic; the synthesiser is a separate chunk loaded only when used.
- `ai/tools/check.mjs` (`npx pixi-effects-check page.html`): a one-command review for an AI author — its own private headless Chrome and static server, then warnings, `movie.inspect` over the whole timeline (grouped), `movie.inspectAudio()`, a contact sheet PNG, and a real export decoded again (video / audio length, loudness per second, silence); `report.json`; exit 0 / 1. No dependencies (Node ≥ 22 and an installed Chrome). Cut-off / off-canvas text fails the check; text overlaps are listed for review (7 of the 30 gallery pieces overlap on purpose), `--strict` fails on them.
- `measureText(text, style)` and `splitText(text, style, { by: 'chars' | 'words' | 'lines', x, y, align })`: text layout with the renderer's own font metrics, for per-letter / per-word animation (and sizing pills) without hand-measuring.
- `shape: 'arc'` — progress rings, pie and donut slices (`radius`, `innerRadius`, `startAngle`, `endAngle` in degrees, all animatable) — and `strokeCap` / `strokeJoin` on every shape.
- An `audio` layer's starting volume may be written `initial: { volume }` (it was silently ignored there and played at 1) as well as `volume`.
- Text counters: `format: { pad: 2 }` zero-pads the whole part (`18:42:05`); a `{value}` placeholder that nothing sets or animates warns that it prints 0.
- `movie.inspectAudio()`: each sound's length, level, loudest moment and brightness (Hz), when it plays, the mix over time, and issues (limited mix, inaudible or cut-off sounds).
- The audio mix is soft-limited above 0.9 (a quieter mix is unchanged) and warns, naming the layers, when it would have clipped.

**Fixed**

- MP4 / MOV exports: the audio started ~45 ms after the picture (AAC encoder priming). It is now trimmed with an edit list.
- `colorSpace: 'oklch'` from or to a nearly grey colour (`#9a9ab4`) swept through pink: a low-chroma endpoint now borrows the other end's hue.
- `blendMode` on a layer with `filters` (a blurred `multiply` glow rendered black) goes through the last filter.
- An `image` / `video` used as a `mask` was drawn as a normal picture over the layer, and `maskInverted` looked ignored; sprite masks now stay hidden.
- A tilted `threeD` layer hidden because one corner passes the camera plane gets a warning that says so (it blamed `z`).
- `movie.inspect`: text in a panning composition is not "cut off", text scaled to 0 is not "no size".
- The seek / volume drag of the player ends when the pointerup never arrives (button released outside an iframe).
- sfx: a negative `at` or an end-relative keyframe past the start of a short sound crashed `movie.init()` (Web Audio rejects negative times): such a sound now starts at 0 with its first part cut off, with a warning; a non-number `duration` falls back to the preset length; silent custom voices (`from >= to`, `gain: 0`) and a non-numeric `seed` warn.
- `ai/template.html`: the player bar was wider than the canvas.

**Breaking (types)**

- `AudioSequenceSpec` is now `AudioAssetSpec | AudioSfxSpec`; `AudioDescriptor.buffer` is optional (a descriptor carries `buffer` or `synth`).

## 0.4.0

**Changed**

- A mask with no `at` of its own now starts and ends with the layer it masks, so its keyframes are measured from that layer's start (as `docs/dsl.md` always said: "shares its lifetime"). An explicit mask `at` is still composition time. **Migration:** a mask reveal that used `at: 0` on a layer that appears later now plays when the layer appears (before, it had finished long before). Give the mask an explicit `at` to keep the old timing.
- An `audio` layer with `loop: true` and no `duration` lasts until the composition ends (it used to stop after one clip length). Without `loop` and without `duration` it lasts as long as its clip, so a one-shot sound effect needs no `duration`.

**Fixed**

- **Volume keyframes** behaved unlike every other keyframe: a `to` ramped from the end of the previous keyframe, so the documented fade-out `{ at: -2, to: { volume: 0 }, duration: 2 }` faded the music across the whole piece, and `set` ramped towards its time instead of jumping. Each change now holds the current value until its own start, and keyframes apply in time order.
- A `set` keyframe (text `{value}` counter and fill, image tint, shape style) stayed applied after seeking back before it.
- **A shape could be missing after a jump seek** (contact sheet, snapshot, scrubbing): geometry was drawn only while rendering, after the culler had measured the previous frame's bounds, so a rect growing from `width: 0` at the left edge was culled. Shapes now redraw before the cull.
- `threeD` layers whose size changes (a growing shape, text) no longer make Pixi warn "destroyed while still bound": the render texture is resized in place.
- Text `style` words (`stroke: { join: 'round' }`, named colours, `textBaseline`, `whiteSpace`) were parsed as expressions and warned.
- `movie.inspect` judges overlaps on what is visible (cut to the canvas and the layer's mask), so a ticker parked off the canvas is not reported, and does not report the two scenes of a running transition.
- The same "keyframe starts after the layer ends" warning, printed once per layer by a loop, is summarised after three.
- `docs/dsl.md` contradicted itself on whether text content can change (it can, through `{value}`).

**Added**

- `blendMode: 'normal' | 'add' | 'screen' | 'multiply'` on every layer (a composition's children inherit it): glows and light leaks that add up.
- The four sample sound-effect mp3s (`examples/_assets/sfx-*.mp3`) are gone: the examples and all 23 gallery pieces that used them now use `sfx` presets (volumes matched to the old files within about 2 dB). `examples/_assets/bgm.mp3` is now a 16 s seamless loop of "One Cool Minute" (Loyalty Freak Music, CC0 1.0; see `examples/_assets/LICENSES.md`) instead of the 6 s drone; the gallery pieces' music volumes are retuned (peak 0.3, about −32 LUFS under the sound effects).
- `examples/gallery`: 30 portfolio pieces written as plain data by three AI models, with a showcase page, and the stumble notes that fed these fixes. `ai/reference/pitfalls.md` items 32–48.

## 0.3.0

**Breaking**

- Keyframe `at` is now measured from the start of the layer it belongs to (After Effects style); negative `at` counts back from that layer's end. Before, it was measured from the parent composition, so a keyframe with `at: 0` on a layer that starts at `at: 2` ran two seconds before the layer appeared, silently. Layers' own `at` and transitions' `at` are unchanged (composition time). `kenBurns`, `withFade` and transitions emit layer-local times. **Migration:** on a layer with `at: N`, subtract `N` from its keyframes' `at`.

**Fixed**

- **A layer could be missing right after a seek, or from an exported video.** PixiJS only culls inside `app.render()` (the ticker), and `Movie` draws by hand (and `render()` stops the ticker), so `culled` flags were stale: a layer that had just come on screen could be skipped. The movie now culls immediately before every draw.
- `line`, `polygon` and `path` without `x` / `y` were drawn around (0,0): their points are now plain canvas coordinates.
- Videos inside nested compositions started at the wrong time.
- Text `w` / `h` in expressions were measured before the style was applied.
- Shape geometry written in `initial` (`width`, `anchorX`, …) was silently ignored.
- 2.5D: hidden layers could keep a stale texture (`autoAlpha`), filter output was clipped at the layer edge, and render textures could use excessive memory.

**Added**

- Unknown option names now warn with a suggestion (`contactSheet({ cols })` → `columns`, `init({ fps })` → `frameRate`) instead of being ignored. `inspect(frame, { layers })` can list only the visible layers or none; it ignores faint layers and moving text.
- Warnings for the silent failures AI authors hit: keyframe or layer starting after its layer / composition ends, audio shorter than its layer without `loop`, a `threeD` layer hidden behind the camera, transitions on `threeD` layers, `lookAt` equal to the camera position, and more.
- Keyframes: `repeat` / `yoyo` / `repeatDelay` on every kind of animation (finite repeats only).
- Text counters: `text: '{value} users'` + animate `value`; `format: { decimals, grouping }`.
- Shapes: `fillGradient` — linear and radial gradients with alpha stops (vignettes).
- `orbit()` preset: a camera that circles a point (`dollyZoom: { from, to }` animates `fov` while the radius follows it).
- `movie.snapshot()`, `movie.contactSheet()`, `movie.inspect()`: look at the result — one frame, many labelled frames on one image, or per-layer bounds plus layout issues (text off the canvas, cut off, overlapping).
- `ai/` (skill, cheatsheet, tested recipes, pitfalls, starter template), `llms.txt`, `llms-full.txt`.

## 0.2.0

- 2.5D layers and camera (`threeD`, `z`, `rotationX/Y`, `{ type: 'camera' }`), the optional `pixi-effects/three` entry, `withFade`, shared-chunk builds.
