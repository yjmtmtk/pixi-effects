# three-product-spin — stumble notes
Model: opus   Cycles: 7   Result: works

Piece: `examples/gallery/three-product-spin.html` — 1280×720, 12 s, 30 fps. One `three` layer (resolution 1.5) + ~45 2D layers + 7 audio layers.
Export: `render({ format: 'mp4' })` → 1,292,935 bytes in 7.6 s; a decoded frame of the MP4 matches `snapshot`. `__logs` = `[]` on every run; `inspect` issues = `[]` at frames 20/100/120/170/236/246/262/280/310/359.

## Went smoothly because the docs said so
- `registerThree()` + `three({ setup → { camera, objects } })` + `'three.<obj>.<path>'` keyframes worked first try, including paths into **materials** (`'three.ringMat.emissiveIntensity'`, `'three.discMat.color.r'`, `'three.discMat.clearcoat'`) — `objects` takes any object, not only Object3Ds.
- The metallic-three.js recipe line "lights alone make metal look black; build the environment yourself, `three/addons` is not in the importmap" saved a cycle: a vertex-coloured gradient dome + five HDR `MeshBasicMaterial` planes (colour 3–9) → `PMREMGenerator.fromScene()` gives a RoomEnvironment-like studio with no lights at all.
- The round-one note (film-titles) that the three layer is **transparent** let me put the studio-white / graphite backgrounds in 2D behind it and cross-fade them with plain rects.
- The same note's warning that the camera keeps its orientation when only its position is animated led me to a **camera rig**: a `Group` at the look-at point with the camera as a child on +z; keyframing `rig.rotation.x`, `rig.position.*` and `camera.position.z` orbits / trucks / dollies and always stays aimed. No `update()` needed.
- 2D callouts pinned to the 3D product: the build-time code constructs the same rig + `PerspectiveCamera` and calls `Vector3.project()` → canvas px. The dots landed exactly on the surface first try (the body is rotationally symmetric, so the turntable spin does not move them).
- New in round two: a rect growing from `width: 0` (`anchorX: 0` / `1`) draws correctly after a seek — the leader lines use it with no workaround. Masks sharing the layer's lifetime made the slide-out-of-the-line text reveals one helper. `{value}` counter for "30 h playback", `set` keyframes for the "SPEC 0{value} / 04" index; both behaved.
- One-shot sfx without `duration`, `loop: true` bgm without `duration`, volume fade with negative `at`: no warnings.

## Stumbles
### 1. Clearcoat ignores `envMapIntensity`, so the "dark" floor stayed light grey   [GAP — three.js, worth a doc line]
- tried: darken the glossy floor disc for the graphite end by keyframing `'three.discMat.color.*'` and `'three.discMat.envMapIntensity': 0.3`.
- happened: the disc still read as mid grey at a grazing camera angle. Confirmed by reading the live material (values applied) and then setting `clearcoat = 0` live — the disc went dark.
- cause: the clearcoat layer's environment reflection dominates at grazing angles (Fresnel) and did not follow `envMapIntensity` enough to matter.
- fix: keyframe `'three.discMat.clearcoat'` down to 0.1 together with the colour.
- would have prevented it: in the metallic-three.js recipe: "a glossy floor at a low camera angle mirrors the environment; to darken it, lower `clearcoat` / raise `roughness`, not only `color`".

### 2. No real reflection: mirrored copy + depth-fade shader by hand   [GAP → hand-roll]
- tried: a reflective floor. `Reflector` is in `three/addons` (not in the importmap); the renderer has `stencil: false` (seen via `getContextAttributes()`), so a stencil-masked mirror is out too.
- did: `group.clone()` with `scale.y = -1`, every material cloned with `onBeforeCompile` multiplying `gl_FragColor.a` by a world-y fade, drawn under a translucent (opacity 0.6) floor disc with `renderOrder`. My first version multiplied the whole `gl_FragColor` (rgb too) → the reflection was nearly invisible (alpha squared); then the fade depth was too long and the mirrored copy poked out below the disc's front edge. Keep the fade shorter than where the camera ray leaves the disc.
- would have prevented it: a recipe (pasted below), or the three layer exposing `stencil: true` / a `rendererOptions` field so `Reflector`-style stencil tricks work.

