---
title: Audio
section: Guides
order: 4
summary: Music files, sound effects with no files at all, and how to check a sound you cannot hear.
---

## Music and recorded sound

An `audio` layer with an `asset` plays a file. Fade it with volume keyframes:

```js
{ type: 'audio', asset: 'music', loop: true, volume: 0, duration: 12,
  keyframes: [{ at: 0, to: { volume: 0.4 }, duration: 1.5 }, { at: -2, to: { volume: 0 }, duration: 2 }] }
```

- A one-shot clip lasts exactly as long as the clip. A music file **shorter than the movie needs `loop: true`**, or it falls silent after its end.
- `volume` is 0 to 1 and animatable (that is how you duck music under a voice).

## Sound effects with no files

`sfx` makes a sound from data. There is nothing to download, license or host:

```js
{ type: 'audio', sfx: 'swoosh', at: 2 }
{ type: 'audio', sfx: { preset: 'pop', pitch: 5, seed: 2 }, at: 3, volume: 0.6 }
```

The presets: `click`, `pop`, `swoosh`, `swipe`, `hit`, `riser`, `chime`, `beep`, `coin`, `glitch`, `typewriter`. `pitch` shifts by semitones, `brightness` darkens or brightens, `seed` gives another take. The layer lasts exactly as long as the sound.

- **Line up the loud part, not the start.** A `riser` is loudest at its end (`at = hit − duration`), a `swoosh` 0.16 s in.
- One layer per hit; use a loop for many (a `typewriter` tick for each letter).
- For a sound of your own, `sfx: { voices: [{ wave: 'square', freq: [1600, 200], filter: { type: 'lowpass', freq: 3000 }, envelope: 'fall' }] }`.

{{demo examples/13-sfx.html}}

## Mixing

Every audio layer is mixed down into one soundtrack. The mix is soft-limited above 0.9 (a quieter mix is untouched) and a warning names the layers if it would have clipped, so a pile of loud layers cannot ruin the file. Typical levels: music at 0.25 to 0.4 under effects.

{{demo examples/09-audio.html}}

## Check what you cannot hear

`movie.inspectAudio()` reports, for every sound, when it plays, how loud it is and what it sounds like (its pitch centre), plus the loudness of the mix second by second and a list of problems: a sound cut off by the end of the movie, a layer so quiet it is inaudible, a limited mix. The [review tools](review.html) run it for you.

## In the exported file

MP4 and MOV carry AAC audio, WebM carries Opus. A browser that cannot encode AAC (Chrome on Linux) gets Opus in the MP4 instead, with a warning. The sound lands where it plays in the browser, to within a few milliseconds.
