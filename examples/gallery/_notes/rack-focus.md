# rack-focus — stumble notes
Model: sonnet (Claude Sonnet 5.5, self-reported)   Cycles: 4 (1 write, 3 look-and-adjust, plus 1 inspect run)   Result: works

Piece: 1280x720, 8 s. Near badge (z +250), title + caption (z 0), small sign (z -600), a field of lamps (three threeD cards at z -720 / -880 / -1100), a camera with a slow dolly and three `focus` keyframes: badge -> title (1.4-2.4 s), title -> sign (3.2-4.5 s), sign -> title (5.7-6.7 s), then a held end frame. `aperture` 58 throughout. Sound: a shutter click, a muted swoosh on each pull, a chime on each landing.

## Went smoothly because the docs said so
- `{ type: 'camera', initial: { focus: 'badge', aperture } }` plus `to: { focus: 'title' }` keyframes worked first time, names included (dsl.md "a layer name works there too"; recipe `rack-focus` is a complete model). The focus lands exactly: `inspect` shows `depthBlur: 0` for the named layer at the end of every pull.
- pitfalls 75 + dsl.md ("a nested threeD composition is blurred as one layer") told me up front that 20+ blurred layers warn, so I built the far lamp field as THREE threeD cards (one blur each, ~14 lamps per card) instead of 40 layers. No warning, cheap.
- "equal z keeps array order" let a sign panel and its text share z -600 and stay one blur / one depth.
- `inspect` now reports `depthBlur`: I could verify the story with numbers (below) instead of guessing from the picture.
- Warnings: none on any run; `window.__logs` is `[]`.

## inspect depthBlur (px) at the end of each pull (aperture 58, dolly running)
| t | focus | badge z+250 | title/caption z0 | sign z-600 | lamps -720 / -880 / -1100 |
|---|---|---|---|---|---|
| 0.5 s | badge | 0 | 9.8 | 20.8 | 22.1 / 23.5 / 25.1 |
| 2.4 s | title | 10.1 | 0 | 11.2 | 12.5 / 13.9 / 15.6 |
| 3.85 s (mid pull 2) | between | 19.9 | 9.4 | 2.1 | 3.5 / 4.9 / 6.6 |
| 4.5 s | sign | 22.4 | 11.7 | 0 | 1.3 / 2.8 / 4.5 |
| 6.7 s | title | 11.4 | 0 | 12.1 | 13.5 / 15.0 / 16.7 |
| 7.9 s (end hold) | title | 11.5 | 0 | 12.2 | 13.6 / 15.1 / 16.8 |
Export: mp4 1.20 MB, video 8.03 s, audio 8.02 s, -23.4 LUFS, no issues.

## Stumbles
### 1. My blur estimate was far too small for a near layer and the far field   [GAP]
- tried: planned the look from the dsl.md table ("aperture 60 -> 8.6 px at z -400, focus on z 0").
- happened: the table only covers focus on z = 0 and one far z. With focus on the sign (z -600) the badge at z +250 blurs 22 px, and with focus on the badge the lamps at z -1100 blur 25 px (the cap is 32). Not wrong, just 2-3x what I pictured; I only learned it from `inspect`.
- cause: the radius is `aperture x focal x |1/depthLayer - 1/depthFocus| / 2` and near layers (small depth) change fast. The docs give the formula but no near-layer or "focus on a far layer" example.
- would have prevented it: one extra row in the dsl.md table: "focus z 0, layer at z +250 -> 5.1 px at aperture 30 / 9.8 px at 58" and a sentence "a layer in front of the focus blurs MORE per unit of z than one behind it". Or a tiny `depthBlur(z, focus, aperture)` helper exported for planning.

### 2. Sizing a card for a far field is arithmetic nobody gives you   [GAP]
- tried: a lamp card at z -720 needs to cover the frame; at depth it is drawn at `camZ / (camZ - z)` (0.58x), so a 1280x720 card covers only a 750x420 patch of the frame.
- happened: I derived `s = 989.1 / (989.1 - z)`, card = `1280/s + margin` by `720/s + margin`, lamp radius on screen / s. It is easy but I had to work it out.
- would have prevented it: a recipe ("bokeh field in cards": the function `lampCard` below) or one line in dsl.md under "nested threeD composition": "to fill the frame at depth z, make the card (W / s) x (H / s) with s = camZ / (camZ - z)".

