---
name: pixi-effects
description: Use when asked to make, animate, preview or export a video, motion graphics, an animated title, a lower third, kinetic type, a promo, a slideshow with transitions, an animated chart or data story, a social clip, a 2.5D / depth scene, or music and sound for a video, written as code in JavaScript or HTML. pixi-effects is a JS library where a video is a plain-object composition (text, shape, image, video, audio and file-free sfx / music, camera, light and shader layers with keyframes) that plays in the browser, is checked by a tool the agent can run, and exports MP4 / WebM / MOV with no server. Not for a project that already uses another video tool (Remotion, Motion Canvas, ffmpeg); follow that tool instead.
---

> Written for pixi-effects 1.4.0. The newest docs are at https://yjmtmtk.github.io/pixi-effects/

# pixi-effects — a video as data

A video is a tree of plain objects (`layers` with `at`, `duration`, `initial`, `keyframes`); the library plays it in a canvas and exports it. Read `reference/quickstart.md` (2 KB) first. Everything else is on demand: `npx pixi-effects help <word>` prints the docs about a word, `npx pixi-effects recipe` lists tested pieces and `recipe <id>` prints one. `reference/cheatsheet.md` and `reference/pitfalls.md` are for searching, not reading.

## Commands

- `npx pixi-effects new my-video [--size 1920x1080 --duration 15]` — the page to edit (it loads the library from a CDN and collects warnings in `window.__logs`).
- `npx pixi-effects check my-video.html` — warnings, layout over the whole timeline, sound, a contact sheet (`check-out/<name>/sheet.png`: look at it) and a real export. `--no-export --at 3.5,title@end` while you iterate.
- `npx pixi-effects render my-video.html -o my-video.mp4` — the file (`--range 10:15` / `--draft` for parts and drafts).
- `npx pixi-effects view my-video.html` — the page with a scrubbable timeline, for a person to watch.
- `probe` / `frames --sheet` / `sound` / `trim` / `concat` / `audio` — look at and cut media files (`help media`). `<command> --help` lists the options; exit codes: 0 fine, 1 problems (listed), 2 the command line is wrong.
- If `npx` prints nothing (a cached or held-back release): `npm i pixi-effects` and `node node_modules/pixi-effects/ai/tools/check.mjs …`. Chrome elsewhere: `CHROME_PATH=…`.

## In a sandbox that is not the person's computer

A chat's code execution is a container (often root, a weak CPU, no CDN): Chrome stalls there and `check` only says "timed out" after minutes. Follow the chat way (https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md): no `npx`, no `npm`, no check / render / view; edit the template and give the person the page as it is (its CDN imports load in their browser). Do not start Chrome or render there: the person exports with the download button of the player bar, and warnings come back from the page's red box. If something stalls, stop after two tries and say what you did not check.

## Facts you cannot guess

- Keyframe `at` is seconds from the layer's own start (negative: from its end); a layer's `at` and a transition's `at` are composition seconds.
- After its time a layer is hidden, not removed; z-order is array order. Angles are degrees; `+z` is toward the viewer. Numbers can be expressions (`'GW/2 - w/2'`, no per-frame variables).
- Anchors: rect / circle / ellipse are centred on `x,y`; text and image are top-left (`anchorX/anchorY: 0.5`); compositions use `pivotX/pivotY`.
- Masks are in the parent's coordinates; `filterArea` in the layer's own. A named layer can be a shared `mask: 'band'` (it is not drawn).
- 2.5D: `threeD: true` on each layer plus a `{ type: 'camera' }` layer; keep `z` below the camera distance (≈ 989 at 720p).
- Parents: only `{ type: 'null' }` layers, with `parent: 'rig'` on the children (not for threeD layers).
- Determinism: everything is a function of time. No `Math.random` / `Date.now` (use `rand(seed)` / `noise()` in expressions, `random(seed)` in JS).
- `poster: <seconds>` in `movie.init` is the picture shown before play.
- Look at footage before you use it: a clip or a model you were handed goes through `npx pixi-effects probe` / `npx pixi-effects frames clip.mp4 --sheet` first (phone clips are often rotated, screen recordings often have no sound).
- Sound needs no files: `{ type: 'audio', sfx: 'swoosh' }` (presets `click pop swoosh swipe hit riser chime beep coin glitch typewriter`; tweak with `sfx: { preset, pitch, brightness, seed }`), `music: { bpm, tracks: [{ inst, notes: 'Cmaj7:4 Am7:4' }], drums }` (`help music`, the `music-*` recipes). A music file shorter than its layer goes silent unless `loop: true`.
- Built in (look each up with `help`): `animateText`, `splitText` / `measureText`, `spans`, counters `{value}`, `stagger`, `particles`, `followPath`, `wiggle`, `orbit`, `cameraPath`, path morphing, `fillGradient`, `shape: 'arc'`, transitions (incl. luma wipes), `blendMode`, lights / shadow / fog, depth of field, `speed` / `time` remapping, `react()` with `audioEnvelope` / `bpmEnvelope`, `components` + `params`, `vars`, markers (`at: 'title@end'`), `deck()` stops.
- Free boxes when nothing above draws it: `canvas` (2D context, `draw(ctx, t, info)`), `scene2d` (PixiJS objects set from `t`), `scene3d` (PixiJS 3D, `pixi-effects/3d`), `shader` (Shadertoy-style GLSL). Inside them the same rule: set everything from `t`. PixiJS's own skills: https://cdn.jsdelivr.net/npm/pixi.js@8.23.0/skills/pixijs/SKILL.md and https://cdn.jsdelivr.net/npm/@pixi/3d@0.1.0/skills/pixijs-3d/SKILL.md.
- In the page: `movie.inspect(frame)` (where each layer is, text as drawn, layout issues), `movie.inspectAudio()` (the sound as numbers), `movie.contactSheet()`, `movie.snapshot(frame)`, `movie.pick(x, y)`.
- Shell: zsh runs `echo ====` as a command; macOS `sed -i` needs `''`.

## Files

`template.html` (the starting page), `reference/quickstart.md`, `reference/recipes.md`, `reference/cheatsheet.md`, `reference/pitfalls.md`, `reference/direction.md` (how to direct a film, any renderer), `scripts/save-image.py`. Full docs: https://yjmtmtk.github.io/pixi-effects/docs/dsl.md and …/api.md.
