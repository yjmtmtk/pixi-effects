# Roadmap: more expressive, still easy for an AI

Status: draft of 2026-10-10, current release 0.26.3. Nothing here is promised; the order is the proposal.

## The gate every item passes

A feature enters the library only when an AI model can write it and check it from the docs alone. For each item below we ask five things, and an item that fails one is reshaped or dropped:

1. **One line for the common case** (`from: { x: '-=36' }`, `music: { loudness: -16 }`), the rest behind options.
2. **The words are already ours**: `at / duration / initial / keyframes / filters / mask`, the same names for every layer.
3. **Deterministic**: seeded, no wall clock; the preview, the snapshot and the export agree.
4. **A build-time warning for the mistake an AI will make** (did-you-mean, a silent failure turned into a sentence).
5. **Checkable without eyes or ears**: `check`, `inspect`, `inspectAudio` give numbers or a picture the AI reads. A feature whose result an AI cannot verify waits until it can.

The measure of success is not the feature list: it is a **fresh agent given one sentence** (the landing page's) producing a checked video with fewer reads, fewer failed commands and fewer wasted cycles than before. Every theme below ends with such a trial.

## Where the wishes come from

The twelve authors of the showreel (each a fresh model reading only the docs) wrote down what they wished for; a research pass over the music engine listed what an AI gets wrong and what a musician would miss; the two one-sentence trials showed what an agent wastes. This roadmap is that list, ordered.

---

## 0.27: say it right (the enablers)

Small, and every later theme stands on it.

| id | item | why / evidence | size | AI risk |
|---|---|---|---|---|
| E1 | **Silent failures become sentences**: a matte with no fill, `animateText` exits on the last frame, a gradient left at the default angle, a dodge leak over dark, a track shorter than the others | each cost an author or a trial a cycle | S | none |
| E2 | **`check` says more**: when the last motion ends (proves calm edges), the content time inside a remapped composition, `threeD` layers partly outside the frame, shader cost per frame, masks and `visible: false` understood by `inspect` | 6 of 12 authors | M | none |
| E3 | **Reading less**: `npx pixi-effects new <name> --recipe title`, `recipe <name>`, `help <word>`; a 2 KB quick start in front of the cheatsheet | a trial read 20 k-110 k tokens for a title | M | none |
| E4 | **Small API holes**: `fitText(text, style, maxWidth)`, `animateText({ out: { stagger: false } })`, `fillGradient: { direction: 'to right' }`, a union of mattes `mask: { any: [...] }`, `pathFromPoints(points)` | wishes of 5 authors | S each | low |
| E5 | **The trial as a script**: a repeatable fresh-agent run (reads, failures, warnings, contact sheet looked at) before every release | it found two real bugs in one afternoon | M | none |

## 0.28: music, the second engine

Music is written as text, deterministic, and cheap to check with numbers: the best place to add expressiveness fast. Order from the research pass:

| id | item | one-line common case | size | AI risk |
|---|---|---|---|---|
| M1 | **Guards**: tracks of different lengths warn (named, with beats), notes far outside an instrument's range warn, per-bar `meter: 4` check | none: it only warns | S | none |
| M2 | **A loudness target**: `music: { loudness: -16 }` (LUFS) so a track's `vol` means balance and one number means loudness | `loudness: -16` | S | none |
| M3 | **Score view and timing**: `check` writes `score.png` (tracks x bars, chord names), `inspectAudio` lists each track's onsets and level, and `musicTime(music, { bar: 9 })` gives seconds | `const t = musicTime(m, { bar: 9 })` | M | none |
| M4 | **Chord-driven tracks**: arpeggio, bass and comping played from one progression, so every track has the same length by construction | `{ inst: 'pluck', chords: 'Am7:4 Fmaj7:4', play: 'arp-up:0.5' }` | M | low |
| M5 | **Ducking**: music steps down under an sfx or a voice (all times are known at init, so it is deterministic) | `duck: -6` | S-M | none |
| M6 | **Automation** on the existing points form: a filter sweep, pan, reverb, drum volume | `tone: [[0, 0.2], [16, 1]]` | S | none |
| M7 | **Fit to the picture**: pick a tempo so given bars land on given seconds (the reel author did it by script) | `bpm: { fit: [[0, 0], [16, 13.8]] }` | S | low |
| M8 | **More timbres** (strings, brass, organ, marimba, a choir pad, an 808 kit), a tempo-synced delay, a kick pump, drum velocity digits | `{ inst: 'strings', notes: 'Am:8' }` | M each | none |
| M9 | **Sections**: `sections` and `form: 'A A B A'` instead of strings built in JS | `form: 'A A B A'` | M | medium |

Not added, because an AI cannot judge the result: random melody generators, sung vocals, a user-built synth graph, a second note language, MIDI or sample import. `key: 'A minor'` is only ever a check.

## 0.29: picture, light and type

| id | item | evidence | size | AI risk |
|---|---|---|---|---|
| V1 | **Type**: per-token colour inside one text layer (`spans`), `splitText` baselines, `arc` `trimStart / trimEnd`, text on a path | 3 authors | M | low |
| V2 | **Camera and light**: a lens shift (`shiftY`, no keystone), a fade for a layer that nears the camera plane, a visible-lamp helper, shadow casters chosen per receiver, `lightLeak()` | 04-light, 03-space | M | low |
| V3 | **Transitions and shader kit**: shader-driven transitions (a transition is a luma map or a shader), a small library of tested shaders (plasma, water, grain, vignette, CRT with documented ranges) as recipes | 06, 07 | M | low |
| V4 | **Motion**: physics-flavoured eases and a bounce/wiggle set (GSAP's free CustomBounce / CustomWiggle / Physics2D as optional entries, keeping the core light), a `clock` that follows a named composition's local time | 08 | M | medium |
| V5 | **Loading, as a show**: the loader with the poster behind it (`data-poster`), and chapter segments lighting up for long, chaptered movies | the owner | S | none |

Licence note: GSAP's plugins are free under its standard licence (checked 2026-10-10); that licence forbids use in no-code visual animation builders competing with Webflow. pixi-effects is data you write, not such a builder; revisit before anything visual is built on top.

## 0.30 and 0.31: movies that answer

The idea (see the notes of 2026-10-10): an input is a named signal, live or recorded, and a recording is just data, so the movie stays deterministic and exportable.

| id | item | size | AI risk |
|---|---|---|---|
| I1 | **`iMouse` and live uniforms in shader layers** (the cheapest first step: the cursor lights a shader) | S | low |
| I2 | **Inputs and `bind`**: `movie.input(...)`, a small per-frame expression that binds an input to a layer's value (`bind: { x: '+=mouse.x * 0.1' }`), evaluated between the timeline and the 3D / light pass (prototyped: a light followed a live variable and the export called the hook on every frame) | M | medium |
| I3 | **Sessions**: record an input track, replay it, export it as MP4; `check --inputs session.json` renders the movie for synthetic input, so an AI can test an interaction without a person | M | low |
| I4 | **Pick and drag**: `pick: true`, events (enter / down / drag / up), a drag preset with a spring return, an sfx on touch | M-L | medium |
| I5 | **Branches**: `interactions` that jump between named scenes (stops and `Presenter` are the base) | M | medium |
| I6 | **Live camera and mic** as layers and inputs; recording a live session through `captureStream` into MP4 | L | medium |
| I7 | **Things inside footage**: the library accepts position data (tracks), made elsewhere; it does not look at pixels | M | low |

Open choice for the owner: live experience, recorded-session-to-video, or both (both makes the "input is recordable data" idea the centre).

## Foundations running alongside

- **Video**: trim in one line (`trim: [5, 9]`), a read-ahead for the loop wrap and reverse play (done in 0.26.3), `CanvasSink` / `AudioBufferSink` / `UrlSource` for big footage, metadata and cover art in the exported file, subtitle tracks, HDR and variable-frame-rate warnings.
- **Hardening before 1.0**: every browser test on both backends, Safari and Firefox checked by hand (documented, not yet verified), the known bugs (a 4000x2400 `threeD` black on WebGPU, an inline shape mask under a transition), an API clean-up and a freeze checklist.

## What would change the order

- A trial showing an AI wasting more on something not listed here: that goes first.
- A feature needing a second look at determinism (inputs, physics): it waits for the inputs design to settle.
- A gallery or reel that cannot be made because of a missing piece: the piece decides.
