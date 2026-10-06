# Synthesised Sound Effects (`sfx`) — Design

Status: draft for review. Direction follows [`docs/philosophy.md`](../../philosophy.md). Breaking changes are acceptable (single experimental user). Implementation plan: [`docs/superpowers/plans/2026-10-07-synth-sfx.md`](../plans/2026-10-07-synth-sfx.md).

## Goal

Let an AI add sound effects **without any audio file**: a sound is data in the spec, synthesised at init, mixed like any other audio layer, and **guaranteed to be in the exported MP4 / MOV / WebM / MKV exactly where it plays in the browser**. A video becomes completely self-contained — no `examples/_assets/sfx-*.mp3`, no `assets` entries, no measuring clip lengths. The owner's priority: it must be the easiest, most intuitive thing for an AI to use.

```js
{ type: 'audio', sfx: 'swoosh', at: 2 }                                          // the whole thing
{ type: 'audio', sfx: { preset: 'hit', pitch: -3, brightness: -0.5 }, at: 4 }    // lower and darker
{ type: 'audio', sfx: 'riser', at: 3, duration: 1.5, volume: 0.7 }              // a 1.5 s riser ending at 4.5 s
{ type: 'audio', at: 6, duration: 0.3,                                          // a custom sound
  sfx: { voices: [{ wave: 'square', freq: [1600, 200], filter: { type: 'lowpass', freq: 3000 }, envelope: 'fall' }] } }
```

## Decisions