### 3. Which renderer settings may I change?   [GAP]
- tried: `ctx.renderer.toneMapping = THREE.NeutralToneMapping; toneMappingExposure = 1.12` inside `setup`.
- happened: worked, but the docs do not say whether the layer owns tone mapping / output colour space / pixel ratio, or whether `resolution` interacts with `setPixelRatio`. I also had to find the context attributes (alpha, premultipliedAlpha, antialias true, stencil false) by walking `movie` internals.
- would have prevented it: one table in `docs/dsl.md#three`: "the renderer is created with `{ alpha: true, antialias: true, premultipliedAlpha: true, stencil: false }`, no tone mapping; you may set `toneMapping`, `toneMappingExposure`, `localClippingEnabled` in `setup`".

### 4. `?poster` is dropped by the static server's `.html` redirect   [TOOLING]
- `http://localhost:5190/examples/gallery/three-product-spin.html?poster` redirects to the extension-less URL and loses `?poster` (pitfall 30c says so). Opening `/examples/gallery/three-product-spin?poster` worked (`movie.currentFrame === 246`). The BRIEF could give that URL form.

### 5. Emissive accent goes salmon under tone mapping   [MY-MISTAKE]
- `emissiveIntensity: 2.4` on an orange ring desaturated to pink under `NeutralToneMapping`; 1.25 keeps the accent orange. Not a library issue; worth a half-line in the recipe ("emissive > ~1.5 washes out under tone mapping").

### 6. Exit timing of a helper-built group drifted apart   [MY-MISTAKE / GAP]
- My `revealText()` faded its text at `-0.35` from the layer's end while the leader lines retracted at an absolute time; the battery label lingered alone for 0.3 s (caught on a contact sheet of the transition). A group/parent layer with a shared exit would make this impossible; I aligned the `until` values by hand.

## Wished the library had
- A documented renderer contract for `three` layers (attributes, who owns tone mapping), and an option to request `stencil: true`.
- `ctx.objects` in `update` (film-titles asked too) — I avoided `update` entirely by using the camera-rig pattern.
- A helper to project a three-space point to composition px for a given layer/time (`three.project('camera', [x,y,z], t)`), so 2D annotations can follow a moving 3D camera without duplicating the camera in user code.
- Group / parent layers with shared enter / exit (callout = dot + halo + line + end dot + 2 texts = 6 layers × 4).
- Stroke draw-on for lines at any angle (only horizontal/vertical leaders are possible via `width` growth).

## Reusable pattern worth adding to ai/reference/recipes.md (optional; paste the code)
```js
// @docs-only — camera rig: animate an aimed camera with plain keyframes (no update())
const rig = new THREE.Group(); rig.position.set(0, 1.35, 0); rig.rotation.x = -0.16;   // look-at point + elevation
const camera = new THREE.PerspectiveCamera(30, ctx.width / ctx.height, 0.1, 100);
camera.position.z = 9.2; rig.add(camera); ctx.scene.add(rig);
return { camera, objects: { camera, rig } };
// keyframes: 'three.rig.rotation.x' (tilt), 'three.rig.rotation.y' (orbit), 'three.rig.position.x' (truck), 'three.camera.position.z' (dolly)

// @docs-only — pin 2D callouts to a 3D point: rebuild the same rig at build time and project
function project([x, y, z], pose /* { x, y, rx, z } */) {
  const rig = new THREE.Group(); rig.position.set(pose.x, pose.y, 0); rig.rotation.x = pose.rx;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100); cam.position.z = pose.z; rig.add(cam);
  rig.updateMatrixWorld(true);
  const v = new THREE.Vector3(x, y, z).project(cam);
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];        // canvas px for a full-canvas three layer
}

// @docs-only — fake glossy-floor reflection (no Reflector in the importmap, no stencil buffer)
function mirrorMaterial(mat, fadeDepth = 0.6, strength = 0.7) {
  const m = mat.clone(); m.transparent = true;
  m.onBeforeCompile = (s) => {
    s.vertexShader = 'varying float vMirY;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vMirY = (modelMatrix * vec4(transformed, 1.0)).y;');
    s.fragmentShader = 'varying float vMirY;\n' + s.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>\n  gl_FragColor.a *= ${strength} * pow(clamp(1.0 + vMirY / ${fadeDepth}, 0.0, 1.0), 1.7);`);
  };
  m.customProgramCacheKey = () => 'mirror-fade';
  return m;
}
const mirror = product.clone(true); mirror.scale.y = -1;
mirror.traverse(o => { if (o.isMesh) { o.material = mirrorMaterial(o.material); o.renderOrder = 1; } });
// floor: MeshPhysicalMaterial({ transparent: true, opacity: 0.6, clearcoat: 1 }), renderOrder 2, top face at y = 0
```
