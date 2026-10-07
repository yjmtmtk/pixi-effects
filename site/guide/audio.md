---
title: Audio
section: Guides
order: 4
summary: Music files, music written as text, sound effects with no files at all, and how to check a sound you cannot hear.
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

## Music written as text

No music file? Write the tune. An audio layer with `music` takes tracks of notes and chords as plain strings, drum patterns, and a tempo, and a small built-in synthesiser plays them. The same text gives the same sound every time, in the preview and in the exported file.

```js
// @recipe music-guide
return [
  { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#10131c' } },
  { type: 'text', text: 'a tune from text', style: { fontSize: 72, fill: '#ffffff' }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 } },
  { type: 'audio', volume: 0.8, music: {
      bpm: 92, swing: 0.12,
      tracks: [
        { inst: 'keys', strum: 0.012, notes: 'Cmaj7:4 Am7:4 Dm7:4 G7:4' },           // chords by name, 4 beats each
        { inst: 'bass', notes: 'c2:2 g2:2 | a1:2 e2:2 | d2:2 a2:2 | g1:2 d2:2' },     // notes: name, octave, length in beats
        { inst: 'bell', vol: 0.5, notes: '_:4 | e6:1 g6:1 e6:2 | d6:4 | b5:2 d6:2' },  // _ is a rest
      ],
      drums: [{ from: 4, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }],
  } },
];
```

- **A note** is its name, octave and length in beats: `c4`, `f#3:0.5`, `Bb2:2` (c4 is middle C; a bar of 4/4 is 4 beats). **A chord** is a name: `Am7`, `Dsus4`, `Gmaj7`, `C@4` (root in octave 4), `Am7/e` (e in the bass), or written out: `[c4 e4 g4]:2`. `_` is a rest, `~` holds the note before, `|` marks a bar and is ignored.
- **Instruments:** `keys` (electric piano), `pluck` (guitar or harp), `pad` (slow synth pad), `bass`, `sub` (pure sine bass), `lead`, `bell`, `musicbox`. **Drums:** `kick snare hat openhat clap rim tom crash shaker sleigh`, each a string of steps (`x` hit, `o` soft hit, `.` nothing) that repeats. Put `from: 8` on a drum object to bring the groove in later, or give a list of them for sections.
- **Shape the music:** `swing` (a lilt on the off-beats), `reverb`, per-track `vol` (a list like `[[0, 0], [8, 0.7]]` fades it in over 8 beats), `pan`, `tone` (darker when lower), `transpose`, and a tempo that slows: `bpm: [[0, 96], [28, 96], [32, 60]]`.
- **Length and loop:** the layer lasts the music plus its reverb tail, and ends with the movie; `loop: true` repeats it until the layer ends. At `volume: 1` it peaks at −6 dBFS, so use 0.5 to 0.8 under speech or effects.
- **It is an AI's friend:** a score is text, so an AI can write a Christmas waltz, a lo-fi loop or a thriller opening and check it with `movie.inspectAudio()`. Mistakes (an instrument or drum name that does not exist, a note it cannot read) print a warning that names the track and the token. The complete reference is the [DSL reference](https://github.com/yjmtmtk/pixi-effects/blob/main/docs/dsl.md#music-written-as-text-music).

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
- No audio file? `bpmEnvelope(120, { duration })` is a kick, a snare and hats exactly on a tempo. If the music is itself written as text, `await musicEnvelope(music, { frameRate })` analyses that very score (exact beats, bass / mid / treble that follow the notes): pass it to `react()` just like `audioEnvelope()`.

{{demo examples/gallery/music-visualizer.html}}

## Mixing

Every audio layer is mixed down into one soundtrack. The mix is soft-limited above 0.9 (a quieter mix is untouched) and a warning names the layers if it would have clipped, so a pile of loud layers cannot ruin the file. Typical levels: music at 0.25 to 0.4 under effects.

{{demo examples/09-audio.html}}

## Check what you cannot hear

`movie.inspectAudio()` reports, for every sound, when it plays, how loud it is and what it sounds like (its pitch centre), plus the loudness of the mix second by second and a list of problems: a sound cut off by the end of the movie, a layer so quiet it is inaudible, a limited mix. The [review tools](review.html) run it for you.

## In the exported file

MP4 and MOV carry AAC audio, WebM carries Opus. A browser that cannot encode AAC (Chrome on Linux) gets Opus in the MP4 instead, with a warning. The sound lands where it plays in the browser, to within a few milliseconds.
