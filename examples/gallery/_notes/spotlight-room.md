# spotlight-room — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 5 runs of `check` (1 write, 3 look-and-adjust, 1 full export)   Result: works

Piece: 1280x720, 9.5 s, 30 fps, "Spotlight". A dark room of `threeD` layers: a back wall (z -350), a floor laid flat, a skirting board, and three pictures (frame + gradient picture + a small shape, z -150) that a moving `spot` light picks out one after another (hold, sweep, hold, sweep, hold), each with a caption. They throw shadows on the wall. At 7.7 s the "house lights" come up (the cone opens to 66 deg, ambient 0.27 -> 0.42) and the end card lands. A slow dolly (`offsetZ`) and drift (`offsetX`) on the camera, fog on the camera, one ambient + one spot light, six short `sfx`.
Check: warnings none (every run), layout none, audio no issues, export mp4 814 KB, 9.53 s video / 9.535 s audio. The `light` line is printed per `--at` moment. Mix is -27.5 LUFS (the check calls it quiet for web video; left on purpose: it is a few clicks and one chime).

## Went smoothly because the docs said so
- The recipe `spot-room` was almost the whole lighting setup: ambient + spot with `lookAtX` and `x` moving together, `castsShadows` on the light and on each frame. It worked at the first run, no warning at any point.
- Rule 5 / pitfall 88 ("put the layer's origin at its far edge so it sorts behind what stands on it") told me to give the floor `anchorY: 0` at the wall's foot. The floor, the wall and the skirting (z -349 vs wall -350, floor equal z with the wall and later in the array) sorted correctly on the first try.
- "A white ambient at 1 is no light" + "what no light reaches is black" made me use a cool low ambient (0.27, `#7d8cc4`); the unlit pictures stay readable and the lamp is warm: the palette came from the two lights.
- `lit` numbers from `check --at` were useful for "is the lamp where I think it is" (frame frames: dusk 0.92 at 1.5 s, tide 0.92 at 4.4 s, everything else = the ambient 0.15).
- "Lights keep the length of the scene" (rule 3): I gave the lights no `at` / `duration`, so none of the "no light alive" trap.
- The `sfx` object form (`sfx: { preset: 'click', pitch: -7 }`) is in the cheatsheet and worked for lowering the pitch of the click so it sounds like a lamp switch.

## How the room's depth order held up
Fine for this layout, and I looked for trouble. Layers sort by origin z: wall -350, floor -350 (array order after the wall), skirting -349, picture frame -150, picture -146, small shapes on it -142. None of them cross, so the draw order was right at every frame I looked at, including during the dolly (-140 on the camera) and the sideways drift. A shape standing on a picture needs a z a few px in front of it; that is all it took. What I could not do: a floor that visibly meets the wall at an angle where the pictures cast onto it (the pictures hang on the wall, so only the wall and the skirting receive shadows), and a free-standing object in the room (it would need its own z between wall and camera: fine for one object, but I did not try planes that cross). The camera drift shows the pictures in slight perspective (frames skew a little), which also hides that they are flat.
The floor itself is the weakest part of the piece: it is near black (ambient only) and the spot cone ends at the skirting, so it reads as a dark band, not as a floor. I did not verify its tilt direction with a bright light on it; `rotationX: 90` with `anchorY: 0` laid it toward the viewer, which is what the picture shows (a band below the wall, dark), but I could not prove it from the picture.
Fog: set on the camera (`fogNear: 1000, fogFar: 2400, fogColor` = the ground colour, `fogAmount: 0.8`). The wall sits 1350-1500 from the camera, so it is mixed only about 10-20 % toward the ink: it is a mild depth cue (the wall is darker than the pictures), I never A/B-ed it and I cannot say from the pictures how much of the wall's darkness is fog and how much is ambient.

## Stumbles
### 1. The light was "on" per the numbers and I saw no light on the wall   [GAP]
- tried: first version, wall 2500x1400, pictures 250-380 px wide, spot `coneAngle` 30, lamp 330 px to the left and 360 above the picture.
- happened: `check --at` said `wall 1.05` while the picture showed a dark wall with only the picture frame bright and a big dark slab to the lower right. Nothing in the picture looked like a beam on a wall.
- cause: my geometry. The cone on the wall (800 + 200 px from the lamp, half angle 15 deg) is about 270 px in radius, the frame was 220 px, so the pool was mostly hidden BEHIND the frame, and the (hard, offset 60-90 px) shadow of the frame covered what was left. The `light` number is "how lit the layer's MIDDLE is" and the middle of the wall was behind the picture; it told me the lamp reached the wall, not that I could see it.
- would have prevented it: in dsl.md "Lights", one line on how to plan the pool: "a spot's pool has radius `distance x tan(coneAngle / 2)`; a layer farther from the lamp gets a bigger pool; to see the pool on a wall around a picture, the pool must be larger than the picture, and the shadow is the picture's outline shifted by about `gap x lateral offset of the lamp / distance`". The recipe `spot-room` has cards 300x200 with a 34 deg cone at about 960 px: the same trap in a smaller form.
- fix: smaller pictures (210x290, 330x224, 250x250 plus an 18 px frame), 36 deg cone, lamp 280 left / 320 above: the pool (radius about 300 on the wall) now clearly rings the picture and the shadow shows inside it.

