# A composition is one picture — design (2026-11-15)

## Intent
The owner's rule for pixi-effects: what matters most is that an AI understands it and writes it right. An AI already knows two models of a group:
a CSS element and an After Effects precomp. In both, a group's opacity and blend mode act on the group as ONE picture. pixi-effects did the
opposite by default (PixiJS multiplies a container's alpha into each child, and a container's blend mode is inherited by each child), so an AI's
first guess was wrong and the docs carried warnings ("give it `threeD: true` or a filter to blend it as a whole", "its background shows through
its text while it crossfades", "its rectangle culls it even when a child is back on screen").

## Decisions (owner, in chat)
1. No new switch. The composition simply behaves as the AI expects: `alpha`, `blendMode`, `filters`, `mask` act on its picture. No `flatten` /
   `collapse` / `isolation` key (those words warn that nothing is needed).
2. `clip: true` cuts the content to `width × height` (named after CSS `overflow: hidden`). Default false (as before, as CSS's `visible`).
3. `threeD` keeps its name (trials write it right; three.js, the source of confusion, is gone). Other tools' words for it warn "did you mean".
4. Composition parameters/components and composition time tools (`frameRate`, `loop`) are later, separate designs.

## How (builder's calls)
- The timeline keeps writing `alpha` on the composition's container. An instance accessor keeps that value (so inspect / hover / checks read it)
  and gives it to a group pass (PixiJS `AlphaFilter`, resolution and anti-aliasing inherited from the target, so edges do not change when a fade
  starts) while 0 < alpha < 1; the container's own alpha then stays 1. At 1 and 0 the pass is disabled (PixiJS skips a filter list whose filters
  are all disabled: no texture). A composition with a non-normal `blendMode` keeps the pass on, and the blend goes on it as the last filter
  (`applyBlendMode` already puts a filtered layer's blend on its last filter).
- The group pass ends the composition's own filters (CSS: opacity after filter); the parent's matte and blend filters come after it.
- `clip: true`: a stencil rect on the inner container (the layer's own `mask` stays free for the outer one); the outer container is culled by
  its rectangle only when clipped. Unclipped compositions are not culled by their rectangle (each child is culled on its own).
- Review round (fresh reviewer): a composition whose layers reach the backdrop (blendMode / backdropBlur at any depth) and has no blendMode of its
  own is NOT isolated (alpha per layer, as before): isolating it changed a screen glow into a flat colour and made the look jump when a fade
  started. The pass is inserted into the filter list only while needed (no batch break at alpha 1). A stencil-mask composition has no pass.
  `clip: true` is honoured by pick and by inspect's overlap test.
- The advanced-blend crowd count: a composition with an advanced mode is 1 pass plus what its layers add.

## Proof
`tests/films/composition-group` on WebGPU and WebGL: overlap pixel values for group alpha, multiply and difference; clip inside/outside;
an off-canvas rectangle with a child on screen; a `threeD` card at alpha 0.5; the edge of an anti-aliased circle at alpha 1 vs 0.999.
