# teatime — stumble notes
Model: sonnet   Cycles: 3 (1 write, 2 look-and-adjust)   Result: works
Note: written by the library's author to put transparent images through a real piece; not a fresh-session trial.

## Went smoothly
- A transparent WebP (lossless alpha) and a transparent PNG load as ordinary `image` assets: no flag, no special case. The cutouts sit in front of the giant "TEA" text and the letters show through every gap (the handle loops, the spout).
- `anchorX: 0.5, anchorY: 1` on the image puts the pot's foot on the shelf line, so `scale` grows it upward and a bob only moves y.
- The shadow is an RGBA PNG with a feathered alpha (640×160, 11 KB, black at 55 % in the middle, 0 at the edge) stretched with `scaleX` / `scaleY`: no blur filter needed.
- Steam is a `path` with `strokeCap: 'round'`, `trimEnd` 0 → 1 then `trimStart` 0 → 1, repeated with finite `repeat` + `repeatDelay`.

## Stumbles
### 1. The giant word was wider than the canvas   [MY-MISTAKE]
- tried: `fontSize: 600` + `letterSpacing: 24` for "TEA".
- happened: the A ran off the right edge. `inspect` did not flag it (the text is meant to be big and behind), so only the contact sheet showed it.
- fix: 470 px, no letter spacing. Measure big display text with `measureText('TEA', style).width` before choosing the size.

### 2. White steam on cream   [TASTE]
- white wisps vanished on the paper; a dark brown at 32 % alpha reads on both the paper and the tan letters.

### 3. Making the cutouts is outside the library   [PROCESS]
- The teapots were lifted from their grey backgrounds with macOS Vision (`VNGenerateForegroundInstanceMaskRequest`) and encoded with `ffmpeg -c:v libwebp -quality 86 -alpha_quality 92`. The same cutouts as PNG are 650–700 KB; as WebP 64–94 KB. WebP with alpha needs Chrome / Edge / Firefox / Safari 16.4+.
