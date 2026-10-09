# light-leaks — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 5 (4 edit/run cycles + 1 full export)   Result: works

This piece doubles as a test of the new blend-mode docs (dsl.md `blendMode`, recipe `light-leak`, pitfalls 78-80).

## Went smoothly because the docs said so
- The recipe `light-leak` was the whole skeleton: cast (`soft-light`), leak (`color-dodge`), vignette (`multiply`) copied almost verbatim and worked on the first run, no library warning at all.
- Rule 1 / pitfall 78 (blend with everything BELOW, array order) was enough to place the `screen` haze BETWEEN the mid and the near skyline so the near row stays a dark silhouette. I used it on purpose in cycle 3 and it behaved exactly as written.
- Pitfall 80 (a haze/glow is one gradient layer) shaped the design from the start: 5 blended layers on screen (max 4-5 at once), no warning.
- `fillGradient` stops with alpha, radial `radius` as a fraction of the shape's own bounds (cheatsheet) were enough to size the leak (a 640 px circle, gradient 0..1 of it).
- `check --at 0.3,2.5,...` gave pictures in seconds; the per-frame warnings were empty, the export worked first time (898 KB, 7.53 s).

## Stumbles
### 1. `soft-light` barely changes a pale sky and not at all a near-black one   [GAP]
- tried: the recipe's `cast` (orange top, blue bottom, alpha 0.9) over my pale daylight sky to "warm it to dusk".
- happened: at 2.5 s the picture had only a faint violet cast; the buildings (dark) did not change. The dusk look came mostly from a normal-blend `sky-dusk` gradient that I crossfaded in myself, and from tweening the skyline `fillColor` to dusk colours.
- cause: that is how soft-light works (strongest in the mid-tones, nearly zero near white and near black), but the docs only say "colour casts, a graded look".
- would have prevented it: one line in the `blendMode` table / recipe: "soft-light and overlay act on mid-tones only: pure white and pure black are left alone, so for a big colour change also change the picture itself (a second gradient, `fillColor` keyframes) and use the cast to unify it". The recipe works because its sky is already mid-tone.

### 2. `color-dodge` over dark pixels gives a saturated colour, not white   [GAP]
- tried: the recipe's leak (orange radial) drifting over the whole picture, including the near skyline (dark brown/violet).
- happened: over the sky it burns out to yellow-white (what the docs promise); over the dark near buildings at the peak it turned a strong saturated RED blob (frame 4.0 s). Not wrong, even pretty, but a surprise.
- cause: dodge = base / (1 - source): with a dark base the result is the leak's colour times a small gain, not white; with a bright base it clips to white.
- would have prevented it: dsl.md `color-dodge` row says "burns bright spots out toward white"; add "dark areas take the colour of the light instead (a red / orange glow), so peak the leak when it is over bright areas, or keep its alpha below 1 over dark ones". I lowered the peak alpha from 1 to 0.88 and left the rest.

### 3. `difference` of a white title is not "a negative"   [GAP / MY-MISTAKE]
- tried: the brief suggested `luminosity` or `difference` for a title beat. I made a white copy of the title with `blendMode: 'difference'` for 1.1 s as the leak crossed it.
- happened: on the orange/violet sky it draws the inverse of each pixel, i.e. a green-blue/black wordmark (frame 4.3 s). It looks fine and graphic, but I only found out by looking; I had expected "white-ish".
- cause: difference with white = 1 - backdrop, so it is the complement colour of the sky, and it depends on the sky colour.
- would have prevented it: a sentence in the table: "`difference` with white = the colour negative of what is behind". Not a library problem.

### 4. A blend on text needs its own layer (and `blendMode` is not obviously animatable)   [GAP]
- tried: to make the title go normal -> difference -> normal.
- happened: nothing failed, but the docs do not say whether `blendMode` can be keyframed (`set: { blendMode }`) or only fixed on the layer. I did not dare, because the animatable-props list in the cheatsheet does not name it, and used two layers (`title-negative` for 1.1 s in `difference`, the cream `animateText` title after it).
- would have prevented it: in the cheatsheet's animatable-props line or the dsl `blendMode` section: "`blendMode` is a fixed property of the layer, not animatable; for a beat of another mode use a second layer with its own `at` / `duration`" (or, if `set` works, say so; I did not test it).

