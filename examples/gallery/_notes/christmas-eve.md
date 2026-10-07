# christmas-eve — stumble notes
Model: sonnet   Cycles: 3 (1 write, 2 look-and-fix)   Not a fresh-session trial: written by the library author's own session to show the new `music` layer.

22 s, 1280x720 @ 30 fps, about 360 layers. `__logs` = `[]`. MP4 export 3.4 MB; the only sound is a `music` layer (a 6/8 lullaby written as text: music box, harp-like arpeggio, pad, sine bass) and three quiet sfx.

## What the contact sheet caught
- The subtitle sat on top of the title: `animateText`'s `y` is the TOP of the line box (the text is anchored at its centre, so the visible centre is `y + lineHeight / 2`). Moved the title up.
- The chimney smoke rose through the title: shortened the rise and the scale.
- Additive glows on bright snow read as white blobs under the windows: halved the alpha of the spill glows.

## Went smoothly
- `music` with `grid: 2`, bars of 3 beats (dotted quarter `:1.5`, eighth `:0.5`), `vol` points for a pad that swells in, `tail: 1.5`: no warnings, the export has the sound in every second but the last.
- `particles()` for two layers of snow (far and near) with `sway`; `fillGradient` radial with alpha for every glow (`blendMode: 'add'`).