| # | Question | Decision |
|---|---|---|
| 0 | Library or our own? | **Our own small pure-JS synth** (owner's decision). ZzFX / jsfxr: ~20 cryptic positional parameters and `Math.random` noise (not deterministic, not AI-readable). Tone.js: heavy, an imperative real-time graph (the offline/export path is a different code path). Howler: playback only. CC0 sample packs: still files. |
| 1 | Where does synthesis run? | A **pure-JS generator returning `Float32Array`s**, called by the mixer at the mix's sample rate. Not OfflineAudioContext graphs. |
| 2 | DSL shape | A field on the existing `audio` layer. Minimal call `sfx: 'swoosh'`. A **closed union of 11 presets** + three **intent-level knobs** (`pitch`, `brightness`, `seed`); length and level are the layer's own `duration` and `volume`. **Optional `voices`** for custom sounds, with words instead of numbers where possible (`envelope: 'bell'`, `filter: { type: 'bandpass' }`). Every unknown name warns with a suggestion. |
| 3 | Duration | **The layer's `duration` is the sound's length.** Omitted → the preset's own length (custom: 0.5 s). Given → the sound is stretched to it. `loop` warns. `at` is where the sound starts. |
| 4 | BGM | **Out of scope**; a possible later step on the same engine. |
| 5 | Sync with picture | No new helpers. Each preset's "loudest at" is documented and **measured** by `inspectAudio()` (`sound.loudestAt`); tested recipes show the patterns. |
| 6 | Bundle | Core DSL, no subpath, no registration. The synthesiser is a **dynamic-import chunk** (≈ 17 KB unminified, 10 KB minified) loaded only by movies that use `sfx`. |
| 7 | Verify without hearing | **`movie.inspectAudio()`**: per sound (measured alone) `length`, `peakDb`, `loudestAt`, `brightnessHz` (spectral centroid); when it plays; per-window loudness and brightness of the mix; `issues`. Taught in the skill, cheatsheet, recipes and pitfalls. |
| 8 | Export guarantee | First-class: the export path is traced, an **AAC timing defect is fixed** (MP4/MOV audio was 45 ms late), and an **acceptance check renders real files** (mp4 / mov / webm / mkv × 44.1 / 48 kHz), decodes them and asserts every sound is there on time. Node tests pin that the mix holds exactly the synthesised samples at `at`. |
| 9 | Loudness / clipping | Presets peak-normalised to **−12 dBFS × a per-preset level** at `volume: 1`; the mix is **soft-limited above 0.9** with a warning naming the layers. Stereo. |
| 10 | Sizing | 9 tasks: generator (1→2) ∥ mixer (3); layer (4) ∥ inspectAudio (5); export guarantee (6) ∥ example (7) ∥ docs (8); final (9). |

## Evidence

1. **The owner approved a synthesised sound by ear.** `scripts/sfx/swoosh-candidates.mjs` (pure JS: seeded white noise, a Chamberlin state-variable filter swept per sample, an envelope, constant-power pan, 3 ms edge fades, peak normalisation) rendered six candidates; the owner picked **"air"** (band-pass noise 500 → 5200 Hz exponential sweep, Q 1.3, bell envelope with attack 0.32, 0.5 s, pan −0.6 → +0.6) over the old `sfx-swoosh.mp3`. This design takes that script's building blocks as the engine, and the `swoosh` preset **is** "air": a test regenerates the script's WAV and requires our output to match it sample for sample (≤ 1 LSB at 16 bit). The candidates `swipe` and `riser` became presets too; `scifi`, `cloth`, `passby` are seeds for later presets.
2. **The design was built and run as a prototype** (outside the repo, from the planning session's scratchpad) on a copy of the repo at `8087d5e`: the new tests and the existing suite pass together, `tsc` is clean, tsup emits the synthesiser as a separate chunk. In real Chrome: the example initialises with no warnings; `inspectAudio()` reports each sound at its `at` with the expected loudest moments (swoosh 0.154 s, riser 0.958 s); the limiter warning fires and names the layers on an overloaded mix; and the export matrix below passes. The plan's code is the prototype's code.

## Non-goals (v1)

- Music / BGM / loops / beats / drones.
- Per-layer pan, reverb, EQ, ducking automation, sidechain (presets may pan internally: swoosh moves left → right).
- LUFS loudness normalisation (presets are peak-normalised and trimmed by ear).
- Speech, Foley realism, sample playback.
- Migrating `examples/gallery/` (planned below, done later).

## DSL (AI-first)

### Types (exported from `pixi-effects`)

```ts
export type SfxPreset =
  | 'click' | 'pop' | 'swoosh' | 'swipe' | 'hit' | 'riser' | 'chime' | 'beep' | 'coin' | 'glitch' | 'typewriter';

export interface SfxKnobs {
  pitch?: number;        // semitones, ±24 (12 = an octave)
  brightness?: number;   // −1 dark / muffled … 0 as designed … 1 bright / crisp
  seed?: number;         // another take of the random parts; same seed ⇒ same sound
}

export interface SfxVoice {
  wave: 'sine' | 'triangle' | 'square' | 'saw' | 'noise';
  freq?: number | [number, number];                                   // Hz, or a sweep
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: number | [number, number]; q?: number };
  envelope?: 'fall' | 'bell' | 'swell' | 'hold';                       // default 'fall'
  pan?: number | [number, number];
  from?: number; to?: number;                                         // part of the sound, 0–1
  gain?: number;
}

export type SfxOptions =
  | (SfxKnobs & { preset: SfxPreset; voices?: never })
  | (SfxKnobs & { voices: SfxVoice[]; preset?: never });

interface AudioBase extends SequenceCommon { type: 'audio'; volume?: number }
export interface AudioAssetSpec extends AudioBase { asset: string; sfx?: never; loop?: boolean }
export interface AudioSfxSpec  extends AudioBase { sfx: SfxPreset | SfxOptions; asset?: never; loop?: never }
export type AudioSequenceSpec = AudioAssetSpec | AudioSfxSpec;
```

Why it is shaped this way, for an AI author:
- **One layer type, one vocabulary.** An sfx is "audio whose source is generated" (After Effects: a solid is generated footage). It shares `at`, `duration`, `volume`, volume keyframes, nesting and the mixer with file audio. The knobs the coordinator listed — pitch, duration, brightness, volume — are all there; duration and volume are simply the layer's own fields (writing them inside `sfx` warns "goes on the audio layer").
- **Names, not numbers.** Presets, envelopes, waves and filter types are words an AI already uses. A closed union means a wrong guess is caught: `whoosh` → "did you mean `swoosh`?", `ding` → `chime`, `impact` → `hit`, `sawtooth` → `saw`, `lp` → `lowpass`, `decay` → `fall`, `frequency` → `freq`.
- **The minimal call is complete.** `{ type: 'audio', sfx: 'swoosh', at: 2 }` needs no length, no level, no asset.
- **An escape hatch that is still data.** `voices` lets an AI describe a new sound in a few readable fields (one voice is usually enough). It is validated field by field; a bad voice is skipped with a warning, never a crash.

### Duration, `at`, `loop`, volume keyframes

| Spec | Result |
|---|---|
| `sfx: 'pop'` (no `duration`) | Lasts the preset length (0.12 s). Custom `voices`: 0.5 s. |
| `sfx: 'riser', duration: 1.5` | Rendered 1.5 s long (envelope and sweeps stretch). |
| `duration` < 0.02 or > 10 | Clamped, warns. |
| `at: 3` | The sound's first sample is at 3 s (composition time). |
| `loop: true` | Ignored, warns: one layer per hit. |
| `asset` + `sfx`, `preset` + `voices` | `sfx` / `voices` win, warns. |
| unknown preset / option / voice field | Warns with a suggestion; the layer (or voice) is silent. |
| volume keyframes | As for file audio (layer-local, hold until their own start, `set` jumps). A keyframe after the sound ends warns. |
| sound running past the movie end | Cut off; `inspectAudio().issues` names it. |

"Stretch, not trim": trimming a generated sound is never wanted (an abrupt cut); "make the riser 1.5 s" is the common request.

### Presets

| Preset | Length | Loudest at | Brightness (centroid) | For | Origin |
|---|---|---|---|---|---|
| `click` | 0.04 s | start | ≈ 12.8 kHz | UI click, tick | new |
| `pop` | 0.12 s | start | ≈ 390 Hz | an element appearing | new |
| `swoosh` | 0.5 s | **0.16 s** | ≈ 3.1 kHz | transitions, fly-pasts; moves left → right | **approved "air"** |
| `swipe` | 0.22 s | start | ≈ 13.2 kHz | quick UI swipe | candidate "swipe" |
| `hit` | 0.7 s | start | ≈ 150 Hz | impact, slam | new |
| `riser` | 1 s | **its end** | ≈ 11.9 kHz | build-up into a hit | candidate "riser" |
| `chime` | 1.4 s | start | ≈ 1.4 kHz | success, reveal | new |
| `beep` | 0.16 s | flat | ≈ 1.0 kHz | countdown, alert | new |
| `coin` | 0.4 s | 0.07 s | ≈ 1.9 kHz | reward, collect | new |
| `glitch` | 0.35 s | start | ≈ 4.0 kHz | digital error | new |
| `typewriter` | 0.06 s | start | ≈ 3.3 kHz | one key; vary `seed` | new |

The DSL reference carries this table; a docs test fails if a name, a length or a documented brightness (±25 %) drifts from the code.

## Architecture

```
spec ──► AudioSequence.build()
           ├─ asset → Assets.get (unchanged)
           └─ sfx   → await import('../audio/sfx')          (own chunk)
                       resolveSfx(sfx, duration)             validate, warn, clamp → ResolvedSfx
                       this.duration = length
         AudioSequence.collectAudio()
           → AudioDescriptor { synth: { key, render: sr => renderSfx(resolved, sr) }, layer, source, start, end, volume… }
Movie.init → mixdown(audios, duration, ctx.sampleRate)       synth → rendered ONCE per key at the mix rate
           → limitMix(buffer, audios)                        soft limit > 0.9, warn if > 1
           → movie.audioBuffer (2 ch, ctx rate) ──► play()
                                                 └─► render(): AudioBufferSource(aac | opus) → mediabunny → file
movie.inspectAudio() → analyzeAudio(audioBuffer, audios, stats)   (pure; re-renders each sound alone to measure it)
```

New: `src/audio/dsp.ts` (the script's building blocks: `lcg` noise, sweeps, `bell` / `fall` / `swell` / `hold` envelopes, the Chamberlin `Svf` — 2× oversampled only for voices whose cutoff passes `sampleRate / 6`, where the plain form diverges — PolyBLEP oscillators, pan, edge fades, the brightness `tilt`), `src/audio/presets.ts` (presets as data), `src/audio/sfx.ts` (`resolveSfx`, `renderSfx`), `src/core/spectrum.ts` (`spectralCentroid`), `src/core/inspectAudio.ts`. Changed: `types.ts`, `sequences/Audio.ts`, `sequences/Video.ts` (labels), `core/AudioMixer.ts`, `core/Movie.ts`, `core/Renderer.ts`, `index.ts`.

The seam is the descriptor: anything that can produce samples for a sample rate can be mixed. Playback and export never learn that a sound was synthesised.

### Why pure JS, not OfflineAudioContext graphs

| | Pure JS → Float32Array | OfflineAudioContext graph |
|---|---|---|
| Determinism | Exact per engine (integer PRNG, explicit maths). | Browser-implemented filters/oscillators differ across browsers. |
| Node tests | Real samples in vitest. | Would test a mock. |
| Approved by ear | Yes — "air" is this approach. | — |
| Cost | ~350 lines; a few ms per sound. | Async graph per sound; noise needs a buffer anyway. |

### Determinism

Same resolved sound + same sample rate ⇒ bit-identical samples within a JS engine. Noise is the script's LCG seeded by `preset.seed + seed × 977 + voice × 7919` (the preset base seed is the approved take). No `Math.random`, no time. The mix is rendered at the AudioContext's rate (44.1 or 48 kHz); playback and export on one device always use the same buffer.

## Export guarantee (first-class)

**The path (traced in `src/core/Renderer.ts` and mediabunny 1.61.3).** The mix is ONE `AudioBuffer`, 2 channels, at the AudioContext's rate; synth sounds are rendered by the mixer at that rate, so nothing inside the mix is ever resampled or re-channelled. `render()` adds `new AudioBufferSource({ codec, bitrate })` as the audio track — `aac` for mp4 / mov, `opus` for webm / mkv — and calls `add(movie.audioBuffer)` once from timestamp 0. mediabunny converts it to `AudioSample`s and feeds WebCodecs' `AudioEncoder` with the buffer's own rate and channel count (no transform, no resampling by mediabunny); Chrome encoded both rates with both codecs.

**The defect found and fixed.** AAC encoders emit 2112 priming samples before the audio; mediabunny was not told, so MP4 / MOV had no edit list and every sound was **45 ms (48 kHz) / 48 ms (44.1 kHz) late** — confirmed with Chrome's decoder and with ffmpeg. Fix: start the AAC track at `−2112 / sampleRate`; mediabunny then writes an `elst` that trims the priming. Opus carries its own pre-skip and was already exact. This affected file audio too; it matters most for percussive sfx.

**The proof.** `examples/_checks/sfx-export.html` builds a movie of ONLY synthesised sfx at known times, renders, decodes the file (`decodeAudioData`), and passes only if every sound starts within ±5 ms of its `at`, peaks above −20 dBFS, the gaps are below −60 dBFS, the decoded length is within 0.05 s of the movie, and there were no warnings. Prototype results with the fix (8/8 pass; without it mp4/mov fail at +45/+48 ms):

| rate | format | onsets (ms) | peaks (dBFS) | gaps | decoded length |
|---|---|---|---|---|---|
| 44100 | mp4 / mov | 0, 1, 1, 1 | −14.3 … −12 | −120 | 3.528 s |
| 44100 | webm / mkv | 1, 1, 2, 1 | −13.8 … −12.1 | −120 | 3.514 s |
| 48000 | mp4 / mov | 1, 1, 1, 1 | −15 … −12 | −120 | 3.540 s |
| 48000 | webm / mkv | 0, 1, 1, 1 | −15 … −12 | −120 | 3.514 s |

ffmpeg on the fixed MP4: onsets 0.1–0.7 ms. At unit level, a node test asserts the mix holds exactly the synthesised samples × volume from the sample at `at` (what `play()` and `render()` receive), and a Renderer test pins the AAC start offset (and 0 for Opus).

## Verify without hearing

`movie.inspectAudio({ window? })` → `{ duration, sampleRate, peakDb, peakAt, sources, windows, issues }`:
- `sources[i] = { layer, source, start, end, peakDb /* the mix while it plays */, sound: { length, peakDb, loudestAt, brightnessHz } }` — `sound` is measured on the sound **alone** (re-rendered or read from its buffer), so overlaps do not blur it. `loudestAt` is what to line up with the picture; `brightnessHz` is the power-weighted spectral centroid (rule of thumb: < 500 Hz dark / boomy, 1–4 kHz mid, > 8 kHz airy / hissy; `brightness: ±1` moves it).
- `windows[i] = { t, rmsDb, peakDb, brightnessHz }` of the mix.
- `issues`: the mix was limited (when, how much), a layer is inaudible (< −50 dBFS while it plays), an sfx is cut off by the end, a layer starts after the movie ends, no audio at all.

How the docs teach it: SKILL step 4 "hear with numbers"; cheatsheet Movie API line; the `sfx-minimal` recipe followed by a `render-and-verify` block; pitfall 31 rewritten. It replaces "decode your render and compute RMS by hand", which gallery authors did repeatedly.

## Loudness and clipping

- `volume: 1` = the preset peaks at **−12 dBFS** (0.25) × its `level` (0.5–1; sustained `beep` / `coin` / `glitch` trimmed lower so presets sound about equally loud). Measured: −12 … −18 dBFS. The old mp3s peaked at −13 (pop) to −26 dBFS (chime); `bgm.mp3` at −25 dBFS.
- **Rule for overlaps:** −12 dBFS leaves room for about four sounds at the same instant. Beyond that, `limitMix` bends samples above 0.9 smoothly toward 1 (tanh knee; deterministic; a mix under 0.9 is untouched, so existing movies do not change) and warns once: `the audio mix peaks at 1.97 (+5.9 dBFS) at 10.31s … Playing there: layer "a", layer "b". Lower their volume.` `inspectAudio().issues` repeats it.
- **Consistency across presets:** peak normalisation plus a per-preset `level` tuned by ear; peak is not perceived loudness (a sustained beep sounds louder than a pop at the same peak), so the owner's listening pass (plan Task 7) sets the final levels. LUFS is a non-goal.
- **The existing "audio shorter than its layer" warning (0.05 s tolerance)** applies only to file audio and is unchanged. It never fires for sfx: an sfx layer's duration *is* the sound's length. With presets, the gallery's measured clip lengths (and that tolerance) stop mattering.

## Sync with picture

No new helpers (`withSfx`, a `sound` field on visual layers, `beats({ bpm })` were considered and rejected: they hide a second layer or add a second way to say the same thing). Instead: the loudest moment of each preset is documented and measurable; recipes (executed by tests) show riser → hit, a pop per list item with rising pitch, a typewriter key per letter with `seed: i`, a swoosh centred on every slideshow transition (`at = tr.at + tr.duration / 2 − 0.16`).

## Scope: BGM

Out. Music needs harmony, rhythm and arrangement; a bad synthetic bed is worse than none. `bgm.mp3` keeps working. A possible later step: a looping `drone` / `pad` preset or `voices` with a defined `loop` meaning, on the same engine.

## Bundle

`await import('../audio/sfx')` only on the sfx path; tsup (`splitting: true`) emits `dist/sfx-*.js`. `dist/index.js` grows by the limiter, `analyzeAudio` and the FFT (a few KB). No new `exports` entry, no `registerSfx()`, no dependency.

## Testing

- Pure: `dsp` (LCG reference, sweeps, envelopes, filter response and stability at 22.05 / 44.1 / 48 kHz, oscillators, voice window, fades, pan, tilt), `sfx` (every preset × 3 rates × 3 pitches: stereo, length, finite, peak, silent ends; determinism; seed; stretch; pitch doubles zero crossings; shapes; brightness moves the centroid; golden swoosh; `resolveSfx` incl. every voice mistake), `spectrum`.
- Mixer: render once per key, placement, synth + file, limiter.
- Layer: no asset load, durations, **exact samples in the mix at `at`**, nested offset, warnings.
- `inspectAudio`: per-sound measures, windows, issues.
- Renderer: AAC start offset, Opus 0.
- Docs: recipes (incl. `sfx-minimal`, `sfx-cues`), `SfxDocs` (names, lengths, brightness).
- Real browser: the export matrix; the example page; the owner listens.

## Risks

- **Taste.** Eight presets have not been heard by the owner. Mitigation: the example renders all of them; tweaks are data edits; the swoosh is locked by the golden test.
- **Browser codec support.** Chrome encoded AAC and Opus at 44.1 and 48 kHz; Safari / Firefox AAC encoding may need mediabunny's polyfill encoders (already noted in the README). The acceptance page runs in any browser.
- **Chamberlin stability** above `sampleRate / 6`: oversampled voices, `q ≥ 0.7`, covered for every preset × pitch × rate.
- **Cross-engine maths:** `Math.sin` etc. may differ in the last ulp between engines (inaudible); the golden test pins Node.
- **Mixed old and new audio:** old mp3s at the same `volume` are 1–14 dB quieter than presets; documented.

## Gallery migration (later, not in this work)

`examples/gallery/` (16 pieces, 10 use sfx mp3s) and `examples/09-audio.html` / `_presets/09-audio.js` move to presets in a separate change:

| Old | New | Volume factor (start; confirm with `inspectAudio` and by ear) |
|---|---|---|
| `asset: 'pop'` (`sfx-pop.mp3`, −12.9 dBFS) | `sfx: 'pop'` | × 1 |
| `asset: 'swoosh'` (the "air" render since `196ca21`) | `sfx: 'swoosh'` | match the file's current level (≈ × 0.5) |
| `asset: 'chime'` (−25.7 dBFS) | `sfx: 'chime'` | × 0.25 |
| `asset: 'click'` (−23.7 dBFS) | `sfx: 'click'` | × 0.3 |

Per piece: replace the local `sfx(asset, at, len, vol)` helper with `({ type: 'audio', sfx: name, at, volume })`, drop the measured `duration`s and the four `assets` entries, run it, read `inspectAudio().issues`. Then update `examples/gallery/BRIEF.md` (audio rule), check `tests/docs/Gallery.test.ts`, and delete `examples/_assets/sfx-*.mp3` (keep `bgm.mp3`) once nothing references them.

## Open questions (for the owner)

1. Level at `volume: 1`: −12 dBFS peak (default), or louder / quieter?
2. Presets: the 11 above (default), or add `scifi` / `cloth` / `passby` from the approved script now?
3. `duration` stretches the sound (default) — or trims it like a file?
4. `riser` default length 1 s (default) or the candidate's 0.7 s?
5. `brightness` is a tilt around 1.5 kHz (−1 removes the highs, +1 doubles them, i.e. +6 dB) (default) — enough, or should it also move the presets' filter cutoffs?