### 5. Animating a gradient property inside a blended layer: `radius` is accepted, but I could not tell whether it ran   [GAP / TOOLING]
- tried: the vignette's radius closing in from 1.05 to 0.78 with `to: { fillGradient: { radius: 0.78 } }` (docs: partial gradient, same number of stops; `radius` is listed for radial).
- happened: no warning, and the sheets show the corners getting darker over time, but with the alpha fade running at the same time I cannot say from the contact sheet how much came from the radius. I did not do a separate single-property frame comparison (time).
- would have prevented it: pitfall 66 lists `angle` and `stops` as the animatable gradient keys; add `radius` / `center` there if they are, or a recipe line "vignette closing in".

### 6. The mix was -30 LUFS with every sfx at volume 0.35-0.5   [TOOLING / GAP]
- tried: the quiet volumes that seemed polite for a short piece.
- happened: check printed "the mix is quiet for web video: -30.7 LUFS". Raised the volumes to 0.8-1.2: -24.3 LUFS, no clipping (peak -11.7 dBFS). The note is helpful, but the cheatsheet already says "a sparse track of clicks measured −32 LUFS at 0.5": I had read it and still started low.
- would have prevented it: a starting volume for sfx in the sfx recipe (around 0.8-1.2 for a sparse piece with no music).

### 7. `animateText` + a second plain text layer in the same place: the review list flagged an overlap   [TOOLING, minor]
- happened: with the first timing the `title-negative` layer lived at the same time as the rising letters, check listed `title-0` and `title-negative` as an overlap of 95%. It is intentional (a crossfade of two copies), the note says so itself ("often intentional"), so no action; after I moved the negative to fade out before the letters, the review list was empty. No stumble, just recording that the review list is meaningful.

### 8. A path as a skyline silhouette worked, but a `colorSpace` on a path shape was unverified   [GAP, minor]
- tried: `shape: 'path'` with `colorSpace: 'oklab'` at the top level and `fillColor` keyframes (day -> dusk colours).
- happened: no warning, the colours moved smoothly, with no brown mud between slate blue and violet. The cheatsheet lists `colorSpace` for shapes (fine); I only note that the line "shapes: `colorSpace: 'oklab'|'oklch'`" does not say it goes at the top level, I guessed from the text layer line.

## Wished the library had
- A way to see which layers carry an advanced blend mode and how many are on screen (the warning only fires at 10; `check` could print "blend layers on screen: 5" as a quiet note).
- `blendMode` as a `set` keyframe (a light leak that is `add` for the first second and `color-dodge` after it), if it is not there already.
- A `leak` / `grade` preset (`lightLeak({ from, to, at, duration, color, peak })`) since the recipe is a typical 15-line block: the common case should be one line (the philosophy of the project).

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
A dusk, as three silhouettes (one path each, so three layers, not 30 rectangles) and a haze BETWEEN rows so the foreground stays dark:

```js
function makeRow({ name, minW, maxW, minTop, maxTop, spikes = 0 }) {   // seeded rnd() defined elsewhere
  const blocks = []; let x = -20;
  while (x < W + 20) { const w = between(minW, maxW); blocks.push({ x, w, top: between(minTop, maxTop) }); x += w; }
  let d = `M ${blocks[0].x} ${H + 10}`;
  blocks.forEach((b, i) => { d += ` L ${b.x} ${b.top} L ${b.x + b.w} ${b.top}`; });
  d += ` L ${blocks.at(-1).x + blocks.at(-1).w} ${H + 10} Z`;
  return { type: 'shape', shape: 'path', name, d, colorSpace: 'oklab', initial: { fillColor: '#475d80' },
           keyframes: [{ at: 1.2, to: { fillColor: '#100e26' }, duration: 3.4, ease: 'sine.inOut' }] };
}
// order: sky, far row, mid row, haze (blendMode: 'screen'), near row, windows, soft-light cast, color-dodge leak, multiply vignette, type
```
