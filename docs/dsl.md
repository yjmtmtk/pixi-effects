# DSL Reference

This document describes the declarative composition spec that you pass to `Movie.init({ composition })`. Every shape is exported as a TypeScript type from `pixi-effects` for editor autocomplete.

- [Composition](#composition)
- [Sequences](#sequences)
- [3D layers & camera](#3d-layers--camera)
- [Assets](#assets)
- [Keyframes](#keyframes)
- [Expressions](#expressions)
- [Filters](#filters)

---

## Composition

A composition is a tree node that has a width, a height, a duration, and a list of child sequences. The root composition is what you pass to `Movie.init({ composition })`. Nested compositions appear inside a parent as a `{ type: 'composition' }` sequence.

```ts
interface CompositionSpec {
  width?: number;        // pixels; defaults to Movie width
  height?: number;       // pixels; defaults to Movie height
  duration?: number;     // seconds; defaults to Movie duration
  sequences?: SequenceSpec[];
  // (also: name, at, initial, keyframes, filters — same as SequenceCommon below)
}
```

Children of a nested composition use that composition's local coordinate system. `W`/`H` in the [scope](#expressions) refer to the **immediate parent**; `GW`/`GH` always refer to the root.

---

## Sequences

Every sequence shares this base shape:

```ts
interface SequenceCommon {
  name?: string;            // optional id, used for cross-references and debugging
  at?: number;              // start time in seconds, measured from the start of the PARENT composition (default 0)
  duration?: number;        // seconds; defaults to the parent's duration
  initial?: Props;          // properties applied before any keyframes evaluate
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
}
```

### Timing at a glance

| What | Measured from |
|---|---|
| a sequence's `at` | the start of its **parent composition** (the root composition starts at 0) |
| a **keyframe's** `at` | the start of **its own sequence** (After Effects style): `at: 0` = the moment the layer appears. **Negative = back from the sequence's end** (`-0.5` = 0.5 s before it ends) |
| a transition's `at` | the start of the **parent composition** (like a sequence's `at`) |
| `audio` volume keyframes | the start of their own sequence (same rule as every other keyframe) |

### Anchors and origins

| Layer | Where `x, y` land by default | To change it |
|---|---|---|
| `shape` rect / circle / ellipse | the **centre** of the shape | `anchorX` / `anchorY` (0–1). A bar growing from its base: `anchorY: 1`; left to right: `anchorX: 0` |
| `shape` line / polygon / path | the centre of the shape's bounds | `pivotX` / `pivotY` (in the shape's own canvas coordinates): the point that sits at `x, y` and that rotation / scale turn about. **`anchorX` / `anchorY` do nothing on these.** |
| `text`, `image`, `video` | the **top-left** corner | `anchorX` / `anchorY: 0.5` to centre |
| `composition` | its top-left corner | `pivotX` / `pivotY` = the point that sits at `x, y` and that rotation / scale turn about |

Shape geometry (`width height radius anchorX …`) may be written at the top level or in `initial`; the top level wins. `rotation`, `skew*` and `rotationX/Y` are in **degrees**.

A layer is **not removed** when its lifespan `[at, at + duration)` ends: it is only hidden, and it keeps its last animated values. Outside the lifespan it is invisible. **z-order is array order** (later = on top). Build scenes by giving layers `at` / `duration` and stacking them; a full-screen background rect in each scene hides what is below it.

`Props` is `Record<string, number | string>`. String values are evaluated as [expressions](#expressions) unless the prop is a textual one (e.g. `fill`, `fontFamily`).

### `text`

Renders a [PIXI.Text](https://pixijs.com/8.x/guides/components/scene-objects/text/text). Animatable position, rotation, scale, opacity and `fill`. `style` accepts any PixiJS `TextStyle` field and is applied once at build time — notably `fontSize fontFamily fontWeight fill letterSpacing lineHeight align wordWrap wordWrapWidth stroke dropShadow padding` (numbers may be expressions). A `dropShadow` glow is clipped unless `padding` is at least twice its `blur`. Text content can change over time (see *Changing text* below): a `{value}` placeholder prints an animatable number (counters), a keyframe `set: { text: '…' }` swaps the string, and `visibleChars` types it out. Multi-line text is centre-aligned unless `style.align` says otherwise. In expressions `w` / `h` are the size of the styled text, so `x: '-w'` places it just off the left edge.

```ts
{
  type: 'text',
  text: 'hello',
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  keyframes: [
    { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
  ],
  style: {
    fontSize: 'GW * 0.05',     // expression OK
    fill: '#ffffff',           // verbatim string
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
}
```

The text's `fill` is also animatable via keyframes (under the `to`/`from`/`set` keys, not under `style`). Set `colorSpace` for perceptual interpolation:

```ts
{
  type: 'text', text: 'COLORSPACE',
  colorSpace: 'oklch',
  style: { fill: '#ff0000', fontSize: 48, fontWeight: 'bold' },
  keyframes: [
    { at: 1, to: { fill: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

#### Changing text: `set: { text }` and `visibleChars`

A keyframe `set: { text: 'Two' }` swaps the string at that time (layer-local `at`, undone when you seek back; a string cannot be tweened, so `to` / `from` with `text` warn). A countdown is one layer:

```ts
{ type: 'text', text: '3', duration: 4, style: { fontSize: 150 }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  keyframes: [{ at: 1, set: { text: '2' } }, { at: 2, set: { text: '1' } }, { at: 3, set: { text: 'Go!' } }] }
```

`visibleChars` is a number that shows only the first N characters (counted as you see them: an emoji is one): a typewriter. `initial: { visibleChars: 0 }` and a keyframe `to: { visibleChars: 30 }, duration: 2.4, ease: 'none'` types 30 characters over 2.4 s (it starts at 0 as soon as it is animated). Use a left-aligned layer (`anchorX: 0`, `style.align: 'left'`) so the text grows to the right instead of re-centring each letter; the layer's `w` / `h` are those of the whole text. `set: { text }` and `visibleChars` combine (swap the string, `set: { visibleChars: 0 }`, type it again), and so does a `{value}` placeholder in the string.

#### Counters (`{value}`)

A text layer has one animatable number, `value`, printed wherever the text contains `{value}`. Animate it with the normal keyframes (any ease, `from`/`to`/`set`, `repeat`):

```ts
{
  type: 'text', text: '{value} users', format: { decimals: 0, grouping: true },   // → "2,480 users"
  initial: { value: 0 },
  keyframes: [{ at: 1, to: { value: 2480 }, duration: 1.2, ease: 'power3.out' }],
  style: { fontSize: 72, fill: '#fff' }, ...
}
```

`format`: `decimals` (default 0), thousands `grouping` (default false) and `pad` (zero-pad the whole part to that many digits: `pad: 2` gives `05`, so a clock is `text: '18:42:{value}'` with `format: { pad: 2 }`). Put prefixes and suffixes in the text (`'${value}'`, `'{value}%'`). If `value` is animated but the text has no `{value}`, a warning says so.

### `image`

Renders a [PIXI.Sprite](https://pixijs.com/8.x/guides/components/scene-objects/sprite/sprite) from a registered asset. Intrinsic `w`/`h` come from the loaded texture.

```ts
{
  type: 'image',
  asset: 'logo',
  initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' },
}
```

`tint` is animatable via keyframes. Optionally set `colorSpace` to interpolate the tint perceptually:

```ts
{
  type: 'image', asset: 'logo',
  colorSpace: 'oklch',                 // smooth hue sweep instead of muddy sRGB
  initial: { tint: '#ff0000' },
  keyframes: [
    { at: 1, to: { tint: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

### `video`

Renders a video. Intrinsic `w`/`h` come from the video's natural size. `currentTime` is driven by the timeline (so seeking the Movie scrubs the video).

```ts
{
  type: 'video',
  asset: 'green',
  loop?: false,           // loop back to start when finished (default false)
  audio?: true,           // route audio track into the mix (default true)
  volume?: 1,             // initial volume 0..1 (animatable via volume keyframes)
  speed?: 1,              // playback speed: 2 = twice as fast, 0.5 = slow motion, negative = backward (see [Time](#time-speed-and-time))
  initial: { x: 0, y: 0, scale: 'cover' },
}
```

Use `scale: 'cover'` or `scale: 'contain'` (these resolve via the [scope](#expressions)) to fit the video to the parent composition.

### `null` and `parent`

A `null` layer draws nothing; it only moves. Any layer can name it as its `parent`, and is then drawn **inside** it: the null's position, rotation, scale, skew and alpha carry the layer along. Use it to move, turn, scale or fade a group at once, to turn something about a point (a planet and its moon, a clock hand, a hinged arm), or to build a rig.

```js
{ type: 'null', name: 'planet', initial: { x: 640, y: 360 },
  keyframes: [{ at: 0, to: { rotation: 360 }, duration: 8, ease: 'none' }] },
{ type: 'shape', shape: 'circle', radius: 20, parent: 'planet', initial: { x: 200, y: 0, fillColor: '#ffffff' } },   // circles the point (640, 360)
```

- A child's `x` / `y` are measured **from the null's origin** (not from the composition's corner): with the null at (640, 360), a child at `x: 200` is drawn at 840. Rotation turns the child about the null's origin; give the null `pivotX` / `pivotY` to turn about another point.
- Nulls **chain**: a null may have a null as its `parent` (shoulder → elbow → hand). A cycle is reported and broken.
- The children are **drawn where the null stands in the list** (stack order), together, not where each is listed: to put another layer between two children, split them across two nulls. A child's own `at` / `duration` still apply, in composition time.
- The null lives for the whole composition unless it has `at` / `duration`; when it is not alive its children are not drawn.
- A **mask** on a child shares the child's space, so it follows the null as well.
- Only `null` layers can be parents (not shapes, text or images), and a `threeD` layer or a camera cannot have a parent. These cases, an unknown name and a cycle are each warned about, and the layer is drawn without a parent.

### `audio`

Audio-only sequence. No visual. Volume is animatable via keyframes.

```ts
{
  type: 'audio',
  asset: 'bgm',
  loop?: false,
  volume: 0,
  keyframes: [
    { at: 0,  to: { volume: 0.6 }, duration: 1 },     // fade in
    { at: -1, to: { volume: 0 },   duration: 1 },     // fade out (negative `at` = relative to end)
  ],
}
```

`speed` (audio **files** only) plays the file faster, slower or backward; the pitch follows, like a tape. It does not apply to `sfx` / `music` (an sfx has `pitch`, in semitones). To change the speed over time animate `time` (see [Time](#time-speed-and-time)).

Audio is mixed during `Movie.init()` and during `Movie.render()`. Volume keyframes interpolate linearly.

#### Sound effects without files: `sfx`

```ts
{ type: 'audio', sfx: 'swoosh', at: 2 }                                          // a preset at its own length
{ type: 'audio', sfx: { preset: 'hit', pitch: -3, brightness: -0.5 }, at: 4 }    // lower and darker
{ type: 'audio', sfx: 'riser', at: 3, duration: 1.5, volume: 0.7 }              // duration IS the sound's length (stretched)
{ type: 'audio', at: 6, duration: 0.3,                                          // a custom sound
  sfx: { voices: [{ wave: 'square', freq: [1600, 200], filter: { type: 'lowpass', freq: 3000 }, envelope: 'fall' }] } }
```

The sound is synthesised from data at init (no asset, no network), deterministic, and the same mix in playback and in the exported file (encoded there: AAC / Opus are lossy). `at` is where it starts; `volume` and volume keyframes work as for files; `loop` is not available (one layer per hit). Knobs: `pitch` (semitones, ±24), `brightness` (−1 dark … 1 bright), `seed` (another take of the random parts). `volume: 1` is the preset's standard level, peaking at −12 … −18 dBFS depending on the preset; the finished mix is soft-limited above 0.9 with a warning naming the layers. A custom sound has up to 16 `voices`: `wave` (`sine` `triangle` `square` `saw` `noise`), `freq` (Hz or `[from, to]`), `filter` (`{ type: 'lowpass' | 'highpass' | 'bandpass', freq, q }`), `envelope` (`fall` `bell` `swell` `hold`), `pan`, `from` / `to` (part of the sound, 0–1), `gain`; its default length is 0.5 s.

| Preset | Default length | Loudest at | Brightness | Use for |
|---|---|---|---|---|
| `click` | 0.04 s | start | ≈ 12780 Hz | UI click, tick |
| `pop` | 0.12 s | start | ≈ 390 Hz | an element appearing |
| `swoosh` | 0.5 s | 0.16 s | ≈ 3070 Hz | transitions, fly-pasts (moves left → right) |
| `swipe` | 0.22 s | start | ≈ 13190 Hz | quick UI swipe |
| `hit` | 0.7 s | start | ≈ 150 Hz | impact, slam |
| `riser` | 1 s | its end | ≈ 11850 Hz | build-up into a hit |
| `chime` | 1.4 s | start | ≈ 1400 Hz | success, reveal |
| `beep` | 0.16 s | flat | ≈ 1030 Hz | countdown, alert |
| `coin` | 0.4 s | 0.07 s | ≈ 1870 Hz | reward, collect |
| `glitch` | 0.35 s | 0.22 s | ≈ 3970 Hz | digital error |
| `typewriter` | 0.06 s | start | ≈ 3260 Hz | one key (vary `seed` per key) |

Brightness is the spectral centroid that `movie.inspectAudio()` reports (`sound.brightnessHz`), at 48 kHz with no knobs.

#### Music written as text: `music`

A tune with no audio file: notes, chords and drum patterns written as strings, played by a small built-in synthesiser. Deterministic (same score, same sound, in playback and in the exported file); the synthesiser is its own chunk, loaded only when a movie uses it.

```ts
{ type: 'audio', at: 0.5, volume: 0.8, music: {
    bpm: 84, swing: 0.16, reverb: 0.26,
    tracks: [
      { inst: 'keys',  vol: 0.7, pan: -0.15, strum: 0.012, notes: 'Cmaj7:4 Am7:4 Dm7:4 G7:4' },
      { inst: 'bass',  vol: 0.85, notes: 'c2:1.5 _:0.5 g2:1 c2:1 | a1:1.5 _:0.5 e2:1 a1:1 | d2:1.5 _:0.5 a2:1 d2:1 | g1:1.5 _:0.5 d2:1 g1:1' },
      { inst: 'pluck', vol: [[0, 0], [8, 0.55]], step: 0.5, notes: 'e5:1 d5:0.5 c5:0.5 e5:2 | c5:1 a4:1 e5:2 | f5:1 e5:0.5 d5:0.5 a4:2 | d5:1.5 b4:0.5 g4:2' },
    ],
    drums: [{ from: 4, kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xo' }],
} }
```

**Layer.** `at` starts it, `volume` (and volume keyframes) scale it. `duration` defaults to the music's length plus its reverb tail (`tail`, 2.5 s), but never past the end of the composition (the music then ends with the movie, with a short fade). A shorter `duration` cuts it with a fade; a longer one is silent after the music unless **`loop: true`**, which repeats the score until the layer ends (default: the end of the composition). At `volume: 1` the music peaks at −6 dBFS (about −20 dB RMS), a bed that sits under speech and sound effects (an sfx peaks at −12 dBFS). Measured: a 4-bar tune (bell + bass + kick, a pluck and a hat on the repeat) at `volume: 0.8` reads −22 LUFS and −7.7 dBTP (`piano-roll`); web video is usually −14 to −16 LUFS, so 0.8 is not a limit: raise `volume` and watch `inspectAudio().loudness.truePeakDb`. `inspectAudio()` lists a music layer as ONE source (its start); to line a picture up with a note, compute the onset yourself: `at + beat × 60 / bpm` (build the bars and the score from one array so they cannot drift).

**Score** (`music`): `bpm` (a number, or `[beat, bpm]` points for a tempo change: `[[0, 96], [28, 96], [32, 60]]` slows down over beats 28–32, a ritardando), `tracks`, `drums`, `swing` (0–0.4: delays the off-beat eighths and sixteenths; 0.16 is a gentle lo-fi lilt), `reverb` (0–0.6, default 0.22), `humanize` (seconds of seeded timing jitter, default 0.012), `drumVol` (default 0.8), `grid` (drum steps per beat, default 4), `transpose` (semitones, all pitched tracks), `tail`, `seed`. Misspelt names warn with "did you mean". The music's length is its longest track (drums repeat up to it), so a track of rests (`'_:16'`) sets a length.

**Tracks.** `inst` is one of `keys` (electric piano), `pluck` (guitar / harp), `pad` (slow warm synth pad), `bass` (synth bass), `sub` (pure sine bass, for a heartbeat), `lead` (soft melodic lead), `bell` (glockenspiel), `musicbox` (a bright tine with a short ring). Options: `vol` (0–1.5, default 0.8, or `[beat, level]` points joined by lines for a fade-in or a swell), `pan` (−1…1), `step` (length of a token without `:`, in beats, default 1), `strum` (seconds between the notes of a chord, 0.01 sounds natural), `legato` (0.1–1, how much of a note's length it sounds), `tone` (0–1, brightness; lower is darker, a lo-fi dulling), `reverb` (0–1, this track's share of the reverb: dry bass, wet bells), `attack` / `release` (seconds; a pad's fade in and out), `ring` (seconds a bell or musicbox rings), `transpose` (semitones for this track). Good ranges: bass c1–c3, keys / pluck c3–c6, pad c2–c5, lead c4–c6, bell c5–c7.

**`notes` string.** Tokens are separated by spaces (`|` is ignored: use it for bars). The unit is the **beat** (a quarter note); count them, a 4/4 bar is 4 beats.

| Token | Meaning |
|---|---|
| `c4` `f#3` `Bb2` | a note (c4 = middle C); `:2` after it is its length in beats (`c4:0.5` an eighth), default `step` |
| `Am7` `F#m` `Bbmaj7` `C@4` `Am7/e` | a chord, voiced close around octave 3 (`@4` puts the root in octave 4; `/e` puts e in the bass). Kinds: none, `m`, `5`, `aug`, `dim`, `sus2`, `sus4`, `6`, `m6`, `add9`, `madd9`, `add11`, `7`, `maj7`, `m7`, `mMaj7`, `dim7`, `m7b5`, `7sus4`, `7b9`, `7#9`, `9`, `maj9`, `m9`, `11`, `m11`, `13`, `maj13`, `m13`, `maj7#11` |
| `[c4 e4 g4]:2` | a chord written out note by note (exact voicings) |
| `_` `_:2` | a rest |
| `~` `~:1` | hold: lengthens the note before |
| `!` `,` | accent / soft, before or after the length: `c4!:1`, `c4:1,` |

**Drums.** `drums` is an object of patterns, or a list of them with `from` / `to` (beats) so a groove can start late or stop (`[{ kick: 'x...' }, { from: 8, snare: '....x...' }]`). A pattern is a string of steps: `x` hit, `o` soft hit, `.` nothing (`|` and spaces are ignored); one step is 1/`grid` of a beat, so with the default grid 4 a 16-step string is one bar of 4/4, and a longer string (32 steps) is a longer figure that repeats. Drums: `kick snare hat openhat clap rim tom crash shaker sleigh` (`sleigh` is a jingle of small bells).

**Other meters.** The notation counts beats (the quarter note is 1), so 3/4 is bars of 3 beats. 6/8 is bars of 3 beats too: a dotted quarter is `:1.5`, an eighth `:0.5`; set `grid: 2` so a drum step is an eighth note (a 6-step pattern is one bar; the same `grid: 2` gives 6 eighth steps per bar in 3/4), and leave `swing` at 0. `grid: 3` is for triplet eighths in 4/4 (a shuffle).

**Hear it without a movie.** [`musicBuffer(music)`](api.md#musicbuffer) returns a Web Audio buffer; [`examples/music-lab.html`](../examples/music-lab.html) plays eight finished scores and shows each one as source.

**Seeing the music in the picture.** [`musicEnvelope(music, { frameRate })`](api.md#musicenvelope) analyses the same score into `level` / `bass` / `mid` / `treble` and exact beats for [`react()`](#react), so a title can pulse with the kick of a tune that has no file.

### `composition`

Nested composition. Same shape as the root spec but with `type: 'composition'` and an explicit `width`/`height`. Children animate within the local coordinate system; the composition itself can be positioned, scaled, and rotated as a unit.

**Size, clipping and culling** (measured): a 2D composition does **not** clip its children — a child far outside `width × height` is still drawn. But the rectangle `width × height` is what the renderer uses to decide the group is on screen: when that whole rectangle is off the canvas the group is skipped even if a child is placed back on screen. So keep the rectangle around what it draws (or make it canvas-sized). A `threeD: true` composition (a card) is rendered into a texture of exactly `width × height`, so it **does** clip its children there; size it for soft shadows too.

```ts
{
  type: 'composition',
  width: 600, height: 120,
  initial: { x: 'GW/2 - 300', y: 'GH * 0.86' },
  keyframes: [
    { at: 2.4, from: { alpha: 0, rotation: -12 },
               to:   { alpha: 1, rotation: 0 },
               duration: 0.7, ease: 'elastic.out(1, 0.5)' },
  ],
  sequences: [
    { type: 'text', text: 'inside', initial: { x: 300, y: 60, anchorX: 0.5, anchorY: 0.5 }, style: { fontSize: 28, fill: '#fff' } },
  ],
}
```

A composition can also have its **own time**: `speed` (2 = its content plays twice as fast, 0.5 = slow motion, negative = backward) and `time` keyframes (see [Time](#time-speed-and-time)). The layers inside then write `at`, `duration` and `keyframes` in the composition's own seconds; the composition's own `at`, `duration` and keyframes stay in the outer time. A sound or `sfx` inside follows the composition's clock.

### `shape`

Parametric primitive backed by PIXI v8 `Graphics`. Six kinds, discriminated by `shape`. All geometry props accept the [expression language](#expressions), so dimensions can follow the canvas:

```ts
// Centered rounded panel that fills 80% of the canvas
{
  type: 'shape', shape: 'rect',
  width: 'W * 0.8', height: 'H * 0.6', cornerRadius: 24,
  initial: {
    x: 'W/2', y: 'H/2',
    fillColor: '#1a2640', fillAlpha: 0.85,
    strokeColor: '#3a5680', strokeWidth: 2,
  },
}
```

Every primitive draws centred on its local origin (so `anchorX`/`anchorY` and `pivotX`/`pivotY` semantics line up with the other sequence types).

| `shape`   | Required props                           | Optional               |
|-----------|------------------------------------------|------------------------|
| `rect`    | `width`, `height`                        | `cornerRadius`, `trimStart`, `trimEnd` |
| `circle`  | `radius`                                 | `trimStart`, `trimEnd` |
| `ellipse` | `radiusX`, `radiusY`                     | `trimStart`, `trimEnd` |
| `arc`     | `radius`                                 | `innerRadius`, `startAngle` (0), `endAngle` (360) |
| `line`    | `from: [x,y]`, `to: [x,y]` (canvas coordinates; stroke in `initial`) | `trimStart`, `trimEnd` |
| `polygon` | `points: [[x,y], …]`                     | `open` (default false), `trimStart`, `trimEnd` |
| `path`    | `d` (SVG path data)                      | `trimStart`, `trimEnd`, `morphTo`, `morph`, `morphPoints` |

**`arc`** is an arc around its local origin (the centre). Angles are in **degrees: 0° is 3 o'clock and positive is clockwise**, so a progress ring starts at `startAngle: -90` (12 o'clock) and animates `endAngle` from `-90` to `270`. With a stroke and no fill it is an open arc line (`strokeCap: 'round'` for rounded ends); with a fill it is a sector (a pie slice), and with `innerRadius` a ring segment (a donut slice). A sweep of 360° or more is a full circle; `endAngle < startAngle` sweeps counter-clockwise. `radius`, `innerRadius`, `startAngle` and `endAngle` are all animatable.

```ts
{ type: 'shape', shape: 'arc', radius: 120, startAngle: -90, endAngle: -90, strokeCap: 'round',
  initial: { x: 'GW/2', y: 'GH/2', strokeColor: '#ffd166', strokeWidth: 24 },
  keyframes: [{ at: 0, to: { endAngle: 270 }, duration: 2, ease: 'power3.out' }] }   // a progress ring filling clockwise from the top
```

**Draw-on (`trimStart` / `trimEnd`).** On every shape except `arc`, `trimStart` and `trimEnd` (0–1, default 0 and 1, both animatable) are the part of the outline that is stroked, as fractions of its length. Animate `trimEnd` from 0 to 1 to draw a line, border or SVG path on; animate `trimStart` after it to wipe it off the same way; animate both for a travelling dash. A rect's outline starts at its top-left and goes clockwise, a circle / ellipse's at 12 o'clock and goes clockwise, a polygon's includes its closing edge, and a path's several sub-paths count as one length in order (add **`trimEach: true`** to trim every sub-path on its own, so they all draw on at the same time: a glyph or a logo made of several strokes). **The fill is not trimmed** (the whole shape stays filled): fade `fillAlpha` in after the draw-on. Use `strokeCap: 'round'` for a friendly end. For `arc`, animate `endAngle` instead (a `trim…` on an arc warns).

```ts
{ type: 'shape', shape: 'path', d: 'M 0 50 L 45 95 L 130 0', trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
  initial: { x: 1040, y: 270, strokeColor: '#7bd88f', strokeWidth: 16 },
  keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 1, ease: 'power2.inOut' }] }   // a check mark drawing itself
```

**Morph (`morphTo` / `morph`).** A `path` can turn into another outline: give `morphTo` (SVG path data in the same canvas coordinates as `d`) and animate `morph` from 0 (the `d` outline) to 1 (the `morphTo` outline). In between it is drawn as a polygon of points half way from one to the other (`morphPoints`: 8–2048, default 128). Closed outlines are lined up (start point and direction) so they do not twist; sub-paths are paired in order, and an extra one grows from (or shrinks into) its own centre. Fill and stroke both follow, and `trimStart` / `trimEnd` walk the morphing outline. Write both outlines as `M … L … C … Z` in absolute coordinates (arcs and holes work too, but keep the same number of sub-paths on both sides).

```ts
{ type: 'shape', shape: 'path', d: 'M 640 160 C 780 160 860 260 860 360 C 860 470 770 560 640 560 C 510 560 420 470 420 360 C 420 250 500 160 640 160 Z',
  morphTo: 'M 640 130 L 700 300 L 880 300 L 735 410 L 790 590 L 640 480 L 490 590 L 545 410 L 400 300 L 580 300 Z',
  initial: { fillColor: '#ffd166' }, keyframes: [{ at: 0.5, to: { morph: 1 }, duration: 1.5, ease: 'power2.inOut' }] }   // a blob turns into a star
```

`strokeCap` (`'butt'`, `'round'`, `'square'`) and `strokeJoin` (`'miter'`, `'round'`, `'bevel'`) work on every shape, at the top level or in `initial`; they are not animated. Sharp corners (the apex of an M in outlined text, a thin polygon) poke out with the default `miter` join: use `'round'`.

**Style** is set on `initial` and animatable via keyframes:

| Key           | Notes                                                        |
|---------------|--------------------------------------------------------------|
| `fillColor`   | Hex string (`'#3399ff'`) or number (`0x3399ff`). Omit = no fill. |
| `fillAlpha`   | 0..1, default 1                                              |
| `strokeColor` | Hex string or number. Requires `strokeWidth > 0` to render.  |
| `strokeAlpha` | 0..1, default 1                                              |
| `strokeWidth` | Pixels. Default 0 (no stroke).                               |

Colour keys (`fillColor`, `strokeColor`) tween smoothly between hues — no snap at the end. Numeric keys (`fillAlpha` / `strokeAlpha` / `strokeWidth`) animate linearly.

#### `fillGradient`

Fill a shape with a gradient instead of `fillColor` (top level or in `initial`). Positions are in 0–1 of the shape's own bounds, so the gradient follows the shape's size. Colours may carry alpha, so a radial gradient from transparent to dark is a vignette. Animatable (below), on shapes and on text.

```ts
{ type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2' },
  fillGradient: { stops: [[0, '#1b2a6b'], [0.6, '#7b3fe4'], [1, '#ff6a88']] } }                // linear, top → bottom
{ ..., fillGradient: { angle: 0, stops: [[0, '#00f5a0'], [1, '#00d9f5']] } }                    // left → right
{ ..., fillGradient: { type: 'radial', radius: 0.75, stops: [[0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.7)']] } }   // vignette
```

**Animating a gradient.** A keyframe's `set` / `from` / `to` takes a **partial** `fillGradient` (`angle`, `center`, `innerRadius`, `radius`, `stops`); what you leave out stays as it is. Numbers move linearly; the stop colours move through the layer's `colorSpace` (`'oklch'` keeps a fade vivid: in `'rgb'`, green to magenta passes through grey). The layer needs a starting `fillGradient` (top level or in `initial`), `stops` must keep the same count, and `type` cannot change (linear ↔ radial). A mistake (a mistyped key, another number of stops, `'fillGradient.angle'` or `gradientAngle` instead of `fillGradient: { angle }`) is said once, when the layer is built. A text layer takes a `fillGradient` for its letters too, **linear only** (`angle` and `stops` apply; `type`, `center`, `innerRadius` and `radius` are ignored, with a warning: use a shape for a radial gradient); the letters are re-rasterised on every change. A keyframe with only `from` runs from that gradient to the layer's own.

```ts
{ type: 'shape', shape: 'rect', width: 560, height: 420, initial: { x: 520, y: 540 }, colorSpace: 'oklch',
  fillGradient: { angle: 0, stops: [[0, '#ff2d55'], [1, '#0ea5e9']] },
  keyframes: [{ at: 0, duration: 2, to: { fillGradient: { angle: 360, stops: [[0, '#00e5ff'], [1, '#ffd60a']] } } }] }
{ type: 'text', text: 'GRADIENT', style: { fontSize: 200, fontWeight: '900' }, initial: { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 },
  fillGradient: { angle: 0, stops: [[0, '#ff2d55'], [1, '#0ea5e9']] },
  keyframes: [{ at: 0, duration: 2, to: { fillGradient: { angle: 180 } } }] }
```

| Field | Notes |
|---|---|
| `type` | `'linear'` (default) or `'radial'` |
| `stops` | at least two: `[offset 0–1, colour]` or `{ offset, color }` |
| `angle` | linear: degrees, `0` = left → right, `90` = top → bottom (default) |
| `center`, `innerRadius`, `radius` | radial: centre in 0–1 (default `[0.5, 0.5]`), inner radius (default 0), outer radius (default 0.5); an ellipse on a non-square shape |

#### `colorSpace`

Per-shape choice of how colour keyframes are interpolated. Default `'rgb'` (linear sRGB lerp via `gsap.utils.interpolate`) is fast but classic — a red → green ramp passes through muddy olive at the midpoint. The two perceptually uniform options keep saturation through the transition:

| Value     | Behaviour                                                                                         |
|-----------|---------------------------------------------------------------------------------------------------|
| `'rgb'`   | Default. Linear sRGB lerp.                                                                        |
| `'oklab'` | Straight line in OKLab's chromaticity plane. Brighter, more chromatic midpoints.                  |
| `'oklch'` | (L, C, h) with hue along the shorter angular path. Smooth rainbow-style sweeps; ideal for hue cycling. |

```ts
{
  type: 'shape', shape: 'circle', radius: 40,
  colorSpace: 'oklch',                       // ← red → green via vibrant orange
  initial: { fillColor: '#ff0000' },
  keyframes: [
    { at: 1, to: { fillColor: '#00ff00' }, duration: 2, ease: 'sine.inOut' },
  ],
}
```

```ts
{
  type: 'shape', shape: 'circle', radius: 40,
  initial: { x: 'W/2', y: 'H/2', fillColor: '#ff5577' },
  keyframes: [
    { at: 1, to: { fillColor: '#55ddaa' }, duration: 1.0, ease: 'sine.inOut' },
    { at: 2, to: { strokeColor: '#fff', strokeWidth: 6 }, duration: 0.5 },
  ],
}
```

**Transforms animate normally.** `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `alpha` etc. all go through the standard keyframe pipeline.

```ts
// SVG-path heart that scale-pops on entry, then beats twice
{
  type: 'shape', shape: 'path',
  d: 'M 0 -20 C -30 -50 -70 -10 0 30 C 70 -10 30 -50 0 -20 Z',
  initial: { x: 'W/2', y: 'H/2', fillColor: '#ff3366' },
  keyframes: [
    { at: 0,   from: { alpha: 0, scale: 0 },
               to:   { alpha: 1, scale: 1 },
               duration: 0.5, ease: 'back.out(2.5)' },
    { at: 1.5, to: { scale: 1.2 }, duration: 0.3, ease: 'power2.out' },
    { at: 1.8, to: { scale: 1.0 }, duration: 0.3, ease: 'power2.in' },
  ],
}
```

**Scalar geometry is animatable.** `width`, `height`, `cornerRadius` (rect), `radius` (circle), `radiusX` / `radiusY` (ellipse) all flow through the same per-frame redraw and can be tweened via keyframes — useful for progress bars (animate `width`), pulsing icons (animate `radius`), or shape-morph callouts. Array geometry (polygon `points`, line endpoints, path `d`) is baked at build time; use `scale` / `scaleX` / `scaleY` for those.

For rect / circle / ellipse, `anchorX` / `anchorY` (default `0.5` each; not available on line / polygon / path, which use `pivotX` / `pivotY`) control which point on the bbox sits at the local origin — `0` is left/top, `1` is right/bottom. They're animatable too. Critical for "grow from one edge" effects:

```ts
// Left-anchored progress bar — width animates 0 → W, left edge stays at x
{
  type: 'shape', shape: 'rect', width: 0, height: 18, cornerRadius: 9,
  anchorX: 0,                                  // ← left edge at x
  initial: { x: 0, y: 'H/2', fillColor: '#5599ff' },
  keyframes: [
    { at: 0, to: { width: 'W' }, duration: 4, ease: 'sine.inOut' },
  ],
}
```

---

### `shader`

A fragment shader as a layer: write a Shadertoy `mainImage` and it is drawn into a picture that is a layer like any other (it moves, fades, masks, filters, blends, goes into 2.5D and receives lights). Use it for what is drawn by a formula: flowing colour fields, plasma, noise, waves, patterns.

```ts
{ type: 'shader', name: 'plasma',
  fragment: `
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord / iResolution.xy;
      float v = sin(uv.x * 10.0 + iTime) + sin(uv.y * 8.0 - iTime * 1.3);
      fragColor = vec4(mix(tint, vec3(0.1, 0.0, 0.3), 0.5 + 0.25 * v), 1.0);
    }`,
  uniforms: { tint: '#ff8040', speed: 1 },                                   // declared for you: `uniform vec3 tint;` and `uniform float speed;`
  keyframes: [{ at: 0, to: { 'uniforms.speed': 3, 'uniforms.tint.2': 0.8 }, duration: 4 }] }
```

Fields: `fragment` (the GLSL, required), `uniforms` (below), `width` / `height` (px, expressions allowed; default the composition's size), `resolution` (default 1; `0.5` draws a quarter of the pixels and scales up: the way out for a heavy shader), `transparent` (default `false`), and everything every layer has.

Rules:
1. **Write `mainImage`** — `void mainImage(out vec4 fragColor, in vec2 fragCoord)`, GLSL ES 3.00. `fragCoord` is in the layer's pixels, origin at the **bottom left** (Shadertoy's convention). `iResolution` (a `vec3`: width, height, 1), **`iTime`** (the layer's own seconds, from 0 at its start; inside a time-remapped composition, that composition's clock) and `iFrame` (an `int`) are declared for you, and so is every name in `uniforms`. Do not write `#version`, `precision`, `main()`, `gl_FragColor` (write the colour into `fragColor`), `texture2D` (it is `texture`), `varying` or `attribute`: each warns with what to write.
2. **`uniforms`**: a number is a `float`, 2 to 4 numbers are a `vec2` / `vec3` / `vec4`, a colour `'#rrggbb'` is a `vec3` in 0..1. Keyframes move them as `'uniforms.speed'`; a component of a vector or a colour as `'uniforms.tint.0'` (0 = x or red). A name or index that does not exist warns once with the likely name.
3. **Opaque by default**: the alpha you write is ignored. `transparent: true` uses it (the shader's colour is premultiplied by its alpha, so soft edges blend over what is behind).
4. **It is a layer, not a filter**: it cannot read what is behind it, and this version has no `iChannel` textures, `iMouse`, `iDate` or `iTimeDelta` (using one warns). One pass only: no buffers or feedback.
5. **A compile error is said in your own line numbers** (`line 2: 'x' : undeclared identifier`) and the layer is drawn as a magenta checkerboard until it is fixed, so a mistake is never a silent blank layer.
6. **The GPU cannot be stopped**: a `while` loop, or a `for` whose bound is not a constant, can hang it, so both warn. Give loops a constant bound and `break` early.
7. **Deterministic, with one caveat**: a frame is a pure function of `iTime`, `iFrame` and the uniforms, so playback, seeking and export agree. Different GPUs can round differently, so an export from another machine can differ in the last bits.
8. **Cost** (a prototype measurement at 1080p, on one machine, an Apple M1 Pro; the released layer is not re-measured): a 160×90 shader with an 8-step loop, 20 layers, cost 11 ms (WebGPU) to 17 ms (WebGL) a frame more than 20 plain rectangles; one full-size 1920×1080 layer cost about 10 ms more. Every layer pays a fixed cost (about 0.5 to 0.85 ms), so use a few big shaders rather than many small ones, and `resolution` for heavy ones. All shader layers share **one** WebGL2 context (so there is no limit from the browser's number of contexts); a shader layer needs WebGL2 (without it the build warns and draws the checkerboard).

## 3D layers & camera

Place any 2D layer in depth and view it through a camera — After Effects style, no three.js. Everything uses the normal `initial` / `keyframes` / expression vocabulary.

### Conventions (read this first)

| Thing | Convention |
|---|---|
| Axes | `+x` right, `+y` down, **`+z` toward the viewer** (like CSS `translateZ`). Bigger `z` = nearer = larger on screen. |
| Units | Positions in composition pixels. **Rotations in degrees.** |
| Rotation signs | Same as CSS: `rotationY: 30` swings the right edge away; `rotationX: 30` brings the bottom edge toward you; `rotation` is the Z axis. |
| Rotation centre | The same point 2D `rotation` uses: `anchorX/anchorY` (sprites, text, shapes) or `pivotX/pivotY` (compositions). Set `anchorX: 0.5, anchorY: 0.5` to spin about the centre. |
| Default camera | Centred, looking straight at the `z = 0` plane, which maps 1:1 to pixels. A `threeD` layer at `z = 0` looks identical to a 2D layer. |
| Camera props | `x`, `y`, `z`, `lookAtX`, `lookAtY`, `lookAtZ`, `fov` — all in `initial` / `keyframes`, never on the camera itself. |

### `threeD` layers

Add `threeD: true` to any visual layer, then use `z`, `rotationX`, `rotationY`:

```json
{
  "sequences": [
    { "type": "text", "text": "tilted", "threeD": true,
      "style": { "fontSize": 64, "fill": "#ffffff" },
      "initial": { "x": "GW/2", "y": "GH/2", "anchorX": 0.5, "anchorY": 0.5, "rotationY": -35 },
      "keyframes": [{ "at": 0, "to": { "rotationY": 0 }, "duration": 1, "ease": "power2.out" }] }
  ]
}
```

`z`, `rotationX` and `rotationY` are ignored on a layer without `threeD: true` (a warning tells you). `threeD: false` layers ignore the camera and keep stack order.

### Camera

The camera is a layer: `{ "type": "camera" }`. It has no visuals. With nothing set it is the default camera.

| Prop | Meaning | Default |
|---|---|---|
| `x`, `y` | camera position | `W/2`, `H/2` |
| `z` | camera depth. **Auto:** if you never set it, it follows `fov` so the `z = 0` plane stays 1:1 | `(H/2) / tan(fov/2)` |
| `lookAtX`, `lookAtY`, `lookAtZ` | the point it looks at | `W/2`, `H/2`, `0` |
| `fov` | vertical field of view, degrees (clamped to 1–179) | 40 |
| `focus` | the plane that is **sharp**: a `threeD` layer's name (its first `z`) or a z number. Turns depth of field on (see [Depth of field](#depth-of-field)) | the `z = 0` plane |
| `aperture` | how shallow: the lens diameter in px. `0` = off. Written alone, or with `focus`, it turns depth of field on | `30` |
| `offsetX`, `offsetY`, `offsetZ`, `lookOffsetX`, `lookOffsetY`, `lookOffsetZ` | **added** to the position and to the look-at point, on top of the camera's own move. Put a handheld shake (`wiggle()`) here and it never collides with a dolly or an orbit (two tweens on the same prop overwrite each other; these are separate props) | 0 |

A flight through the scene is [`cameraPath()`](#camerapath) (a route as keyframes); a threeD layer the camera passes on purpose takes `hideBehindCamera: true` (hidden quietly when it is at or behind the camera, instead of a warning).

```json
{
  "sequences": [
    { "type": "camera", "name": "cam",
      "keyframes": [
        { "at": 0, "from": { "x": "GW/2 - 260", "lookAtX": "GW/2 - 260" },
                   "to":   { "x": "GW/2 + 260", "lookAtX": "GW/2 + 260" },
          "duration": 4, "ease": "sine.inOut" }
      ] },
    { "type": "shape", "shape": "rect", "width": 300, "height": 200, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": -400, "fillColor": "#3a6ea5" } },
    { "type": "shape", "shape": "rect", "width": 300, "height": 200, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": 250, "fillColor": "#d96a3a" } }
  ]
}
```

Moving the camera sideways makes the near rectangle slide faster than the far one (parallax). Animating only `fov` keeps the `z = 0` plane fixed and changes how strong the perspective is (a dolly zoom):

```json
{
  "sequences": [
    { "type": "camera",
      "keyframes": [{ "at": 0, "to": { "fov": 70 }, "duration": 3, "ease": "sine.inOut" }] },
    { "type": "shape", "shape": "circle", "radius": 120, "threeD": true,
      "initial": { "x": "GW/2", "y": "GH/2", "z": 300, "fillColor": "#38a169" } }
  ]
}
```

- A camera affects the `threeD` layers that are its **siblings** (same composition). A nested composition has its own camera for its children, and is itself a layer in its parent's space when it has `threeD: true`.
- Several cameras may exist if their lifespans (`at` / `duration`) do not overlap — each is a camera cut. Overlapping cameras warn; the last-listed one wins.
- With no camera layer the default camera is used.

### Depth of field

Write `focus` (and, if you want, `aperture`) on the camera and the `threeD` layers blur by how far they are from the plane in focus; the layer in focus stays sharp. Nothing else changes: without `focus` and `aperture` there is no blur and no cost.

```json
{
  "sequences": [
    { "type": "camera", "initial": { "focus": "title" } },
    { "type": "text", "name": "title", "text": "Focus", "threeD": true, "style": { "fontSize": 96, "fill": "#ffffff" }, "initial": { "x": "GW/2", "y": "GH/2", "z": 0, "anchorX": 0.5, "anchorY": 0.5 } },
    { "type": "shape", "shape": "circle", "radius": 140, "threeD": true, "initial": { "x": "GW/2 + 260", "y": "GH/2", "z": -500, "fillColor": "#3a6ea5" } }
  ]
}
```

A focus pull is a normal keyframe on `focus`; a layer name works there too:

```json
{
  "sequences": [
    { "type": "camera", "initial": { "focus": "front", "aperture": 60 },
      "keyframes": [{ "at": 1, "to": { "focus": "back" }, "duration": 1, "ease": "power2.inOut" }] },
    { "type": "shape", "shape": "rect", "name": "front", "width": 300, "height": 200, "threeD": true, "initial": { "x": "GW/2 - 200", "y": "GH/2", "z": 100, "fillColor": "#d96a3a" } },
    { "type": "shape", "shape": "rect", "name": "back", "width": 300, "height": 200, "threeD": true, "initial": { "x": "GW/2 + 200", "y": "GH/2", "z": -400, "fillColor": "#3a6ea5" } }
  ]
}
```

- `aperture` is the lens diameter in pixels; the blur radius of a layer is `aperture × focal × |1/depth − 1/focusDepth| / 2` (focal = `(H/2)/tan(fov/2)`), capped at 32 px. With the default camera at 720p and the focus on `z = 0`, a layer at `z = −400` blurs by: `aperture 10` → 1.4 px (a soft hint), `30` → 4.3 px (clearly shallow), `60` → 8.6 px (strong), `100` → 14.4 px (extreme: small bright objects show a faint speckle). A layer further away blurs more, up to the cap.
- A layer **nearer** than the focus blurs too, and for the same `z` distance a near layer blurs more than a far one: with `aperture: 58` and the focus on a sign at `z = −600`, a layer at `z = +250` blurs about 21 px; with the focus on a layer at `z = +250`, a layer at `z = −1100` blurs about 25 px (720p, default camera). Plan a scene with the formula above, or read `depthBlur` from `movie.inspect(frame)`.
- A layer name in `focus` means **the first `z`** of that layer; if its `z` moves later, animate `focus` itself with numbers (a warning says so). A name that no layer has, or a layer that is not `threeD`, warns and uses the `z = 0` plane.
- The blur is the same over the whole layer (decided by the depth of the layer's origin along the camera's view direction: with an orbiting camera a layer far off the look-at axis is a little deeper than its `z`). A tilted floor is one blur: split it into layers.
- It blurs `threeD` layers only. A nested `threeD` composition is blurred as one layer by its parent's camera; its own camera decides its content.
- The layer's own `blur` and its `filters` are separate and add to it.
- Many blurred layers cost one filter pass each (more on WebGPU): 20 or more at once warns. A field of bokeh lights is a few big `threeD` cards (a plain layer or a composition with a few dozen circles in it), not dozens of layers. To make a card at depth `z` fill the frame, size it `(W / s) × (H / s)` with `s = camZ / (camZ − z)` (`camZ` = the camera's z, about 989 at 720p, fov 40): at `z = −720` that is `s = 0.58`, so about 2210 × 1240 for a 1280 × 720 frame.
- A **dolly** needs no typed distance: leave the camera's `z` alone (it stays automatic) and animate `offsetZ` (negative = closer); the focus plane and the layers keep their meaning. Writing `z` yourself means typing the home distance, `H / 2 / tan(fov / 2)`, which as an expression is `H / 2 / tan(20 * PI / 180)` for the default fov 40.
- If two layers have the same `name`, `focus` takes the first `threeD` one (and warns that the name is not unique). `focus` and `aperture` are camera properties: on any other layer they only warn.
- A negative or non-numeric `aperture` warns once and turns depth of field off.
- `movie.inspect(frame)` reports each `threeD` layer's blur as `depthBlur` (px, 0 = sharp).

### Lights

A `light` layer lights the `threeD` layers of its composition: they get darker and brighter with their angle and distance, like cards in a dark room. It is a layer like the camera: it draws nothing, and its numbers go in `initial` and `keyframes` (so it moves, springs, takes expressions and `ease`).

```ts
{ type: 'light', kind: 'ambient', initial: { intensity: 0.2 } },                    // what no other light reaches is this dark, not black
{ type: 'light', kind: 'spot', castsShadows: true,                                  // a spotlight that crosses the picture
  initial: { x: 160, y: -120, z: 700, lookAtX: 260, lookAtY: 330, lookAtZ: 0, coneAngle: 34, coneFeather: 0.7, intensity: 1.1 },
  keyframes: [{ at: 0.5, to: { x: 1100, lookAtX: 1020 }, duration: 4.5, ease: 'sine.inOut' }] },
{ type: 'shape', shape: 'rect', name: 'card', width: 300, height: 200, threeD: true, castsShadows: true, initial: { x: 300, y: 300, z: 0, fillColor: '#e0a458' } },
```

`kind` (a fixed setting on the layer): `'ambient'` (the same colour everywhere), `'point'` (from a position in every direction; the default), `'spot'` (a point light inside a cone around the direction to its look-at point), `'parallel'` (a direction only, from the position toward the look-at point: the sun). `falloff` (also fixed): `'none'` (default), `'smooth'` (full inside `radius`, fading to nothing over `falloffDistance` more), `'inverseSquare'` (full at `radius`, a quarter at twice that). Numbers you can animate:

| name | meaning | default |
|---|---|---|
| `x` `y` `z` | where the light is (px, like a layer; `z` toward the viewer) | up and to the left of the picture, 0.6 of the camera's distance |
| `lookAtX` `lookAtY` `lookAtZ` | the point a `spot` or `parallel` light points at | the middle of the picture |
| `intensity` | a multiplier: 1 = full, 0.25 = a quarter (not a percentage) | 1 |
| `color` | any colour (`'#ffd9a0'`) | white |
| `coneAngle` `coneFeather` | a spot's full angle in degrees, and the soft part of its edge as a fraction of the half angle (0 = hard, 1 = soft all the way in) | 90, 0.5 |
| `radius` `falloffDistance` | where the falloff starts and how far it runs (px) | 500, 500 |
| `shadowDarkness` `shadowDiffusion` | how dark the shadows of this light are (0..1) and how soft their edge is (px; 0 = hard) | 1, 0 |

Rules:
1. **A composition with a `light` layer lights every `threeD` layer in it.** To keep one unlit, write `lit: false` on it. Layers without `threeD` are never lit. **A composition with no light and no fog makes nothing new: the shader is not built and the picture and the cost do not change.**
2. **What no light reaches is black.** Add an ambient light (the build warns when there is none). A white ambient light at intensity 1 is no light at all: the picture is the one you would get without lights. A light behind a layer does not light the side the camera sees.
3. **A light counts only while it is alive** (its own `at` and `duration`). With no light alive at a moment, the layers are drawn unlit, as in a composition without lights; so give the lights the length of the scene.
4. **Each composition has its own lights.** A light inside a nested composition lights only that composition's `threeD` layers; an outer light does not reach inside it. A `threeD` composition (a card) is lit as one picture by its parent's lights.
5. **Layers are drawn in distance order and there is no depth buffer.** Planes that cross each other cannot be shown; for a floor or a wall, put the layer's origin at its far edge so it sorts behind what stands on it.
6. **Shading works on the sRGB values** (like After Effects): a strong light clips to white. The shading is `colour × (ambient + the lights)`, each light by `N·L`, its falloff and its cone.
7. **Order:** the layer's own `filters` run first (they draw into the layer's picture), then the shading, the fog, the depth-of-field blur, and last the `blendMode`. All of them work together.
8. At most 8 lights besides the ambient ones are used (the first 8 in layer order; the build says which are left out). Ambient lights are added up.
9. `color` keyframes mix in sRGB like other colour keyframes (`'#ff0000'` → `'#0000ff'` passes `#800080`). A light has no `colorSpace`.
10. `movie.inspect(frame)` gives each lit `threeD` layer a `light`: how lit its middle is (1 = as bright as with no light, 0 = black); `check.mjs --at` prints the most lit first. It is the number at the layer's **middle** and shadows are not in it, so it can say 1 for a layer whose lit part is hidden.
11. **A spot's pool on a wall** is a circle of radius about `distance × tan(coneAngle / 2)` around where its axis meets the wall (a 36° cone from 700 px away lights a circle about 230 px in radius), softened by `coneFeather`. A card in front of the wall throws its shadow on the far side from the light and can cover the pool behind it: make the cards smaller than the pool, or bring the lamp closer. A caster outside the pool still throws its shadow into it. A **floor** is a big layer with `rotationX: 90` and its origin at its far edge (`anchorY: 0`).

Checked against an independent JS reference of the shading (every pixel within 2/255) on WebGPU and WebGL, for ambient, point, spot and parallel lights, the three falloffs, a card turned on two axes, and a card seen from its back. Cost, measured at 1080p on one machine (an Apple M1 Pro, headless Chrome) as the extra time per frame against the same scene without light: lights alone cost about 1 ms on WebGPU (20 layers, 3 lights: 2.6 ms) and about the same on WebGL; shadows are the price (below).

### Shadows

A shadow needs both halves: the **light** has `castsShadows: true` and the **layer** has `castsShadows: true`. Then the layer's outline (its own picture's alpha) darkens the other lit `threeD` layers behind it, on the side away from the light.

- Hard edges by default (a hard shadow can read as a dark slab: `shadowDiffusion` of 10 to 20 usually looks right). `shadowDiffusion` (px, on the light) widens the edge, wider the farther the shadow falls from the caster, so a card near the wall has a sharp shadow and one far from it a soft one. `shadowDarkness` (0..1) sets how dark.
- A layer receives shadows from at most **4** casters (the first 4 in layer order; the build says which are left out), never from itself, and a caster that is hidden (outside its life, alpha 0, behind the camera) casts nothing. Several shadows join by the strongest, not by adding up, so overlaps are not darker.
- A shadow is the shadow of a flat picture: a card turned on its axis casts the turned outline; there is no self-shadowing, no shadow on a layer that is not lit (`lit: false`), no coloured or see-through shadow.
- **Soft shadows are the expensive part** (16 samples per pixel per caster). Measured at 1080p, extra ms per frame (WebGPU / WebGL): 5 layers, 1 light, hard 1.4 / 1.6, soft 4.6 / 6.1; 20 layers, 1 light, hard 0.8 / 0.1, soft 5.3 / 10.4; 20 layers, 3 lights, hard 2.6 / 8.7, **soft 19.8 / 21.6**. Three or more lights with soft shadows warn; give `shadowDiffusion` to one or two lights.

### Fog

The camera takes `fogNear`, `fogFar` (distances along the view direction, px), `fogColor` and `fogAmount` (0..1, how much of the colour the farthest things get). Writing any one of them turns fog on (the others default to: near = the camera's home distance, far = three times that, black, 1). A `threeD` layer is mixed toward the fog colour by its depth, per pixel (so a floor going away gets a true gradient). It comes after the shading and before the depth-of-field blur. 2D layers are not fogged: draw the background in the fog colour so what is far dissolves into it. Without lights, fog alone costs almost nothing. `fogFar` not beyond `fogNear`, or an amount outside 0..1, warns.

### Depth order and limits

- Consecutive `threeD` layers are drawn farthest-first. A non-`threeD` layer between them splits the group (like After Effects).
- A layer at or behind the camera is hidden for that frame.
- v1 limits: planes do not intersect (whole layers are sorted; with lights this shows when you build a room: see [Lights](#lights)); masks, transitions and `filterArea` are not supported on `threeD` layers (a mask is ignored with a warning); each `threeD` layer costs one extra render pass per frame.
- Wrong-but-likely names (`rotateY`, `translateZ`, `depth`, `perspective`, `zoom`) are not accepted; the console tells you the right name.

---

## three

Composites a [three.js](https://threejs.org/) scene as a normal layer. Each frame, the scene is rendered into an offscreen WebGL canvas and uploaded into the sequence's PIXI texture — so once built, the layer is a plain sprite: 2D `initial` / keyframe props, [masks](#masks), and [filters](#filters) all apply to it exactly like any other sequence type.

`type: 'three'` lives in the optional `pixi-effects/three` entry, not core `pixi-effects` — see [API reference](./api.md#pixi-effectsthree) for install/import details.

```ts
import { registerThree, three } from 'pixi-effects/three';
import * as THREE from 'three';

registerThree();   // once, before Movie.init

three({
  type: 'three',
  name: 'knot',
  width: 'GW * 0.6', height: 'GH * 0.6',
  initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  setup: (ctx) => {
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1, 0.35, 128, 32),
      new THREE.MeshStandardMaterial({ color: 0x7fb4ff }),
    );
    ctx.scene.add(knot);
    ctx.camera.position.z = 4;
    return { objects: { knot } };    // exposes `knot` to keyframes, see below
  },
  keyframes: [
    { at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 },
  ],
})
```

### Spec fields

| Field        | Type                                                        | Notes                                                                                   |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `width?`     | `PropValue`                                                 | layer size in composition px; expressions allowed (e.g. `'W * 0.5'`). Default: parent composition size. |
| `height?`    | `PropValue`                                                 | see `width`.                                                                              |
| `resolution?` | `number`                                                    | supersampling factor for the offscreen canvas. Default `1`.                              |
| `setup`      | `(ctx: ThreeContext) => Promise<ThreeSetupResult \| void> \| ThreeSetupResult \| void` | builds the scene once. Add objects to `ctx.scene`, position `ctx.camera` (or replace it via `{ camera }`). Async, so `Movie.init` can await GLTF / texture loading. |
| `update?`    | `(t: number, ctx: ThreeContext) => void`                    | optional per-frame hook; `t` is sequence-local time in seconds.                          |
| `dispose?`   | `(ctx: ThreeContext) => void`                                | cleanup for user-created GPU resources (geometries, materials, textures). Called from `destroy()`. |

`ThreeContext` is `{ scene, camera, renderer, width, height }` — the three.js `Scene`, `Camera`, `WebGLRenderer`, and the resolved layer size in composition px.

### Keyframe paths: `three.<name>.<path>`

Objects returned from `setup`'s `{ objects }` are addressable from keyframes as `three.<name>.<path>`, using the same `from`/`to`/`set` vocabulary as every other prop:

```ts
setup: (ctx) => {
  const knot = new THREE.Mesh(/* ... */);
  ctx.scene.add(knot);
  return { objects: { knot } };
},
keyframes: [
  { at: 0, to: { 'three.knot.rotation.y': Math.PI * 2 }, duration: 6 },
  { at: 0, to: { 'three.knot.position.x': 1.5 },         duration: 3 },
],
```

`camera` is exposed implicitly as `three.camera.<path>` unless `setup`'s `objects` already defines a `camera` key.

### Rules

1. Call `registerThree()` before `Movie.init` builds a composition containing a `type: 'three'` sequence — the sequence type is looked up by name at build time.
2. `update(t)` must derive all state purely from `t` — no wall clock, no unseeded randomness. Playback and export both seek arbitrarily; anything else in `update` means identical timestamps can render different pixels.
3. Each three sequence owns one WebGL context (an offscreen canvas + renderer). Browsers cap live WebGL contexts at roughly 8–16 — budget accordingly if a composition uses several three layers.
4. Like `custom` filters, the spec carries functions (`setup`, optionally `update` / `dispose`) and is **not** JSON-serializable.
5. The scene renders into the layer rectangle: anything that projects outside it is clipped at the layer's edges. Frame the camera with margin for the whole animation — rotating objects often project taller/wider than their resting pose (a `TorusKnotGeometry(radius, tube)`, for instance, extends to `1.5 * radius + tube`, not `radius`).

---

## Masks

> A mask is a layer in the **parent's** coordinate space and does **not** follow the layer it masks: slide the content and the mask separately. Reveal by growing the mask's `width` from a fixed edge (`anchorX: 0`); exit by tweening `x` and `width` together.

Any sequence can carry an inline `mask` — itself a full sequence — that shapes which pixels of the maskee are visible. The mask runs in the same coordinate space as the maskee (added to the same parent composition) and shares its lifetime, so a circular avatar crop is just:

```ts
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  mask: {
    type: 'shape', shape: 'circle', radius: 130,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
  },
}
```

The mask is itself a sequence, so it can have `keyframes` of its own — useful for reveal animations (a circle growing from `scale: 0` to full size, a rect wiping across, …):

```ts
// Iris reveal — image is wiped in by a growing circle
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  mask: {
    type: 'shape', shape: 'circle', radius: 200,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff', scale: 0 },
    keyframes: [
      { at: 0, to: { scale: 1 }, duration: 1.0, ease: 'power2.out' },
    ],
  },
}
```

Notes:
- The mask sequence is rendered as a mask, not as a normal child — its `fillColor` / `strokeColor` only matter for which pixels are kept, not for the visible colour.
- Any sequence type works as a mask (shape / image / text / video / nested composition); shapes are the natural choice for geometric reveals.
- A plain **shape** mask (not inverted) is a hard-edged stencil, the cheapest way. Every other mask (a text, image or video layer, `maskInverted`, a named matte, a list) is drawn into a texture once per frame and applied as a **matte filter**: its edges are soft and antialiased, it costs one offscreen pass, and `blendMode` works with it (see [Mattes](#named-mattes-and-luma)).
- For a left-to-right wipe, give the mask `anchorX: 0` (rect/circle/ellipse) so `width: 0 → full` grows rightward from the left edge.

#### `maskInverted`

When `true`, flip the mask sense: pixels INSIDE the mask shape become transparent, pixels OUTSIDE stay visible. Useful for knockout / cutout effects (punch a circular hole through a panel, etc.). It works inside a masked group too: the hole is cut out of what the outer mask lets through, and nothing shows outside the outer mask.

```ts
// Photo with a circular hole punched through the middle
{
  type: 'image', asset: 'photo',
  initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
  maskInverted: true,
  mask: {
    type: 'shape', shape: 'circle', radius: 80,
    initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
    keyframes: [
      { at: 0, to: { radius: 120 }, duration: 1.5, ease: 'sine.inOut' },
      { at: 1.5, to: { radius: 80 }, duration: 1.5, ease: 'sine.inOut' },
    ],
  },
}
```

An inverted mask goes through the matte filter (the letters of a text mask, or a hole with a soft edge), so it works with every `blendMode` and with a mask that has its own `filters`. `maskInverted` is the same thing as `invert: true` on a named matte; with a named matte, write `invert: true` (below).

#### Named mattes and luma

A layer can be named and used as the mask of **several** layers (After Effects' track matte). Write its name as the `mask`; the matte layer itself is then **not drawn**. It is drawn once per frame into a texture, so three layers sharing one moving matte cost one extra pass, not three.

```ts
// one moving band cuts three layers; the band itself is not on screen
{ type: 'shape', shape: 'rect', name: 'wipe', anchorX: 0, width: 0, height: 420,
  initial: { x: 60, y: 300 }, keyframes: [{ at: 0.3, to: { width: 560 }, duration: 1.5 }] },
{ type: 'text', text: 'SHARED', mask: 'wipe' },
{ type: 'text', text: 'MASK', at: 0.2, mask: 'wipe' },
{ type: 'composition', width: 400, height: 300, mask: 'wipe', sequences: [ /* a whole picture, cut as one */ ] },

// by brightness instead of opacity (a grayscale image or a gradient layer), inverted, and a list
{ type: 'image', asset: 'photo', mask: { layer: 'vignette', channel: 'luma' } },
{ type: 'shape', shape: 'rect', width: 400, height: 300, mask: ['panel', { layer: 'hole', invert: true }] },  // inside `panel`, outside `hole`
```

| form | meaning |
|---|---|
| `mask: 'name'` | the same as `{ layer: 'name' }` |
| `mask: { layer, channel?, invert? }` | `channel: 'alpha'` (default: how opaque the matte is) or `'luma'` (how bright it is, Rec. 709); `invert: true` flips it (1 − matte) |
| `mask: [ref, ref, …]` | every one must let the pixel through: the result is the **product** (an intersection). **To subtract a matte, put `invert: true` on it** |
| `mask: { type: …, … }` | an inline mask layer, as above |

Rules:
1. **Outside the matte layer's own shape the matte is 0, for `luma` too** (nothing there is transparent and black), so a matte can be a wide gradient rectangle that you slide across the layers for a soft, moving reveal. **A layer that is used as a matte is not drawn.** It still needs to live long enough: the matte's time is the composition's time (its own `at` and `duration`). Where the matte is missing, the layers it cuts are **invisible**, so a matte whose lifetime does not cover its users warns.
2. **The name must be in the same composition** as the layer that uses it (a layer inside a nested composition cannot name a matte outside it). A layer that a transition wraps keeps its matte: the transition carries the `mask` to the wrapper.
3. A matte with a `parent` follows its parents (the null layers) as any layer does. A masked layer with a `parent` warns: the matte is in the composition's space, the layer in the null's space; put the mask on the null instead.
4. `threeD` layers cannot be mattes and cannot have one (a warning; the matte is drawn as the `threeD` layer it is, the mask is ignored).
5. **`blendMode` works with every matte**: the layer is cut by the matte and then blended (inside the matte it blends with the backdrop, outside it is the backdrop). A matte on a composition cuts the composition as one picture, as any filter does (its children's blends happen inside that picture).
6. A matte inside a **rotated or scaled nested composition** differs from the stencil only at the edges (soft instead of hard).
7. **Cost** (a prototype measurement at 1080p; not yet re-measured on the released code): WebGPU 0.32 ms for one layer, 0.75 ms for three, 2.65 ms for ten (0.67 ms and 1.97 ms when the layers share one matte); WebGL 1.22 / 4.03 / 11.0 ms. One matte is a texture of the composition's size (about 8 MiB at 1080p, more with anti-aliasing): **more than 8 mattes in one composition warns**. Share a matte between layers, or use fewer.
8. `inspect` does not list a matte layer (it is not drawn), and does not clip a masked layer's box by a named matte.

#### `blendMode`

How a layer blends with what is **behind it** (everything drawn below it in the stack): 18 modes, the CSS `mix-blend-mode` names (`add` and `linear-burn` are the two that CSS does not have; `linear-burn` is the After Effects / Photoshop name). Default `'normal'`. It works on every layer type, on `threeD` layers, and on a composition.

| mode | what it does |
|---|---|
| `normal` | the layer covers what is behind it |
| `add`, `screen` | brighten: overlapping glows, halos and light leaks add up instead of covering each other |
| `multiply` | darkens: shadows, vignettes, a tint over a photo |
| `overlay` | contrast: darks get darker, lights lighter, by what is behind |
| `soft-light` | a gentle `overlay`: colour casts, soft vignettes, a graded look |
| `hard-light` | `overlay` decided by the layer instead of the backdrop: strong punch |
| `color-dodge` | strong light: burns bright spots out toward white (light sources, lens flares) |
| `color-burn`, `linear-burn` | deep shadows and saturated darks |
| `darken`, `lighten` | keep the darker / the lighter of the two, channel by channel |
| `difference`, `exclusion` | the distance between the two colours (`exclusion` is softer): inversions, "film negative" looks |
| `hue`, `saturation`, `color`, `luminosity` | put only the hue, the saturation, the colour (hue + saturation) or the brightness of the layer onto the backdrop |

Rules:

1. **The order of layers decides what is blended.** Put the backdrop first (earlier in the array) and the blended layer after it.
2. **Names are CSS names, with the hyphen** (`soft-light`, not `softLight` / `soft_light`; a slip like that warns with the name you meant).
3. **Colours are mixed as the sRGB values you see** (as CSS does), not in linear light.
4. **`alpha` fades the blended result** (as CSS `opacity` does).
5. **On a composition the mode is inherited by its children, each blending with what is behind it** (not as one picture). To blend a composition as a whole, give it `threeD: true` (at `z: 0` with the default camera nothing else changes) or a filter.
6. **The 14 new modes are heavier** (each is a full-frame pass; about 1.5–2 ms a layer on WebGL at 1080p in the author's measurement, much less on WebGPU). 10 or more on screen at once warns (a composition with one counts each layer inside it, since its children blend one by one; one without counts the most that its own layers add at one time); a glow or a haze should be one layer (a gradient), not a pile.
7. **Together with `filters`, `threeD` and depth of field they all work** (the blend is applied after the layer's own filters, and after the depth-of-field blur).
8. **Some modes only act on some tones.** `overlay` and `soft-light` change almost nothing over a near-black or a near-white backdrop (their formulas leave 0 and 1 where they are), so a colour cast needs a **mid-tone** picture under it; `color-dodge` over a dark backdrop gives a saturated colour (each channel is lifted separately), over a bright one it burns out to white; `multiply` can only darken and `screen` / `add` only brighten.
9. **`blendMode` is a setting of the layer, not an animatable property** (`initial` or a keyframe with it warns). To change the mode for a moment, put a second, short-lived layer (`at` / `duration`) on top, or fade a layer's `alpha`.
10. **With `mask`:** every mask works with every mode: the layer is cut by the mask first, then blended. A plain shape mask (not inverted) is a stencil as before; a text, image or video mask, an inverted mask and a named matte go through the matte filter (see [Named mattes and luma](#named-mattes-and-luma)), and the blend is applied after it.

Checked against the W3C formulas on WebGPU and WebGL: every pixel within 2/255 (measured worst: 0.5/255 at alpha 1, 1.5/255 at alpha 0.5; over opaque backdrops and over nothing, as inside a `threeD` composition: a half-transparent layer over a half-transparent backdrop can differ more, because Pixi lays the blended result over the backdrop once more); on the same machine a frame is the same picture however it was reached. Another GPU can differ by a step or two.

```ts
// A soft white glow that brightens whatever it overlaps
{ type: 'shape', shape: 'circle', radius: 120, blendMode: 'add',
  fillGradient: { type: 'radial', stops: [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']] },
  initial: { x: 'W/2', y: 'H/2' } }

// A colour cast over everything below it: orange at the top, blue at the bottom
{ type: 'shape', shape: 'rect', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, blendMode: 'soft-light',
  fillGradient: { stops: [[0, '#ff9a3c'], [1, '#3c5bff']] } }

// A light leak: a strong source that burns out toward white where it meets the picture
{ type: 'shape', shape: 'circle', radius: 380, blendMode: 'color-dodge',
  fillGradient: { type: 'radial', stops: [[0, 'rgba(255,120,30,0.9)'], [1, 'rgba(255,120,30,0)']] },
  initial: { x: 1000, y: 160 } }
```

---

## Assets

Pass a flat list of named assets to `Movie.init({ assets })`. Sequences refer to them by `name`.

```ts
await movie.init({
  assets: [
    { name: 'logo',  src: '/img/logo.png' },
    { name: 'bgm',   src: '/audio/bgm.mp3' },
    { name: 'green', src: '/video/green.mp4' },
  ],
  composition: { /* sequences reference 'logo', 'bgm', 'green' */ },
});
```

Supported formats are whatever PixiJS Assets and the browser's audio/video decoders accept (typically PNG/JPG/WebP for images; MP3/AAC/Opus for audio; MP4/WebM for video).

---

## Keyframes

```ts
interface Keyframe {
  at?: number;       // start, in seconds from the start of THIS sequence; negative = back from the sequence's end (-0.5 = 0.5 s before it ends)
  duration?: number | 'auto'; // seconds (default 0 — instantaneous); 'auto' = the time a spring ease takes to settle
  ease?: string;     // GSAP easing name (default 'none'), or a spring: 'spring(mass, stiffness, damping)', 'spring.gentle|snappy|bouncy|wobbly|slow'
  set?:  Props;      // jump to these values at `at`
  to?:   Props;      // animate from current to these values over `duration`
  from?: Props;      // animate from these values to current
  // `from` + `to` together is a 'fromTo' tween
}
```

The four kinds are mutually exclusive per keyframe:

- **`set`** — instantaneous property assignment at `at`.
- **`to`** — tween from whatever the property is at `at` to the given values, over `duration`.
- **`from`** — tween from the given values back to the current property, over `duration`.
- **`from` + `to`** — full fromTo tween, with explicit start and end values.

### Time: `speed` and `time`

Video, audio-file and composition layers have a clock of their own. **`speed`** is a fixed multiplier on the layer (`1` as it is, `2` twice as fast, `0.5` slow motion, negative backward; it starts at |speed| × `duration`, so `speed: -1` plays the first `duration` seconds in reverse; with no `duration` a video or audio file lasts its length ÷ |speed|). **`time`** is the same clock as an ordinary animatable property, in seconds of the layer's own content (a file's position, a composition's local playhead), in `initial` and `keyframes`, with every keyframe word (`at`, `duration`, `ease`, `repeat`, `yoyo`, `from`, `to`, `set`):

```js
// a freeze (the same value twice), then a ramp
keyframes: [
  { at: 0,   from: { time: 0 }, to: { time: 2 }, duration: 1 },        // plays 2 s of the file in 1 s
  { at: 1,   to: { time: 2 },   duration: 0.5 },                       // holds
  { at: 1.5, to: { time: 6 },   duration: 3, ease: 'power2.inOut' },   // then accelerates
]
```

A negative `time` counts back from the end of the content (`initial: { time: -2 }`, two seconds before the end). `speed` is not animatable (animate `time`); `speed` and keyframed `time` together: `time` wins. **Inside a composition with its own time the children are in that composition's local seconds** (with `speed: 2` the content is twice as long as `duration`, so children default to that length; with `speed: 0.5` a child at `at: 3` of a 4 s composition is never reached, and warns). The composition's own `at`, `duration`, `x` / `alpha` keyframes are outer time. The sound follows (pitch too); a sound inside a composition goes silent while its clock stands still, and an `sfx` longer than the clock's reach is reported ("its composition's clock only reaches …"). The content is as long as the larger of `duration` and the farthest `time` the clock reaches; a child whose life ends exactly where a held `time` stands is hidden during the hold (give it a longer `duration`).

### Springs

The ease `'spring(mass, stiffness, damping)'` (defaults 1, 100, 10) or a preset (`spring.gentle`, `spring.snappy`, `spring.bouncy`, `spring.wobbly`, `spring.slow`) moves a value as a damped spring would: it overshoots its target and rings, then rests. `duration: 'auto'` gives the keyframe the time the spring needs to settle (within 0.5 %), so mass and stiffness are real physics; with a number, `duration` is that settle time and only the damping ratio `damping / (2 √(stiffness × mass))` shapes the motion (below 1 it overshoots, 1 or more it does not: `spring(1, 170, 26)` does not bounce, `spring(1, 170, 12)` does).

```ts
{ at: 0.2, from: { y: -200 }, to: { y: 0 }, duration: 'auto', ease: 'spring.bouncy' }
{ at: 0,   to: { scale: 1 },  duration: 0.8,    ease: 'spring(1, 170, 12)' }
```

| Preset | Settles in | Highest value (target = 1) |
|---|---|---|
| `spring.snappy` | 0.42 s | 1.01 |
| `spring.gentle` | 0.72 s | 1.02 |
| `spring.bouncy` | 1.08 s | 1.28 |
| `spring.slow` | 1.29 s | 1.00 (no overshoot) |
| `spring.wobbly` | 1.61 s | 1.40 |

A colour is clamped in its colour space when it overshoots, and `alpha` past 1 is not visible. `'auto'` is for keyframes: `animateText` / `orbit` tweens take a spring name but a number `duration`. A malformed spring (`spring(1, 170`, `spring.floppy`) is reported once, with what is wrong.

### Repeating

`repeat` (extra plays, a finite whole number), `yoyo` (every other play runs backwards) and `repeatDelay` (seconds between plays) work on every kind of animation — position, alpha, colour, shape geometry, filters, text `fill`/`value`:

```ts
{ at: 0, to: { scale: 1.15 }, duration: 0.5, ease: 'sine.inOut', repeat: 5, yoyo: true }   // a heartbeat: 6 plays, 6 s total
```

Total time = `duration × (repeat + 1)` (+ delays). Endless repeats are not allowed (the timeline needs a fixed length); `repeat: -1` / `Infinity` is ignored with a warning — repeat as many times as the layer lasts.

### Negative `at`

If `at < 0`, it's interpreted as `duration + at` — measured back from the end of **the sequence the keyframe belongs to**. Useful for fade-outs:

```ts
{ type: 'text', text: 'bye', at: 2, duration: 3,
  keyframes: [{ at: -0.5, to: { alpha: 0 }, duration: 0.5 }] }   // fades during the last 500 ms of this text (global 4.5 s – 5 s)
```

### Easing

`'cubic-bezier(x1, y1, x2, y2)'` is the CSS curve exactly (x1 and x2 between 0 and 1, y1 and y2 may overshoot): `'cubic-bezier(.4, 0, .2, 1)'` is a gentle in-out, `'cubic-bezier(.2, .8, .2, 1)'` is front-loaded, not slow motion (half of the change in the first 13 % of the time, 99 % by 74 %, then a long settle). GSAP's `power2` is a cubic: `power2.in` has done only 12.5 % at half time. A malformed one warns once and runs as `'none'`.

Standard GSAP easing strings: `'none'`, `'linear'`, `'power1.in'` ... `'power4.inOut'`, `'sine.in/out/inOut'`, `'expo.in/out/inOut'`, `'circ.in/out/inOut'`, `'back.in/out/inOut(overshoot)'`, `'elastic.in/out/inOut(amplitude, period)'`, `'bounce.in/out/inOut'`. See [GSAP easing docs](https://gsap.com/docs/v3/Eases/).

### PIXI shorthands

These keys are auto-routed through GSAP's PixiPlugin when used in `initial` / `set` / `to` / `from` / `keyframes`:

```
scale, scaleX, scaleY
anchor, anchorX, anchorY
pivot, pivotX, pivotY
skew, skewX, skewY
position, positionX, positionY
tilePosition, tilePositionX, tilePositionY
tileScale, tileScaleX, tileScaleY
tint, autoAlpha
colorize, colorizeAmount, colorMatrixFilter
blur, blurX, blurY, blurPadding
lineColor, lineAlpha, fillColor, fillAlpha
```

(In addition to plain DisplayObject props like `x`, `y`, `rotation`, `alpha`, `width`, `height`, `visible`.) **Angles are in degrees**: `rotation`, `skew` / `skewX` / `skewY` (PixiPlugin converts them), and `rotationX` / `rotationY` for 3D layers.

### Filter keyframe paths

Animate a named filter's parameter using a dot-path key:

```ts
import { BlurFilter } from 'pixi.js';

{
  type: 'video',
  asset: 'green',
  filters: [
    { name: 'k', type: 'chromaKey', keyColor: '#00ff00' },
    { name: 'b', type: 'custom', filter: new BlurFilter({ strength: 0 }) },
  ],
  keyframes: [
    { at: 2, to: { 'filters.b.strength': 8 }, duration: 1 },
    { at: 4, to: { 'filters.k.threshold': 0.5 }, duration: 1 },
  ],
}
```

The path is `filters.<filter-name>.<animatable-param>`. A filter must have a `name` to be addressable.

---

## Expressions

Any string `Props` value may be an arithmetic expression. Strings whose first character is a letter or digit are tried as expressions; verbatim strings (color hex, font names, etc.) are passed through when used in fields that don't expect a number.

The expression parser is in-tree (no eval, CSP-safe). See [`src/expr/Parser.ts`](../src/expr/Parser.ts).

### Operators and functions

| Form                    | Notes                                                |
| ----------------------- | ---------------------------------------------------- |
| `+ - * /`               | binary arithmetic                                    |
| `-x`, `+x`              | unary                                                |
| `( ... )`               | parens                                               |
| `1`, `1.5`, `.25`       | decimals                                             |
| `min(a, b)`, `max(a, b)`| variadic                                             |
| `abs(x)`                |                                                      |
| `floor(x)`, `ceil(x)`, `round(x)` |                                            |
| `sqrt(x)`               |                                                      |
| `pow(a, b)`             | power                                                |
| `sin(x)`, `cos(x)`, `tan(x)` | radians                                         |
| `lerp(a, b, t)`         | `a + (b - a) * t`                                    |
| `clamp(x, lo, hi)`      |                                                      |
| `smoothstep(a, b, x)`   | 0 below `a`, 1 above `b`, smooth in between          |
| `mod(a, b)`             | never negative (`mod(-1, 3)` is 2)                   |
| `step(edge, x)`         | 0 below `edge`, 1 from `edge` on: the way to write an "if" |
| `rand(seed)`            | a number in 0…1; the same seed always gives the same number |
| `noise(x, seed)`        | smooth noise in −1…1, continuous in `x`; `seed` is optional |
| `PI`                    | a constant                                           |

No comparison, conditional, bitwise, or string operators — keep it numeric (`step()` and `clamp()` cover most "if"s).

**Randomness is seeded.** `rand(seed)` and `noise(x, seed)` depend only on their arguments, so playback, seeking and export agree; never use `Math.random()` for anything that ends up in the picture. Expressions are still evaluated once, when the layer is built, so give each layer its own seed (in a JS loop: `x: `W/2 + rand(${i}) * 200``). For randomness in plain JS use `random(seed)` (`const r = random(7); r(); r()`), exported by the library. For a shake that changes over time use [`wiggle()`](#wiggle).

### Scope variables

Each sequence has its own scope, computed at build time:

| Name      | Meaning                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `w`       | sequence intrinsic width (e.g. video natural width). 0 if not applicable.             |
| `h`       | sequence intrinsic height.                                                            |
| `W`       | parent composition width (or root if no parent).                                      |
| `H`       | parent composition height.                                                            |
| `GW`      | global (root) composition width.                                                      |
| `GH`      | global (root) composition height.                                                     |
| `contain` | scale factor that makes the sequence fit inside the parent (preserve aspect, no crop) |
| `cover`   | scale factor that makes the sequence cover the parent (preserve aspect, may crop)     |
| `t`       | sequence start time (the `at` after negative-`at` resolution), seconds                |
| `d`       | sequence duration, seconds                                                            |
| `T`       | parent (or root) duration, seconds                                                    |

### Examples

```ts
// Center an image
initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' }

// Fit a video without cropping
initial: { x: 0, y: 0, scale: 'contain' }

// Fill a video, may crop
initial: { x: 0, y: 0, scale: 'cover' }

// Responsive font size
style: { fontSize: 'min(GW, GH) * 0.06' }

// Subtitle 4% above bottom
initial: { x: 'GW/2', y: 'GH * 0.96', anchorX: 0.5, anchorY: 1 }
```

---

## Stops (presentations)

`composition.stops` says where a presentation pauses: seconds, or `{ at, page?, notes?, advance?, pdf? }` (see [Presentations in the API reference](api.md#presentations-stops-next-prev-presenter)). A stop with `page` begins a page (a name, or `true`), the others are steps of it; with no `page` anywhere each stop is a page. `movie.play()` ignores them; the `Controller` shows marks on the seek bar and its play button plays to the next stop (`pauseAtStops: false` plays through), and `movie.next()` and `Presenter` pause on them. **`pdf: true` / `pdf: false`** on a stop chooses which moment stands for a page in a PDF: `true` = this stop is the page's picture, `false` = never use it (default: the page's last stop). Use it when the last stop is mid-exit. [`deck()`](#deck) builds the whole thing from pages.

## Transitions

A composition can declare scene-to-scene `transitions` that compress paired keyframes into a single line and add visual effects (mask wipes, iris reveals) that aren't expressible at the keyframe level.

```ts
{
  sequences: [
    { type: 'video', name: 'A', asset: 'a', at: 0, duration: 5 },
    { type: 'video', name: 'B', asset: 'b', at: 4, duration: 5 },
  ],
  transitions: [
    { kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' },
  ],
}
```

Common fields (`TransitionCommon`):

| Field      | Type    | Notes                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------- |
| `from`     | string  | sibling sequence's `name`. Must exist in the same composition.                         |
| `to`       | string  | sibling sequence's `name`. Must be declared **after** `from` in `sequences[]`.         |
| `at`       | number  | start of the transition, in the **parent composition's** time (like a sequence's `at`, not sequence-local); negative = back from the parent's end. |
| `duration` | number  | seconds, must be > 0.                                                                  |
| `ease`     | string? | GSAP easing name. Default `'none'` (linear).                                           |

Validation runs at composition build time. Errors throw with the offending `transitions[<index>]` quoted in the message: missing names, `to` before `from`, transition window outside either sequence's lifespan, duplicate use of one sequence as `from`, `from === to`, `duration <= 0`.

### `crossfade`

Alpha cross-dissolve. `from` fades to `alpha: 0`, `to` starts at `alpha: 0` and fades to `1`, both over `[at, at + duration]`.

```ts
{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }
```

If `to` already has an explicit `initial.alpha` (other than 0), the expander throws — remove the manual setting.

### `wipe`

A directional reveal. `to` is masked by a soft edge that travels across the screen.

```ts
{
  kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down',
  smoothing: 0.04,    // 0..1 edge softness (default 0.02)
}
```

`direction` is the direction the wipe edge travels — `'left'` means the edge moves leftward across the canvas, exposing B starting from the right side. Mirror that for `'right'` / `'up'` / `'down'`.

### `iris`

A circular reveal centered on the canvas.

```ts
{
  kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1,
  mode: 'in',         // default — B opens up from a point. 'out' = A closes down to a point.
  smoothing: 0.03,    // 0..1 edge softness (default 0.02)
}
```

`mode: 'in'` (default): B emerges from the center and grows outward.
`mode: 'out'`: A disappears from the outside in, exposing B.

### `slide`

Both sequences slide together; the new scene comes in from the opposite side.

```ts
{
  kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1,
  direction: 'left' | 'right' | 'up' | 'down',
}
```

`direction` is the direction of motion. `'left'` means A slides off to the left and B enters from the right.

The slide macro reads each sequence's existing `initial.x` / `initial.y` (if any) and treats it as the natural resting position. `B` is shifted off-screen by ±W or ±H from that position and slides back to it; `A` slides from its position to off-screen on the opposite side. So a centered text with `initial: { x: 'GW/2', anchorX: 0.5 }` ends the slide centered, not at `x: 0`.

If you've manually keyframed `x` / `y` on `A` or `B`, the slide expansion appends new keyframes alongside — your existing motion is not overwritten. Behavior with conflicting motion is the user's responsibility.

### `dip`

"Dip through": A fades out across the first half of the window and B fades in across the second half. The visible color during the dip is whatever sits behind A and B — set `Movie.background` (or place a persistent layer beneath them) for dip-to-black / dip-to-white / dip-to-color.

```ts
{ kind: 'dip', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }
```

If `to` already has a non-zero `initial.alpha`, the expander throws — remove the manual setting.

### `zoom`

A scaled punch-in / punch-out. By default `B` opens up: it starts large and zooms back to scale 1 while fading in; `A` simply fades. With `mode: 'out'` it's the opposite — `A` zooms outward as it fades, and `B` fades in at scale 1.

```ts
{
  kind: 'zoom', from: 'A', to: 'B', at: 4, duration: 1,
  mode: 'in',          // default — B opens up. 'out' = A closes outward.
  fromScale: 4,        // starting scale of the zoomed sequence (default 4)
  ease: 'power2.out',
}
```

### `dissolve`

Pixel-grain noise reveal driven by deterministic 2D Perlin noise. Pixels with a low noise value reveal first; as `uProgress` advances, more pixels reveal. The same `seed` always produces the same dissolve pattern, so a render is bit-exact reproducible.

```ts
{
  kind: 'dissolve', from: 'A', to: 'B', at: 4, duration: 1,
  scale: 30,         // pattern frequency (higher = finer grain). Default 30.
  seed: 0,           // pattern offset. Different seeds → different reveal patterns.
  smoothing: 0.05,   // edge softness within each chunk. Default 0.05.
}
```

### `luma`

A wipe that follows a **brightness map** (After Effects' Gradient Wipe): the dark parts of the map change first, the light parts last. `to` appears through a soft edge; `from` holds until `to` has covered it (a hard cutoff, as `wipe` and `iris` do).

```ts
{
  kind: 'luma', from: 'A', to: 'B', at: 4, duration: 1,
  map: 'radial',     // 'linear' (left to right, default), 'diagonal', 'radial' (from the middle, a circle on screen),
                     // or the name of a grayscale image asset (dark parts change first)
  softness: 0.1,     // width of the soft band, in brightness units (0..1). Default 0.1.
  flip: false,       // true = reverse the map (light parts first)
}
```

The three built-in maps need no image (they are computed on the GPU from the position on screen). A `map` name that is neither a built-in nor a loaded asset warns once (with the likely name) and wipes as if the map were white. The map covers the whole composition, so give it the composition's aspect ratio.

---

## Filters

> **`filterArea`** (on any layer) is a rectangle in the layer's **own** coordinates — origin = its local origin, e.g. a circle's centre — that widens the area a filter may draw into. Without it a blur or glow is clipped to the layer's bounding box: `filterArea: { x: -(r + 260), y: -(r + 260), width: 2 * (r + 260), height: 2 * (r + 260) }` for a circle of radius `r` blurred by up to 260 px. `threeD` layers add the filters' padding automatically.

Filters are named, ordered, and per-sequence. Animate parameters via `'filters.<name>.<param>'` keyframe paths.

### `chromaKey`

Removes a key color from the source. Works on video, image, or composition layers.

```ts
{
  name: 'k',
  type: 'chromaKey',
  keyColor?: string | [number, number, number],  // hex '#00ff00' or RGB 0..1; default green
  threshold?: number,        // default 0.4 — distance from key color counted as transparent
  smoothing?: number,        // default 0.1 — softness of the cutoff edge
  spill?: number,            // default 0.2 — green-tint suppression
}
```

Animatable: `threshold`, `smoothing`, `spill`. `keyColor` is set at build time.

### Named filters (`{ type: 'glow', … }`)

A filter by name, as plain data. `type` is the filter's class name without `Filter`, in camelCase (case does not matter), and every other key is that filter's own option. No import, and the layer stays JSON:

```ts
{ type: 'text', text: 'NEON', style: { fontSize: 140, fill: '#fff' }, initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
  filters: [{ type: 'glow', name: 'halo', outerStrength: 0, color: '#ff4d9d', distance: 20 }],
  keyframes: [{ at: 0, to: { 'filters.halo.outerStrength': 6 }, duration: 1 }] }       // animate any scalar option by name
```

Name a filter (`name: 'halo'`) to animate it with `'filters.halo.<option>'`. `blur`, `noise`, `alpha`, `colorMatrix` and `grain` need no extra package (`grain` is this library's own). All the others come from the **`pixi-filters`** package, which is loaded the first time a layer uses one (add `"pixi-filters": "https://esm.sh/pixi-filters@6.1.5?external=pixi.js"` to the import map, or `npm i pixi-filters`; `ai/template.html` already has it). A misspelt type says what you probably meant. Rendering and exporting were verified in a real browser for 40 of them (`examples/_checks/named-filters.html` and `named-filters-2.html`); `colorMap` and `simpleLightmap` need a texture, which JSON cannot hold, so use `custom` for those two:

| `type` | Options (the useful ones) | What it does |
|---|---|---|
| `blur` | `strength`, `quality` | Gaussian blur (pixi.js) |
| `noise` | `noise` (0–1), `seed` | Uniform noise (pixi.js): one frozen pattern (the seed is random unless you give it), the same strength at every tone, it lifts blacks. For film grain use `grain` |
| `grain` | `amount` (0.08: the standard deviation at mid-grey, of full scale), `size` (px, 1.5), `seed` (0), `fps` (24: new grain this many times a second, 0 = still), `color` (0 = luminance only, 1 = per channel) | Film grain: seeded, new every 1/`fps` s, weighted to the mid-tones (it fades out toward black and white: blacks are not lifted, the mean brightness does not move), an integer hash so every GPU draws the same grain pattern (the 8-bit values agree to within 1/255). The grain is anchored to the filter's own frame: on a layer it moves with the layer, on the root it is fixed to the picture. On a layer or on the root `composition.filters`. A static pattern is `fps: 0`. Keyframe it by name: `'filters.g.amount'`. Grain eats video bitrate (see the guide) |
| `alpha` | `alpha` | Whole-layer opacity (pixi.js) |
| `colorMatrix` | `preset`: `'sepia' 'grayscale' 'negative' 'polaroid' 'technicolor' 'vintage' 'kodachrome' 'browni'`, or `matrix` (20 numbers) | Colour grade (pixi.js) |
| `adjustment` | `gamma contrast saturation brightness red green blue alpha` (1 = unchanged) | Colour grading |
| `hslAdjustment` | `hue` (degrees) `saturation lightness colorize alpha` | Hue shift |
| `grayscale` | – | Black and white |
| `glow` | `distance outerStrength innerStrength color alpha quality knockout` | Glow around the shape |
| `dropShadow` | `offset: { x, y }` `blur alpha color shadowOnly` | Shadow |
| `outline` | `thickness color alpha quality knockout` | Stroke around the shape |
| `pixelate` | `size` (a number, or `[w, h]`); animate `sizeX` / `sizeY` | Mosaic |
| `crt` | `curvature lineWidth lineContrast noise vignetting vignettingAlpha time` | Old monitor |
| `rgbSplit` | `red green blue` (each `{ x, y }` offset) | Chromatic aberration |
| `oldFilm` | `sepia noise scratch scratchDensity vignetting seed` | Aged film |
| `glitch` | `slices offset direction seed average` | Digital glitch |
| `warp` | `kind: 'wave' \| 'haze'`, `strength` (max shift, px, 6), `scale` (wavelength or cell size, px, 80), `speed` (0.5), `angle` (degrees: the way a wave travels, 0), `seed` (`haze`) | Bends the picture: a travelling wave (flags, water) or drifting noise (heat haze). This library's own, time-driven |
| `bulgePinch` | `center radius strength` | Bulge (+) / pinch (−) |
| `twist` | `radius angle offset: { x, y }` | Swirl |
| `zoomBlur` | `strength center innerRadius radius` | Radial zoom streaks |
| `kawaseBlur` | `strength quality` | Cheap, wide blur |
| `radialBlur` / `motionBlur` | `angle center radius` / `velocity kernelSize` | Spin / directional blur |
| `emboss` | `strength` | Relief |
| `ascii` | `size color replaceColor` | Text-art |
| `colorOverlay` | `color alpha` | Tint over everything |
| `advancedBloom` / `bloom` | `threshold bloomScale brightness blur` | Bloom |
| `bevel` | `thickness rotation lightColor lightAlpha shadowColor shadowAlpha` | Raised edge |
| `dot` / `crossHatch` | `scale angle grayscale` / – | Halftone / hatching |
| `godray` | `angle gain lacunarity alpha parallel time` | Light shafts (animate `time`) |
| `reflection` | `mirror boundary amplitude waveLength alpha time` (ranges are `[start, end]`) | Water reflection |
| `simplexNoise` | `strength scale offset` | Cloudy noise over the layer |
| `colorGradient` | `gradientType: 'linear' 'radial' 'conic'` (the filter's own option is `type`, which the DSL uses), `stops: [{ offset, color, alpha }]`, `angle` | A gradient laid over the layer |
| `colorReplace` / `multiColorReplace` | `originalColor targetColor tolerance` / `replacements: [[from, to], …] tolerance` | Swap colours |
| `convolution` | `matrix` (9 numbers), `width height` | Sharpen, edge detect |
| `tiltShift` / `tiltShiftAxis` | `blur gradientBlur start end` (canvas pixels) | Miniature blur |
| `shockwave` | `center amplitude wavelength brightness speed radius time` (animate `time` 0 → 1) | A ripple from a point |
| `backdropBlur` | `strength` | Blurs what is BEHIND the layer, so alone it shows nothing |
| the rest of pixi-filters (`colorMap`, `simpleLightmap`) | need a texture: `{ type: 'custom' }` | see the [pixi-filters docs](https://pixijs.io/filters/docs/) |

Gotchas, all measured:

- **Distortion:** `warp` (`wave`: a flag or the surface of water, `haze`: heat shimmer; moves with the frame's time, no keyframes needed, and pads the layer by `strength` so a shifted edge is not cut), `twist` (a swirl), `bulgePinch` (a lens), `shockwave` (a ring that spreads), `rgbSplit` (colour fringes), `glitch` (slices). `warp`'s time is the time of the frame (inside a time-remapped composition, that composition's clock), `speed: 0` stands still, `strength` is in px and is capped at 200. It bends the layer's picture; to draw something that does not exist yet, use a `shader` layer.
- **Centres and offsets are in canvas pixels, not the layer's:** `twist.offset`, `bulgePinch.center`, `zoomBlur.center`, `radialBlur.center`, `shockwave.center` default to the canvas's top-left corner, so a layer in the middle looks unaffected. Put the centre on the layer: `{ type: 'twist', offset: { x: 640, y: 360 } }` for a layer centred on a 1280×720 canvas.
- **A filter works inside the layer's bounds.** Glow, dropShadow, outline and blur draw outside it and are clipped unless you widen the area (`filterArea: { x: -24, y: -24, width: w + 48, height: h + 48 }`, in the layer's own coordinates). Do not widen it for `grayscale`, `oldFilm` or other filters that paint the whole area: they fill the extra margin with black.
- **Animate scalars by name** (`'filters.halo.outerStrength'`). Options that are points (`rgbSplit.red`, `dropShadow.offset`) do not tween as a whole; animate `'filters.<name>.red.x'` if the filter exposes it, or swap the filter. `pixelate` animates through `sizeX` / `sizeY`, not `size`.
- `shockwave` and `godray` are driven by `time` (a still frame at `time: 0` looks like nothing): animate it. `radialBlur`, `shockwave` and `tiltShift` positions are canvas pixels too.
- Some filters take their value as one argument; the DSL hides that (`{ type: 'pixelate', size: 8 }`, `{ type: 'emboss', strength: 6 }`).

### `custom`

Escape hatch for any PIXI `Filter` instance — including PIXI's own built-ins (`BlurFilter`, `ColorMatrixFilter`, `NoiseFilter`, etc.), [pixi-filters](https://github.com/pixijs/filters), community packages, or your own `Filter` subclass. The instance is used as-is; animation works the same way as for `chromaKey` as long as the filter has writable scalar properties at the addressed paths.

```ts
import { BlurFilter } from 'pixi.js';
import { GlowFilter, OldFilmFilter } from 'pixi-filters';

{
  type: 'image',
  asset: 'photo',
  filters: [
    { type: 'custom', name: 'b',    filter: new BlurFilter({ strength: 0 }) },
    { type: 'custom', name: 'glow', filter: new GlowFilter({ outerStrength: 1, color: 0xffaa00 }) },
    { type: 'custom', name: 'film', filter: new OldFilmFilter() },
  ],
  keyframes: [
    { at: 1,    to: { 'filters.b.strength': 8 },          duration: 0.5 },
    { at: 2,    to: { 'filters.glow.outerStrength': 4 },  duration: 1 },
    { at: -0.5, to: { 'filters.film.noise': 0 },          duration: 0.5 },
  ],
}
```

Notes:

- `filter` must be a `Filter` instance (constructor must have run on the consumer side).
- Animation paths use scalar property setters. Filters whose properties are PointData (e.g. `pixi-filters` `RGBSplitFilter` exposes `red: { x, y }`) currently don't propagate the change to the GPU uniform when only `.x` is mutated — replace the whole point in an `onUpdate` callback or use a scalar-API filter instead.
- Without a `name`, the filter still applies but cannot be addressed via `filters.<name>.<prop>` keyframe paths.

Notes:

- `filter` must be a PIXI `Filter` instance (constructor must have run on the consumer side). Plain object literals throw.
- Use `custom` for a filter that has no name above (a community filter, or your own `Filter`). For everything in pixi.js and `pixi-filters`, prefer the named form.
- Without a `name`, the filter still applies but cannot be addressed via `filters.<name>.<prop>` keyframe paths.

---

## Presets

Presets are pure helpers that return a ready-to-use `SequenceSpec`. They expand into the existing keyframe / initial primitives — no engine surgery — so anything you can do with a preset you can also write by hand.

### `kenBurns`

Per-image motion preset for slideshows. Returns an `ImageSequenceSpec`; drop the result straight into `sequences[]`. Pair with `crossfade` / `dip` etc. transitions for the cuts between images — `kenBurns` itself emits no fade.

```ts
import { kenBurns } from 'pixi-effects';

sequences: [
  kenBurns({ asset: 'photo1', name: 'p1', at: 0,  duration: 6, motion: 'scale',    origin: [0.25, 0.25], zoom: 1.2 }),
  kenBurns({ asset: 'photo2', name: 'p2', at: 5,  duration: 6, motion: 'rotation', angle: 6 }),
  kenBurns({ asset: 'photo3', name: 'p3', at: 10, duration: 6, motion: 'position', from: [0, 0], to: [1, 1] }),
  kenBurns({ asset: 'photo4', name: 'p4', at: 15, duration: 6, motion: 'still' }),
],
```

The image is centred on the canvas; `fit` (default `'cover'`) controls how the texture is scaled to fill. The fitted scale is computed at runtime from the texture's intrinsic size, so you don't pass `imageWidth` / `imageHeight`.

#### Common fields

| Field      | Type                  | Notes                                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------------------ |
| `asset`    | string                | image asset name (registered via `Movie.init({ assets })`)                           |
| `duration` | number                | seconds of animation (required)                                                      |
| `name?`    | string                | sequence name so transitions can reference it                                        |
| `at?`      | number                | start time, parent-relative seconds                                                  |
| `fit?`     | `'cover'` \| `'contain'` | how the texture fills the canvas. Default `'cover'`.                              |
| `ease?`    | string                | GSAP easing name. Default `'sine.inOut'`.                                            |

#### `motion: 'still'`

Image sits at the canvas centre, fitted but unanimated. Useful as a stable "rest" in between motion-heavy frames.

#### `motion: 'scale'`

Zoom in or out around an arbitrary 9-point pivot.

| Field        | Type                       | Notes                                                                                       |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------- |
| `origin?`    | `[number, number]`         | pivot in [0..1] image coords. Default `[0.5, 0.5]` (centre). The original convention uses the 9-point grid `0.25 / 0.5 / 0.75`. |
| `zoom?`      | number                     | zoom factor relative to the fitted base. Default `1.15`.                                    |
| `direction?` | `'in'` \| `'out'`          | `'in'`: 1 → zoom (default). `'out'`: zoom → 1.                                              |

The pivot point stays pinned at its world position; the rest of the image grows / shrinks around it. This is the "focal-point" zoom you want for ken-burns slideshows — the eye anchors on the pivot while the surrounding pixels move.

#### `motion: 'rotation'`

Gentle rotation while keeping the image filling the canvas.

| Field        | Type                                | Notes                                                                                       |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `angle?`     | number                              | total rotation in degrees. Default `8`. Capped at 30.                                       |
| `direction?` | `'cw'` \| `'ccw'` \| `'through'`    | `'cw'` (default) = 0 → +angle. `'ccw'` = 0 → −angle. `'through'` = −angle/2 → +angle/2.     |

The scale is over-set so the rotated bounding box still covers the canvas — no background gaps as the image tilts.

#### `motion: 'position'`

Pan the image between two points within its over-scaled bounds.

| Field   | Type                | Notes                                                                                  |
| ------- | ------------------- | -------------------------------------------------------------------------------------- |
| `from?` | `[number, number]`  | start position in [0..1] of the over-scaled bounds. Default `[0.25, 0.25]`.            |
| `to?`   | `[number, number]`  | end position. Default `[0.75, 0.75]`.                                                  |
| `zoom?` | number              | over-scale factor (must be > 1 for any pan to be visible). Default `1.15`.             |

`[0, 0]` looks at the top-left of the image; `[1, 1]` looks at the bottom-right. The default pans diagonally across the upper-left and lower-right quarters of the over-scaled image (matches the Yajima-Motion preset).

### `orbit`

A camera that circles a point. There is no per-frame expression in the DSL, so the circle is sampled into short linear keyframes (one per 0.1 s; the easing is applied to the angle). Returns a `camera` layer for `sequences[]`.

```ts
import { orbit } from 'pixi-effects';

sequences: [
  orbit({ duration: 6, degrees: 40 }),                                   // ±20° around the centre of a 1280×720 canvas
  // …threeD layers…
]
```

| Option | Notes |
|---|---|
| `duration`, `degrees` | required. `degrees` is the total sweep (negative = the other way) |
| `start` | start angle in degrees; default `-degrees / 2` (0 = straight in front of the centre) |
| `radius` | distance from the centre; default = the default camera distance for `height` and `fov`, so `z = 0` is 1:1 at angle 0 |
| `center` | `[x, y]` to circle and look at; default the canvas centre |
| `width`, `height` | canvas size for the defaults (1280 × 720) |
| `fov`, `ease`, `at`, `name`, `stepsPerSecond` | `ease` default `'sine.inOut'` |

`z` is specified, so it stops following `fov`; for an orbit **plus** a dolly zoom write your own `fov` and `z = (H/2) / tan(fov/2)` keyframes.

### `wiggle`

A seeded shake as keyframes (an expression cannot change over time, so it is baked into ordinary keyframes): drift, hand-held camera, a flickering light.

```ts
import { wiggle } from 'pixi-effects';

{ type: 'text', text: 'hi', at: 0, duration: 6, initial: { x: 'GW/2', y: 'GH/2' },
  keyframes: [
    ...wiggle({ duration: 6, freq: 4, seed: 3, props: { x: { around: 'GW/2', amp: 6 }, rotation: { around: 0, amp: 1.5 } } }),
  ] }
```

| Option | Type | Notes |
| ------ | ---- | ----- |
| `duration` | number | seconds; required |
| `props` | `{ [prop]: { around, amp } }` | each property moves on its own (x and y are not in lockstep). `around` is the resting value: a number or an expression; the shake starts and ends there. `amp` is how far it strays. Any animatable name works (`rotation`, `scale`, `alpha`, `'filters.blur.blur'`). |
| `at` | number | start, seconds from the start of the layer (default 0) |
| `freq` | number | new random targets per second (default 3 drifts; 8 and up shakes) |
| `seed` | number | another seed is another take (default 0) |
| `ease` | string | between targets (default `'sine.inOut'`; `'none'` gives jittery straight lines) |

It returns `Keyframe[]`: spread it into `keyframes`, next to others. Do not put another keyframe on the same property during the wiggle.

### `particles`

Particles as plain layers: a burst, a fountain, snow, confetti, sparks. Each particle is a layer with its own **seeded** start, launch angle and speed, size, colour and life, and a path baked into keyframes, so playback, seeking and export agree; it exists only while it is alive. Spread the result into `sequences`.

```ts
import { particles } from 'pixi-effects';

...particles({ count: 240, at: 2, life: [1.2, 2], area: { x: 640, y: 330 }, speed: [40, 520], gravity: 220, drag: 1.1,
               size: [4, 8], scale: [1, 0.3], colors: ['#ffd166', '#ff6b9d', '#4cc9f0'], fade: { out: 0.7 }, blendMode: 'add' })   // a burst of sparks
```

| Option | Notes |
| ------ | ----- |
| `count`, `life` | required: how many, and how long each lives (a number or `[min, max]` seconds) |
| `area` | required: `{ x, y }` is the centre they start from; add `width` / `height` to spread over a box (snow: `{ x: 640, y: -20, width: 1400 }`) |
| `at`, `emit` | the first birth, and the seconds over which births are spread (`0`, the default, is a burst) |
| `angle`, `speed` | launch direction (degrees: 0 right, 90 down, −90 up; default `[0, 360]`) and speed (px/s; default `[100, 300]`) |
| `gravity`, `wind`, `drag` | accelerations (px/s², down and sideways) and air drag per second |
| `sway` | `{ amp, freq }`: a smooth side-to-side wobble (snow, leaves, embers) |
| `size`, `scale`, `fade` | radius (default `[3, 6]`), scale over the life (`[1, 0]` shrinks away), alpha ramps `{ in, out }` in seconds |
| `colors`, `shape` | fill colours picked per particle; `'circle'` (default), `'rect'` (square) or `'star'` |
| `spin` | degrees per second (they also start at a random angle) |
| `blendMode` | `'add'` makes overlaps glow |
| `template` | any layer (an image, a text) used for every particle instead of a shape; its keyframes are kept |
| `seed`, `name` | another seed is another burst; layers are named `<name>-0`, `<name>-1`, … |
| `sampleRate` | samples per second of a curved path (default 20); a path with no gravity, wind, drag or sway is one straight tween |

It throws, with the fix, when it would bake an absurd number of keyframes: lower `count`, `life` or `sampleRate`. Particles are real layers (names like `burst1-0`), so `inspect` and the timeline list them, grouped as one family.

### `cameraPath`

A camera flight as keyframes for `x`, `y`, `z`, `lookAtX`, `lookAtY` and `lookAtZ`: a route through `[x, y, z]` points, walked by arc length (an even speed whatever the curve) and sampled once per frame.

```ts
import { cameraPath, wiggle } from 'pixi-effects';

{ type: 'camera', keyframes: [
  ...cameraPath({ points: [[640, 360, 2200], [690, 330, 900], [640, 360, -3000]], duration: 7, ease: 'power2.in', frameRate: 30 }),
  ...wiggle({ duration: 7, freq: 9, props: { offsetX: { around: 0, amp: 5 }, offsetY: { around: 0, amp: 3 } } }),      // a handheld shake on the offsets
] }
```

| Option | Notes |
| ------ | ----- |
| `points` | `[[x, y, z], …]`, at least two, the route in order |
| `duration` | seconds; required |
| `at` | start, seconds from the start of the camera layer (default 0) |
| `ease` | GSAP ease for the progress along the route (default `'none'`: constant speed; `'power2.in'` an accelerating rush) |
| `look` | `'ahead'` (default: face where it flies) or a fixed `[x, y, z]` |
| `lookAhead` | with `'ahead'`: how far ahead, as a fraction 0–1 of the route (default 0.08); past the end it continues along the last direction |
| `smooth` | `true` (default): a smooth curve through the points (Catmull-Rom); `false`: straight lines |
| `from` / `to` | fractions 0–1 of the route to start and stop at (default 0 → 1; `from: 1, to: 0` flies it backwards) |
| `frameRate` | samples per second: your movie's `frameRate` (default 30) |

Layers the camera passes take `hideBehindCamera: true`. The recipe `camera-fly-through` in `ai/reference/recipes.md` is a whole corridor.

### `followPath`

A layer travelling along an SVG path, as keyframes for `x` and `y` (and `rotation`). The layer's own `x` / `y` are the points of the path (give shapes their centre there, and text `anchorX: 0.5, anchorY: 0.5`). The path is walked by arc length, so the speed is even whatever the curve, and sampled once per frame as short straight steps: set `frameRate` to the movie's and the layer is exactly on the path at every frame.

```ts
import { followPath } from 'pixi-effects';

{ type: 'shape', shape: 'polygon', points: [[-18, -12], [18, 0], [-18, 12]], at: 0.5, duration: 4,
  initial: { fillColor: '#ffd166' },
  keyframes: followPath({ d: 'M 120 560 C 360 120 920 120 1160 560', duration: 4, ease: 'power2.inOut', orient: true, frameRate: 30 }) }
```

| Option | Notes |
| ------ | ----- |
| `d` | the route: SVG path data in canvas coordinates; several sub-paths are walked in order; a closed one comes back to its start |
| `duration` | seconds; required |
| `at` | start, seconds from the start of the layer (default 0): give the layer its own `at` so it is not drawn at the origin before the trip |
| `ease` | GSAP ease for the progress along the path (default `'none'`: constant speed) |
| `from` / `to` | fractions 0–1 of the path to start and stop at (default 0 → 1; `from: 1, to: 0` goes backwards) |
| `orient` / `rotate` | `orient: true` also keyframes `rotation` (degrees) to face the way it is going, without ever jumping by a turn; `rotate` adds an offset (`-90` for an image that points up) |
| `frameRate` | samples per second (default 30) |

It returns `Keyframe[]`: spread it next to other keyframes, but not another `x`, `y` or `rotation` during the trip.

### `react`

Keyframes that follow a sound: `base + amount × level`, sampled once per frame from an envelope. Analyse the sound first (`await audioEnvelope(url)`, or `bpmEnvelope(bpm, { duration })` with no file), then:

```ts
import { audioEnvelope, react } from 'pixi-effects';

const env = await audioEnvelope('music.mp3', { frameRate: 30 });
{ type: 'shape', shape: 'circle', radius: 120, initial: { x: 640, y: 360 },
  keyframes: react(env, { duration: 12, props: {
    scale: { base: 1, amount: 0.4, band: 'bass', attack: 0.02, release: 0.2 },     // swells with the low end, falls back slowly
    alpha: { base: 0.5, amount: 0.5, beats: true, decay: 0.15 },                    // flashes on every beat
  } }) }
```

See [the API reference](api.md#audio-reactive-audioenvelope-react-bpmenvelope) for the options. A bar equaliser is one layer per band with `height: { base: 6, amount: 220, band: 'b7' }`.

### `deck`

A deck of pages as one movie, for a `Presenter`. Each page is a nested composition laid out after the one before (so its layers are written in the page's own time), the stops come from the pages, and an optional `transition` joins them with the existing transitions.

```ts
import { deck } from 'pixi-effects';

await movie.init({ canvas, width: 1280, height: 720, frameRate: 30, ...deck({
  transition: { kind: 'slide', direction: 'left', duration: 0.6, ease: 'power3.inOut' },
  pages: [
    { name: 'Hello', duration: 3.2, stops: [2.6], sequences: [ /* the title, at: 0 = the start of the page */ ] },
    { name: 'Why',   duration: 5.2, stops: [1.5, 3.0, 4.6], sequences: [ /* three bullets, each starting at the previous stop */ ] },
  ],
}) });
```

| Option | Notes |
| ------ | ----- |
| `pages[]` | required: `{ name?, duration, sequences, stops?, notes?, advance?, initial?, keyframes?, filters?, … }` |
| `page.duration` | seconds; **a page should last its last stop plus the transition** (after the last stop the next press plays the rest of the page and the slide) |
| `page.stops` | page-local times, or `{ at, pdf? }`: the first is the page settled, the others are steps (a bullet, a growing chart: **a step is a layer that starts at the previous stop and ends at this one**). Default: where the transition begins (the end for the last page) |
| `page.notes`, `page.advance` | notes stay on the page's first stop; `advance` (seconds) on its last |
| `transition` | `{ kind, duration, … }`: any [transition](#transitions) without `from` / `to` / `at`; the next page starts `duration` seconds early and the transition plays across the overlap. It must be shorter than every page |
| movie options | `width`, `height`, `frameRate`, `background`, `canvas`, `assets`, `poster`, `motionBlur`, `loader` pass through |

It returns `{ duration, composition: { sequences, transitions?, stops }, …your movie options }`, ready to spread into `movie.init`. The page layers are named `page-1`, `page-2`, …

### `stagger`

Delays for a wave of items, in the style of GSAP's `stagger`. Pure and seeded, so playback and export agree.

```ts
import { stagger } from 'pixi-effects';

const d = stagger(6, { each: 0.08 });                      // [0, 0.08, 0.16, 0.24, 0.32, 0.4]  -> `at: 1 + d[i]`
const letters = stagger(layers, { each: 0.05, from: 'center' });   // the same layers, `at` pushed back (the originals are not touched)
const ripple = stagger(18, { each: 0.12, grid: [6, 3], from: 'center', ease: 'sine.out' });
```

| Option | Notes |
| ------ | ----- |
| `each` | seconds between neighbours (the farthest one waits `each` × its distance). Default 0.1. Not together with `amount`. |
| `amount` | seconds from the first to the last, however many there are |
| `from` | `'start'` (default), `'end'`, `'center'` (outward), `'edges'` (inward), `'random'` (a seeded shuffle of the same delays) or an item index |
| `grid` | `[columns, rows]`: items fill the grid row by row, and the wave travels by straight-line distance (a ripple) |
| `ease` | a GSAP ease that reshapes the spread (default `'none'`); the first stays at 0, the last at the full spread |
| `seed` | for `from: 'random'`: another seed, another order |

With a layer array each layer's own `at` is kept and the delay is added to it. Keyframes inside the layers stay as they are (they count from the layer's start).

### `withFade`

Spec helper that adds alpha fade-in / fade-out to **any** sequence spec. Mutates and returns the spec, so it composes with other presets (`kenBurns`, …) and drops straight into `sequences[]`.

```ts
import { kenBurns, withFade } from 'pixi-effects';

sequences: [
  withFade(kenBurns({ asset: 'photo', at: 0, duration: 6, motion: 'scale' }), { in: 0.5, out: 0.5 }),
  withFade({ type: 'text', text: 'hi', at: 5, duration: 3, initial: { x: 'GW/2' } }, { in: 0.4 }),
]
```

| Option | Type   | Notes                                                                                         |
| ------ | ------ | --------------------------------------------------------------------------------------------- |
| `in?`  | number | fade-in length in seconds, at the start of the sequence. Sets `initial.alpha = 0`.            |
| `out?` | number | fade-out length in seconds, anchored to `at + duration`. **Requires `duration` on the spec** (throws otherwise). |

The added keyframes are layered on top of any keyframes the spec already has. `withFade` is available since `0.2.0`.