### 3. Camera `z` is automatic until you animate it; I hard-coded 989.1   [GAP]
- tried: a slow dolly (`z` 989.1 -> 925).
- happened: `to: { z: 925 }` needs a known start, so I wrote `initial: { z: 989.1 }` (= 360 / tan 20 deg) by hand; any `fov` change would break it. It worked, but 989.1 is a magic number and the docs only say "auto = (H/2)/tan(fov/2)".
- would have prevented it: say in the camera table that `to: { z }` alone is fine/not fine, or allow an expression (`'camZ - 60'`), or a `dolly` preset next to `cameraPath`.

### 4. `check` does not show `depthBlur`; I needed a browser by hand   [TOOLING]
- tried: `node ai/tools/check.mjs ... --at ...` to read the blur numbers.
- happened: the contact sheet shows the blur but the numbers (`depthBlur`) are only in `movie.inspect`, which check summarises into issues only; `report.json` has no `depthBlur`. I started a static server and used a browser to call `movie.inspect(frame)`. Also `check.mjs --help` is rejected ("unknown option --help") although the brief and the task text suggest it.
- would have prevented it: `--at` could print `depthBlur` per named threeD layer (or `check --inspect-frames 2.4,4.5` printing the visible layers); and `--help` printing the header.

### 5. Seeded lamp layout changed when I added a rule   [MY-MISTAKE, minor]
- I added a rejection loop ("no lamps behind the title band") after looking at the first sheet; it consumes `random()` draws, so every lamp moved. Obvious in hindsight (seeded = same sequence only for the same calls); to keep a good layout, draw x, y, radius, colour in fixed order and reject by skipping, not by redrawing.

### 6. Soft title lets a lamp shine through   [expected, noted]
- A blurred text layer has semi-transparent edges, so an in-focus bright lamp behind it shows through the letters (visible around 4.5 s). Real lenses do this too, but it hurt the small caption's legibility, so I kept lamps out of the title band at start. No docs change needed; maybe a line in pitfall 75: "a blurred layer is see-through at its edges".

### 7. Low sfx level   [TOOLING, minor]
- First mix was -30.9 LUFS (check says "quiet for web video"). `volume` 1.3 on the chime and 0.7 on the swoosh brought it to -23.4 LUFS; sparse sfx never reach -14. Worth knowing: for a sfx-only piece, check's note is expected and 1.0-1.5 is the right range.

## Wished the library had
- `focus` with a lens-style "breathing" overshoot: a rack focus that overshoots and settles (focus hunting) is a classic look; `back.out` on a name-to-name tween is untested (I kept `cubic-bezier(.6,0,.2,1)`).
- A bokeh helper: `lamps({ z, count, size, colors, seed })` returning a card, since it is the natural partner of depth of field and the "20 blurred layers" warning pushes everyone to build cards by hand.
- A depth-of-field value that can be animated by name AND by layer (`focus: 'title'` follows a layer whose z moves; it warns today).

## Reusable pattern worth adding to ai/reference/recipes.md (a far field of lamps in cards: one blur per card)
```js
// camZ = (H/2)/tan(fov/2) = 989.1 at 720p, fov 40
function lampCard(name, z, seed, count, sizePx, drift) {
  const s = 989.1 / (989.1 - z);                         // drawn size at this depth
  const cw = Math.ceil(1280 / s + 300), ch = Math.ceil(720 / s + 200);   // big enough to fill the frame
  const r = random(seed);
  const lamps = Array.from({ length: count }, () => ({
    type: 'shape', shape: 'circle', radius: (sizePx[0] + r() * (sizePx[1] - sizePx[0])) / s,
    initial: { x: r() * cw, y: r() * ch, fillColor: ['#ffb84d', '#35d0c0', '#ff5a4e'][Math.floor(r() * 3)], fillAlpha: 0.35 + r() * 0.35 },
  }));
  return { type: 'composition', name, threeD: true, width: cw, height: ch, sequences: lamps,
           initial: { x: 640, y: 360, z, pivotX: cw / 2, pivotY: ch / 2 },
           keyframes: [{ at: 0, to: { x: 640 + drift }, duration: 8, ease: 'sine.inOut' }] };
}
```
