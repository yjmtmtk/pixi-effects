# Changelog

## 0.3.0

**Breaking**

- Keyframe `at` is now measured from the start of the layer it belongs to (After Effects style); negative `at` counts back from that layer's end. Before, it was measured from the parent composition, so a keyframe with `at: 0` on a layer that starts at `at: 2` ran two seconds before the layer appeared, silently. Layers' own `at` and transitions' `at` are unchanged (composition time). `kenBurns`, `withFade` and transitions emit layer-local times. **Migration:** on a layer with `at: N`, subtract `N` from its keyframes' `at`.

**Fixed**

- Videos inside nested compositions started at the wrong time.
- Text `w` / `h` in expressions were measured before the style was applied.
- Shape geometry written in `initial` (`width`, `anchorX`, …) was silently ignored.
- 2.5D: hidden layers could keep a stale texture (`autoAlpha`), filter output was clipped at the layer edge, and render textures could use excessive memory.

**Added**

- Warnings for the silent failures AI authors hit: keyframe or layer starting after its layer / composition ends, audio shorter than its layer without `loop`, a `threeD` layer hidden behind the camera, transitions on `threeD` layers, `lookAt` equal to the camera position, and more.
- `ai/` (skill, cheatsheet, tested recipes, pitfalls, starter template), `llms.txt`, `llms-full.txt`.

## 0.2.0

- 2.5D layers and camera (`threeD`, `z`, `rotationX/Y`, `{ type: 'camera' }`), the optional `pixi-effects/three` entry, `withFade`, shared-chunk builds.
