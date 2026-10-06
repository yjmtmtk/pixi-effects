# ui-microinteractions — stumble notes
Model: opus   Cycles: 6   Result: works

## Went smoothly because the docs said so
- Card = 2-D `composition` with `pivotX/pivotY` at the card centre: the entrance, the lift and all the widget layers move together, and the children's keyframe times equal composition time when the card starts at 0 (one clock for the whole board).
- "`from` holds its start value from the layer's start" (BRIEF) meant the delayed card entrances needed no `initial.alpha`.
- `{value}` counters for the like count (`set` 128 → 129) and the download percentage, locked to the bar by the same `at` / `duration` / `ease`.
- Rect `width` tween with `anchorX: 0` for the progress bar starting at width 0, and `width` tween on a pill button (214 → 62) for the morph to a circle: both first try.
- Radial `fillGradient` blob under each card for the soft shadow (app-promo note) — zero filters.
- `set` + `to` at the same `at` (in that array order) restarts the ripple / burst ring / sparks on the second play; volume keyframes and sfx without `duration` just worked. `__logs` was `[]` on every run.

## Stumbles
### 1. Keyframes on a delayed layer are delayed too (cursor arrived 0.6 s late)   [MY-MISTAKE]
- tried: a cursor layer with `at: 0.6` whose keyframes I computed in composition time (`CASCADE[i] - 0.52`).
- happened: no warning; the cursor reached each widget 0.6 s after the click ring and sfx (which were in composition time). Only visible in a snapshot.
- cause: keyframe `at` is layer-local — the docs say so loudly; I still mixed two clocks in one helper.
- would have prevented it: an opt-in `timeBase: 'composition'` on a layer (or `atAbs` on a keyframe) for layers that are only "alive" for part of the piece but are choreographed against global beats. Workaround: start the layer at 0 (it is off-screen anyway).

### 2. A `{value}` placeholder in an ordinary caption becomes a counter   [SPEC-ODD]
- tried: a caption note `'power2.inOut · {value}%'` (describing the widget).
- happened: rendered as `power2.inOut · 0%`, no warning.
- would have prevented it: an escape (`{{value}}`), or only treat `{value}` as a placeholder when `value` is in `initial`/keyframes (and warn otherwise, as already happens the other way round).

### 3. `inspect` flags a `scale: 0` text as "has no size"   [SPEC-ODD]
- tried: badge number "3" that pops from `scale: 0` with `back.out(3.5)`.
- happened: `text layer "card-notify/bell-badge-num" has no size (empty text, or not drawn yet)` at every frame before the pop.
- cause: inspect ignores alpha < 0.3 but not scale 0.
- workaround: `alpha: 0` in `initial`, `set { alpha: 1 }` at the pop, `set { alpha: 0 }` after the reset shrink. Would have prevented it: treat scale ≈ 0 like alpha ≈ 0.

### 4. Stroke draw-on for the checkmark   [GAP → hand-roll]
- did: an open `polygon` check whose points only move rightwards, revealed by a mask rect growing from its left edge (`anchorX: 0`, width 0 → 36). Reads as a drawn stroke because the path is x-monotonic; would not work for a loop or a circle.
- would have prevented it: an animatable `trimEnd` / `progress` (0–1) on line / polygon / path strokes.

### 5. Shape masks that must follow an animated shape   [GAP]
- the ripple is clipped to the button, which presses (scale) and morphs (width). The mask does not follow the masked layer, so I generate the button's keyframes with one function and apply them to both the button and its mask. Fine, but a "mask = this sibling's geometry" option (`mask: 'button'`) would remove the duplication.

### 6. Bell swinging about its hook needs a wrapper composition   [docs]
- a `path` rotates about its bounds centre; to swing about the hook I wrapped hook/body/clapper in a 120×120 composition with `pivotX/pivotY` at the hook (aurora-logo note had the same pattern). Worked first try; a `pivotX/pivotY` in canvas coordinates for path/polygon would have been enough.

### 7. No group fade / null parent for the cursor + its shadow   [GAP]
- cursor and its drop shadow are two polygons fed by the same keyframe generator with an offset. A `group` / parent would make this one layer.

## Wished the library had
- `trimEnd`/`progress` on strokes (checkmarks, underline draw-ons) and `shape: 'arc'` (ring loader — I chose dots to avoid it).
- `lineCap/lineJoin: 'round'` on strokes (the check's corners are mitred; a UI check is usually round-capped). Not documented whether it exists.
- `shadow: { blur, y, alpha }` on shapes (the radial-gradient trick works but needs a separate layer per card + one for the lifted state).
- A way to write a layer's keyframes in composition time (see #1).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// @docs-only — draw-on checkmark: an x-monotonic open polygon revealed by a mask growing from its left edge
const CX = 640, CY = 360, T = 1;
return [{
  type: 'shape', shape: 'polygon', open: true, points: [[CX - 13, CY + 1], [CX - 3, CY + 11], [CX + 15, CY - 10]],
  initial: { strokeColor: '#ffffff', strokeWidth: 5 },
  mask: { type: 'shape', shape: 'rect', width: 0, height: 44, anchorX: 0, initial: { x: CX - 17, y: CY, fillColor: '#ffffff' },
          keyframes: [{ at: T, to: { width: 36 }, duration: 0.26, ease: 'power2.out' }] },
}];
```
```js
// @docs-only — replay an effect: `set` the start state, then `to`, at the same `at` (set first). Repeatable for any number of plays.
for (const t of [1.5, 8.45]) ripple.keyframes.push({ at: t, set: { radius: 4, alpha: 0.42 } }, { at: t, to: { radius: 150, alpha: 0 }, duration: 0.6, ease: 'power2.out' });
```
