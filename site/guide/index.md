---
title: pixi-effects
section: Start
order: 1
summary: Describe a video as plain data. pixi-effects plays it in the browser and renders it to MP4, WebM or MOV.
---

pixi-effects turns **data into video**. You write a tree of plain objects (text, shapes, images, audio, filters, camera moves) and it plays that tree in the browser, scrubs it, and renders it to a video file. There is no timeline editor and no imperative animation code: the whole video is one object you can read, version, template and generate.

{{demo examples/gallery/blueprint-house.html}}

*The piece above is about 150 lines of data. It draws itself, types its labels and ends with a sound.*

## Built for AI to write, and for you to review

Most of the video is meant to be written by an AI, so the tools around it are part of the product. An AI cannot watch a video, and you should not have to play every one to know whether it is right. pixi-effects gives both of you the same instruments:

| Tool | What it gives | Try |
|---|---|---|
| **Check** | one command that opens the page in a private headless Chrome and reports warnings, layout problems, sound problems and a real export decoded again. Exit code 0 / 1 | `npx -p pixi-effects pixi-effects-check video.html` |
| **Contact sheet** | twelve labelled frames on one picture: the whole animation at a glance | written by *check*, or `movie.contactSheet()` |
| **Timeline** | every layer as a bar on a time axis, keyframes, transitions; scrub it against the video, zoom | `npx -p pixi-effects pixi-effects-view video.html` |
| **Inspect** | where every layer is at any frame, and text that is cut off, off-canvas, empty or overlapping | `movie.inspect(frame)` |
| **Sound check** | when each sound plays, how loud, and clipping or inaudible layers; sound you cannot hear, measured | `movie.inspectAudio()` |
| **Render** | the video file from a script or CI, headless | `npx -p pixi-effects pixi-effects-render video.html -o out.mp4` |
| **Skill and cheatsheet** | a short, exact description of the format for an AI to read first, `llms.txt`, a starter page | [Working with an AI](with-ai.html) |
| **Warnings that teach** | every mistake prints a message that says what to change, with "did you mean" | the browser console |

![A contact sheet: twelve labelled frames of a twelve-second piece on one image](assets/contact-sheet.jpg)

*A contact sheet written by `check`. One look shows the pacing, the titles, the transitions and where something is missing.*

![The timeline viewer: the page on top, every layer as a bar under it, a playhead that follows the movie](assets/timeline-view.jpg)

*`pixi-effects-view`: the page on top, its timeline under it. Click or drag to seek; the red playhead follows the movie.*

[How to use these tools](review.html) · [Working with an AI](with-ai.html)

## Why you might want it

- **A video is a function of data.** Loop over rows to make a hundred cards; change one number to re-time a scene. The result is the same every time you render it.
- **It runs where your page runs.** Playback, scrubbing and export all happen in the browser (PixiJS for drawing, WebCodecs for encoding). Rendering on a server is one command with a headless Chrome.
- **It is made to be written by an AI, and reviewed.** The format is small and regular, and the check, timeline and contact-sheet tools above let an AI (or you) see the result without playing it.
- **After Effects habits carry over:** layers, keyframes, expressions, masks, blend modes, 2.5D with a camera.

## Where to start

| If you want to… | Read |
|---|---|
| make a video in the next ten minutes | [Your first video](getting-started.html) |
| understand how the pieces fit | [How it works](concepts.html) |
| see a thing done, with a live demo | [Cookbook](cookbook.html) |
| have an AI write the video | [Working with an AI](with-ai.html) |
| give a talk with slides that move | [Presenting](presenting.html) |
| make the picture follow the music | [Audio](audio.html#visuals-that-follow-the-music) |
| look something up | the [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md) and the [API reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/api.md) |

## What it is not

It is not a timeline editor, and it does not edit existing video files by hand (a `video` layer plays a clip inside a composition, with masks and filters on top). It is also **pre-1.0**: the API can still change between minor versions, and the [changelog](https://github.com/yjmtmtk/pixi-effects/blob/main/CHANGELOG.md) says what changed.
