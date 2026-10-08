Model (as you know yourself): Claude Haiku 5.5 (claude-haiku-5-5)

# piano-roll — stumble notes
Model: haiku   Cycles: 3   Result: works

## Went smoothly because the docs said so
- The cheatsheet's `music` entry (notes `c4:2`, `_`, `drums` as 16th-step strings) was enough to write a whole tune in one go; `_:n` rests make it easy to place notes at exact beats from a `[note, startBeat, length]` array.
- "Animatable props" lists `anchorX/anchorY`, `scale`, `radius`, `alpha`, and `set: { text }` for counters: the title grow-into-centre and the bar counter needed no workaround.
- `movie.inspect` / `contactSheet` / `render` behaved exactly as the api notes say (`await` needed).

## Stumbles
### 1. Loudness of a `music` bed at the advised volume is about -22 LUFS   [WRONG]
- tried: `music` track mix at `volume: 0.8` (the top of the 0.5-0.8 advice).
- happened: `inspectAudio()` loudness `integratedLufs: -22`, `truePeakDb: -7.7`, no issues.
- cause: the docs give peak figures (-6 dBFS at `volume: 1`) and "0.5-0.8" as the bed level, but `inspectAudio` notes say "-14 to -16 LUFS is typical for web video". Those two do not meet: at the advised level the bed is about 6-8 LU quieter than the typical target.
- would have prevented it: dsl.md "At `volume: 1` the music peaks at −6 dBFS (about −20 dB RMS)" should add the measured integrated loudness for a typical score (e.g. "about −22 LUFS at 0.8, −19 at 1"), and say whether to raise `volume` above 0.8 for a web-level mix.

### 2. Checking that a flash lands on its note: no note onsets in `inspectAudio`   [GAP]
- tried: find the onset of each note in the mix to compare with the bar flash times.
- happened: `cues` lists only the layer start (`layer "tune" (music)` at 1.5 s); `sources` lists the whole music layer (start 1.5, end 14); `windows` is per 0.1 s.
- cause: a `music` layer has no per-note cue list, so the only way to check a flash is to compare `windows[i].peakDb` at the note's time (I read the windows at each onset: the peak rises at every note, from about -20 to -25 dB just before to -9 to -19 dB at the onset, which is how the flashes were checked).
- would have prevented it: `inspectAudio` could list note onsets of a `music` layer in `cues` (`{ t, note, track }`), or api.md should state the window keys (`t rmsDb peakDb brightnessHz`) and that a music score has no onset list.

### 3. Drum grid for 3/4 is not spelled out   [GAP]
- tried: `grid: 2` with a kick `x.x...` and a hat `x.x.x.` in 3/4.
- happened: it worked, but I had to derive it.
- cause: dsl.md explains `grid: 2` only for 6/8 ("a 6-step pattern is one bar").
- would have prevented it: one sentence: "Any meter with eighth-note steps: `grid: 2`; a bar of 3 beats = 6 steps (3/4 or 6/8)".

## Wished the library had
- A way to get the onset time of each note of a `music` score (for flash / caption sync) without re-deriving the beat maths: e.g. `musicEnvelope` already gives "exact beats" for `react()`; expose them in `inspectAudio` as cues too.
- A `music` option to set the mix level in LUFS (or a `loudness` target), so a bed meets the -14 to -16 LUFS advice without tuning `volume`.

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// one source for the sound AND the picture: events [note, startBeat, lengthBeats]
const score = (ev, total) => {                     // → 'e5:1 _:0.5 …' for a music track
  const out = []; let pos = 0;
  for (const [n, s, l] of [...ev].sort((a, b) => a[1] - b[1])) {
    if (s > pos) out.push(`_:${s - pos}`);
    out.push(`${n}:${l}`); pos = s + l;
  }
  if (pos < total) out.push(`_:${total - pos}`);
  return out.join(' ');
};
// falling bars: the bottom edge reaches the hit line exactly at the note's start
const TRAVEL = 1.5, V = HIT_Y / TRAVEL;            // px per second
// bar layer: at = hit - TRAVEL; initial { y: 0, anchorY: 1 }; keyframe { at: 0, to: { y: HIT_Y + after*V }, duration: TRAVEL + after, ease: 'none' }
// flash: { at: TRAVEL, set: { fillColor: flash } }, { at: TRAVEL + 0.07, set: { fillColor: colour } }, and a ring (circle) with at: hit
```
