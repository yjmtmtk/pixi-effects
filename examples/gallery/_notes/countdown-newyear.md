# countdown-newyear — stumble notes
Model: sonnet   Cycles: 5 (1 write, 4 look-and-adjust)   Result: works

## Went smoothly because the docs said so
- Keyframe `at` is layer-local, so every number's punch-in / ring / spark keyframes start at 0 even though the layers sit at 1 s ... 8 s.
- The seeded `rnd()` from the particles recipe made ~1000 circle layers reproducible; the render came out identical each run and ran faster than real time (12 s piece in 8 s, 4.8 MB mp4).
- `fillGradient` (radial with alpha stops) gave the magenta "heat", the gold finale glow and the vignette with no hand-rolled images.
- `dropShadow` + `padding >= 2*blur` gave clean glow on the text; no clipping.
- contactSheet with `times` + `columns` and `inspect({layers:'none'})` caught the layout in one pass; no logs/warnings at any point.

## Stumbles
### 1. inspect flags an intentional glow stack as an overlap   [SPEC-ODD]
- tried: a glow layer (magenta dropShadow text "2027") stacked exactly under the gold "2027" for a pulsing halo.
- happened: `text layers "2027-glow" and "2027" overlap by 100% of the smaller one` at every finale frame.
- cause: inspect cannot tell a deliberate duplicate-for-glow from a collision.
- would have prevented it: ignore pairs with identical `text` and (near-)identical bounds, or let a layer opt out (`inspect: false`), or document "duplicate text for glow is reported; ignore it".

### 2. Ring z-order vs header text   [MY-MISTAKE]
- tried: declared header/pips first (they are "background UI"), then the expanding ring pulses.
- happened: the big rings crossed over the header text.
- cause: z-order is array order; I had pushed the header before the loop that creates the rings.
- would have prevented it: nothing missing; a recipe note "build a layer list per z-band and concatenate" would help when layers are generated in loops. Fixed by moving header/pips after the countdown loop.

### 3. Stroke-only circle   [GAP]
- tried: a ring pulse = circle with `fillAlpha: 0`, `strokeColor`, animating `radius`, `strokeWidth`, `strokeAlpha`.
- happened: worked first time, but only because I guessed; the cheatsheet lists `strokeColor strokeAlpha strokeWidth` and `radius` as animatable but has no example of an outlined, unfilled shape (`fillAlpha: 0`).
- would have prevented it: a one-line "ring pulse" recipe (below).

### 4. No per-property keyframe overlap rules stated   [GAP]
- tried: for fireworks, `x` eased over the whole life and `y` as two sequential keyframes (up, then gravity drop), plus overlapping `alpha` and `radius` keyframes on the same layer.
- happened: it works (different props can overlap), but I had to infer it from the depth-title recipe.
- would have prevented it: a sentence in cheatsheet "keyframes on different props may overlap freely; on the same prop they run in array order".

### 5. Particle count vs. readability   [MY-MISTAKE]
- tried: first burst = 30 equal-radius particles at a fixed distance (0.72..1.0 of the radius).
- happened: they read as a dotted ring, not a firework (empty interior), and tiny 5 px dots read as confetti.
- cause: design choice, not the library. Fixed with a distance distribution `0.3 + 0.7*rnd^0.6`, a lagging dimmer ghost per particle for a trail, and a slow gold glitter group.
- would have prevented it: a `fireworks` recipe (below) would have saved two cycles.

## Wished the library had
- A particle emitter / `repeat` of a layer with a per-instance seed (I generated ~1000 circle layers in a loop; fine for speed, but verbose).
- Blend mode `add` for glow/sparks; plain-alpha white on purple makes core flashes look grey.
- Text fill gradient in the DSL (gold gradient on "2027").
- Keyframe stagger helper (`stagger: 0.07`) for the per-digit/particle delay maths.

## Reusable pattern worth adding to ai/reference/recipes.md
```js
// ring pulse: unfilled circle that expands and thins out
const ring = (x, y, at, color, R) => ({
  type: 'shape', shape: 'circle', radius: 90, at, duration: 0.8,
  initial: { x, y, fillAlpha: 0, strokeColor: color, strokeWidth: 16, strokeAlpha: 0.95 },
  keyframes: [
    { at: 0, to: { radius: R }, duration: 0.75, ease: 'expo.out' },
    { at: 0, to: { strokeWidth: 1.5 }, duration: 0.75, ease: 'power2.out' },
    { at: 0.1, to: { strokeAlpha: 0 }, duration: 0.65, ease: 'power1.in' },
  ],
});

// firework: seeded circles, wide distance spread, gravity, shrink + fade, dimmer lagging ghost = trail
function burst(x, y, at, colors, n, R) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.2832, d = R * (0.3 + 0.7 * Math.pow(rnd(), 0.6)), life = 1.5 + rnd() * 0.5;
    const tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d, drop = 60 + rnd() * 60;
    out.push({ type: 'shape', shape: 'circle', radius: 8, at, duration: life,
      initial: { x, y, fillColor: colors[k % colors.length] },
      keyframes: [
        { at: 0, to: { x: tx }, duration: life, ease: 'power3.out' },
        { at: 0, to: { y: ty }, duration: life * 0.5, ease: 'power3.out' },
        { at: life * 0.5, to: { y: ty + drop }, duration: life * 0.5, ease: 'power1.in' },
        { at: life * 0.4, to: { alpha: 0 }, duration: life * 0.6, ease: 'power1.in' },
        { at: 0, to: { radius: 1.2 }, duration: life, ease: 'power1.in' },
      ] });
  }
  return out;
}
```
