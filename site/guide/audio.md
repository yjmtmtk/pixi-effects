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

## Visuals that follow the music

Make things move with the sound, and the video is the same every time you play or export it. Analyse the music **before** `movie.init`, then `react()` turns what it does into keyframes.

```js
// @recipe audio-react-guide
const env = bpmEnvelope(120, { duration: 8, frameRate: 30 });      // with a real file: const env = await audioEnvelope('music.mp3', { frameRate: 30 })
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#07060f' } },
  { type: 'shape', shape: 'circle', radius: 110, duration: 8, initial: { x: 'GW/2', y: 'GH/2', fillColor: '#ff2d95' },
    keyframes: react(env, { duration: 8, props: {
      scale: { base: 1, amount: 0.45, band: 'bass', attack: 0.02, release: 0.2 },        // swells with the low end, falls back slowly
      alpha: { base: 0.5, amount: 0.5, beats: true, decay: 0.15 },                      // flashes on every beat
    } }) },
];
```

- `audioEnvelope(url)` gives, per video frame, the loudness (`level`) and the energy in `bass`, `mid` and `treble` (or bands you name, in Hz) as numbers from 0 to 1 on a perceptual scale, the times of the beats (`env.beats`) and the tempo (`env.bpm`). A quiet file gives the same shape as a loud one.
- `react(env, { duration, props })` returns keyframes: each property is `base + amount × level`. Use `band` to pick the low, middle or high end, `beats: true` for a pulse that jumps on each beat and fades (`decay`), `attack` / `release` (seconds) to smooth the rise and fall like a level meter, and `audioOffset` / `loop` to line it up with a music layer that starts late or repeats.
- Many bands make an equaliser: `bands: { b0: [50, 80], b1: [80, 130], … }`, one bar per band with `height: { base: 6, amount: 220, band: 'b7' }`. The gallery's [Night Drive](../examples/gallery/music-visualizer.html) is exactly that: a 24-band analysis of the sample loop, mirrored into 48 bars.
- No audio file? `bpmEnvelope(120, { duration })` is a kick, a snare and hats exactly on a tempo.

{{demo examples/gallery/music-visualizer.html}}

## Mixing

Every audio layer is mixed down into one soundtrack. The mix is soft-limited above 0.9 (a quieter mix is untouched) and a warning names the layers if it would have clipped, so a pile of loud layers cannot ruin the file. Typical levels: music at 0.25 to 0.4 under effects.

{{demo examples/09-audio.html}}

## Check what you cannot hear

`movie.inspectAudio()` reports, for every sound, when it plays, how loud it is and what it sounds like (its pitch centre), plus the loudness of the mix second by second and a list of problems: a sound cut off by the end of the movie, a layer so quiet it is inaudible, a limited mix. The [review tools](review.html) run it for you.

## In the exported file

MP4 and MOV carry AAC audio, WebM carries Opus. A browser that cannot encode AAC (Chrome on Linux) gets Opus in the MP4 instead, with a warning. The sound lands where it plays in the browser, to within a few milliseconds.