### 2. `check`'s light line shows only the first 8 layers   [TOOLING]
- tried: `--at 1.2,4.4,6.8,9.3` and read the `light` lines.
- happened: each line ends in `…` after 8 layers (wall, floor, skirting, dusk x3, tide x2). The third picture, the one I was lighting at 6.8 s, never showed. At 6.8 s the line read "everything 0.11" which looked like a failure until I opened the picture.
- would have prevented it: print the layers that are lit above the ambient first (or the brightest 8), or print every threeD layer in `report.json` and say so; or sort by "most lit".

### 3. The shadow is a big hard slab unless it is softened, and the docs did not give a size for it   [GAP]
- tried: default `shadowDiffusion` (0).
- happened: each shadow was a crisp dark rectangle the size of the frame, shifted 60-90 px: it read as a dark sheet behind the picture, not as a shadow.
- cause: it IS the outline of the flat picture, with the lamp this close and 200 px between picture and wall. dsl.md says "wider the farther the shadow falls": true, but "a card near the wall has a sharp shadow" is the hint I needed to read first. I set `shadowDiffusion: 16` and `shadowDarkness: 0.8`; that reads as a lamp-on-a-wall shadow. Cost: one light, no problem.
- would have prevented it: the recipe could set `shadowDiffusion` (it says "hard by default" only in the prose) so that the first copy-paste already looks natural; and a sentence "a lamp near a card = a big offset shadow, move the lamp further or the card nearer to the wall for a tight one".

### 4. `sfx` cut off by the end of the movie   [MY-MISTAKE]
- tried: a `chime` (1.4 s) at 8.2 s in a 9.5 s movie.
- happened: `check`: `unnamed audio layer (sfx "chime") is cut off by the end of the movie at 9.5s (it runs to 9.60s)`. It names the layer by its number, not the sound's `at`.
- cause: I did not add the length. Fixed by moving the chime to 8.0 s. The message was clear, only "unnamed" made me search (sfx layers have no `name`; I could give them one).
- would have prevented it: `name` on the sfx layer in the recipes, or putting the time in the message ("starts 8.2 s").

### 5. Nothing warned about the layout I had; the quality was only visible in the picture   [by design, one line]
- No warning ever fired (no "ambient missing", no shadow half missing, nothing about the cone). That is correct, the scene was right by the rules; the real problems (1 and 3) are art direction, and only the contact sheet showed them. No change asked: it is good that the build says nothing when nothing is wrong.

## Surprises (neither wrong nor documented)
- A thin picture-frame highlight at the frame's edges (the lit frame being brighter than the picture inside) came for free from the cone feather; I liked it, but it means a cream frame clips to white at intensity 1.15: I changed the frame to a brass `#c8b48a` and the lamp to 1.0.
- A caster that is outside the pool still throws its shadow into the pool: the neighbouring pictures' shadows appear in the lit patch (visible at 1.5 s and 4.4 s). Physically right, and nice, but I did not expect shadows from layers the lamp does not light. The docs say "up to 4 casters per receiver"; they do not say that casters need not be lit.
- The light's colour and the layers' own colours multiply: the warm lamp over the cool picture teal gave a dull cream, so I made the pictures more saturated than I wanted them to look on screen.
- Fog: `fogColor` equal to the 2D ground made the wall's far parts sink into the ground colour at the top corners exactly as the docs promised (the "draw the background in the fog colour" advice worked).

## Wished the library had
- A way to ask for "the pool": `inspect` could give, for a spot light, its pool's centre and radius at a given z (a circle in canvas px), so the pool can be placed around a picture without trigonometry.
- A `light` number per layer that counts the whole layer (area lit above ambient), not only its middle.
- A floor/wall helper: `{ type: 'shape', shape: 'rect', plane: 'floor' }` that places the origin at the far edge and rotates, with the sign of `rotationX` handled. I guessed 90 and it was right, but the docs never say which way `rotationX` tilts the top edge.
- A named `sfx` layer in `inspectAudio` messages.

## Reusable pattern worth adding to ai/reference/recipes.md (optional)
A room where a lamp visits pictures: the lamp position is derived from the picture's, so both lamp and look-at move in one keyframe (the pool is wider than the picture and the shadow falls down-right):

```js
const lampAt = (p) => ({ x: p.x - 280, y: p.y - 320, lookAtX: p.x, lookAtY: p.y });
const sweep = (at, p) => ({ at, to: lampAt(p), duration: 1, ease: 'cubic-bezier(.5, 0, .2, 1)' });
{ type: 'light', kind: 'spot', castsShadows: true,
  initial: { ...lampAt(PICS[0]), z: 650, lookAtZ: -150, coneAngle: 36, coneFeather: 0.35, intensity: 1, color: '#ffe3b8', shadowDarkness: 0.8, shadowDiffusion: 16 },
  keyframes: [sweep(3, PICS[1]), sweep(5.6, PICS[2])] }
// a floor: far edge at the wall's foot, laid flat toward the viewer
{ type: 'shape', shape: 'rect', width: 2600, height: 900, anchorX: 0.5, anchorY: 0, threeD: true, initial: { x: 640, y: 600, z: -350, rotationX: 90, fillColor: '#3a3542' } }
```
