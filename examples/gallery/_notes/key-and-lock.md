# key-and-lock - usability notes
Model: opus   Slot: T28   Cycles: 8   Result: works
Timeline: started 13:49; first page that rendered at +5 min (13:54, warnings none on the first run); first contact sheet looked at at +5; done at +16 (14:05)

Concept: public-key cryptography as one gesture. B hands out an OPEN padlock (the public key); A snaps it shut on a message card and each character
turns into a grey hex pair; C (the eavesdropper) tries a grey key at the keyhole, the lock rattles, nothing; B's brass key turns (a scaleY flip about
its shaft), the shackle springs, the text comes back; the parcel steps forward and the line lands: 「閉めるのは、誰でも。開けるのは、ひとりだけ。」
Palette ink / bone / brass / grey; Mincho for sentences, Hiragino Sans for labels, monospace for the cipher; brass only for the private key and 「ひとりだけ」.
13 s, 120 bpm (a beat = 0.5 s): the lock snaps on 3.9, the key turns on 8.36, the lock opens with the bell on beat 17 (8.5 s).

## Went smoothly because the docs said so
- AGENTS.md -> quickstart -> SKILL.md was short; `pixi-effects new` + the `recipe` list gave everything needed to plan in about 5 min.
- cheatsheet's shape table (path `d` with cubic curves, `trimEnd` draw-on, polygon) + "null + parent" (nulls chain, children in the null's place in the stack)
  let me build a padlock, a shackle that lifts, keys and a parcel that carries all of them, with no surprises. Parenting everything to one null made the
  finale (the whole parcel steps forward and scales to 1.5x) a single keyframe.
- `spans` for one brass word in the headline: worked first time as documented.
- `music` as text + the check's music read-back: the 120 bpm grid and moving the resolution by one beat (E7:5, bell `_:17`) was easy to verify.
- The first run already had zero warnings; `check --no-export --at ...` took ~10 s per cycle, so 8 cycles were cheap.

## Stumbles   (one entry each, also small ones)
### 1. A first keyframe's `from` shows before the keyframe starts   [GAP | MY-MISTAKE]
- tried: a ring pulse `initial: { alpha: 0, scale: 0.6 }`, `keyframes: [{ at: 8.02, from: { alpha: 0.9, scale: 0.6 }, to: { alpha: 0, scale: 3.2 } }]`.
- happened: the ring was visible (alpha 0.9) from second 0 until 8.02, at both A and B. No warning.
- cause: the `from` of a layer's first keyframe holds from the layer's start (GSAP immediateRender semantics); `initial.alpha: 0` is overridden.
- would have prevented it: one line in quickstart's "what goes wrong most": "the first keyframe's `from` applies from the layer's start, not from its `at`;
  for something that appears later, put the start values in `initial` and use `to`". Or a review line in `check` when `initial.X` and the first `from.X` disagree.
  (Fixed with `to: { alpha: 0.9 }, duration: 0.04` then a separate fade.)
### 2. Text scaled up by a parent null is blurry   [GAP]
- tried: message text at 36 px inside a null that the finale scales to 1.5x.
- happened: the characters were visibly soft in `frames/11.20s.png` (shapes stayed crisp). No warning; nothing in cheatsheet/pitfalls (grep: resolution, blurry, crisp).
- cause: text is rasterised at its fontSize and the texture is scaled.
- would have prevented it: a pitfall "text that will be scaled above 1 (by itself or a parent) is a scaled bitmap: draw it at the largest size and
  give it `scale: 0.5`" (that is what I did), or an automatic re-raster / a `resolution` style key.
### 3. `help path` does not find the path SHAPE   [TOOLING]
- tried: `npx pixi-effects help path` to learn the `shape: 'path'` options.
- happened: it printed followPath, three.js keyframe paths, filter keyframe paths and cameraPath, not the shape table; I had to grep the cheatsheet.
- would have prevented it: rank the shape table (cheatsheet "shape — rect | circle | … | path") first for `help path` / `help shape`.
### 4. Captions overlapping during a cross-fade   [MY-MISTAKE]
- the next caption started fading in while the previous was fading out (both at 40 % alpha on the same line, an ugly still). Fixed by ending the old one
  before the new begins. `check` listed it as a text-overlap review item, which is how I noticed it before the sheet.
### 5. Card fill visible as a dark rectangle before the outline draws   [MY-MISTAKE]
- the INK fill of the card was darker/lighter than the vignetted ground at frame 0. Docs say plainly "the fill is NOT trimmed": I just did not apply it. fillAlpha 0 -> 1 after the draw-on fixed it.
### 6. Retiming half the movie by hand   [SPEC-ODD, small]
- extending one step by 0.5 s meant shifting ~30 literal times (I did it with a script). Fine for data, but a `shift`/offset helper for a group of
  keyframes, or a composition per beat, would make "everything after X moves later" a one-number change. (Using a nested composition from the start would have been the cleaner choice: my own design issue.)

## Docs I read, and which answered my question
- AGENTS.md (WebFetch), quickstart.md, SKILL.md (whole), `recipe` (list), `recipe draw-on-and-type` (answered draw-on + polygon/path usage),
  `help path` (did not answer), cheatsheet lines 47-84 (shape table, path, gradients, null/parent, music, sfx: answered), `help spans` (answered),
  grep for `back.out` / `expo` in the cheatsheet (answered), grep for text resolution (nothing).

## Wished the library had
- A `resolution` (or automatic re-raster) for text inside scaled parents.
- A review line when a first keyframe's `from` contradicts `initial` (the invisible-before-start case).
- A tiny helper to offset a list of keyframes / layers in time (`shift(specs, 0.5)`), for retiming.

## Self-assessment: 3 honest weaknesses, and what I would change with 3 more cycles
1. The first 2 s are quiet and small (a card at the left, the right half empty): I would let B's open lock be visible at B from 0.6 s so the stage is set at once.
2. The keys are drawn over the lock face in side view (a convention, not a real keyhole view); a short close-up of pins lining up when the brass key enters
   would make "only this key fits" more literal.
3. The middle (4-7 s) is a single object travelling on a line; a light camera push-in on the rattle (5.9-6.2 s) and a pull-back for the finale would add depth.
