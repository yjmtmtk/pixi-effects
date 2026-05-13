// examples/_presets/05-composition-mask.js
export default `new Controller(movie, { canvas });

// Inline-generated tile pattern so the preset is self-contained.
function tilePattern(palette) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 480;
  const ctx = c.getContext('2d');
  const t = 60;
  for (let y = 0; y < 480; y += t) {
    for (let x = 0; x < 480; x += t) {
      ctx.fillStyle = palette[((x / t) + (y / t)) % palette.length];
      ctx.fillRect(x, y, t, t);
    }
  }
  return c.toDataURL();
}

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 7, frameRate: 30,
  background: '#0a0a0f',
  assets: [
    { name: 'tilesA', src: tilePattern(['#ff5577', '#ffaa55', '#5599ff', '#55cc99']) },
    { name: 'tilesB', src: tilePattern(['#aaffcc', '#7799ff', '#ffaadd', '#ffffaa']) },
    { name: 'tilesC', src: tilePattern(['#5599ff', '#ff77aa', '#aaff77', '#ffcc55']) },
  ],
  composition: {
    sequences: [
      // ─── 1) Circular avatar crop ─────────────────────────────
      {
        type: 'composition',
        width: 480, height: 480,
        initial: { x: 'GW * 0.08', y: 'GH/2 - 240' },
        keyframes: [
          { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        sequences: [
          {
            type: 'image', asset: 'tilesA',
            initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
            keyframes: [
              { at: 0, to: { rotation: 360, scale: 1.1 }, duration: 6.5, ease: 'sine.inOut' },
            ],
            mask: {
              type: 'shape', shape: 'circle', radius: 220,
              initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
            },
          },
          {
            type: 'text', text: 'crop',
            initial: { x: 'W/2', y: 'H + 30', anchorX: 0.5, anchorY: 0.5 },
            style: { fontSize: 'GW * 0.022', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
          },
        ],
      },

      // ─── 2) Iris reveal: mask itself is animated ────────────
      {
        type: 'composition',
        width: 480, height: 480,
        initial: { x: 'GW/2 - 240', y: 'GH/2 - 240' },
        keyframes: [
          { at: 0.3, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        sequences: [
          {
            type: 'image', asset: 'tilesB',
            initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
            mask: {
              type: 'shape', shape: 'circle', radius: 240,
              initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff', scale: 0 },
              keyframes: [
                { at: 0, to: { scale: 1 }, duration: 1.4, ease: 'power2.out' },
                { at: 3, to: { scale: 0.6 }, duration: 0.6, ease: 'sine.inOut' },
                { at: 3.6, to: { scale: 1 }, duration: 0.6, ease: 'sine.inOut' },
              ],
            },
          },
          {
            type: 'text', text: 'iris reveal',
            initial: { x: 'W/2', y: 'H + 30', anchorX: 0.5, anchorY: 0.5 },
            style: { fontSize: 'GW * 0.022', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
          },
        ],
      },

      // ─── 3) Knockout: maskInverted punches a hole ───────────
      {
        type: 'composition',
        width: 480, height: 480,
        initial: { x: 'GW * 0.92 - 240', y: 'GH/2', pivotX: 240, pivotY: 240 },
        keyframes: [
          { at: 0.6, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: 1, to: { rotation: 360 }, duration: 5, ease: 'sine.inOut' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        sequences: [
          {
            type: 'image', asset: 'tilesC',
            initial: { x: 'W/2', y: 'H/2', anchorX: 0.5, anchorY: 0.5 },
            maskInverted: true,
            mask: {
              type: 'shape', shape: 'circle', radius: 100,
              initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
              keyframes: [
                { at: 1.5, to: { radius: 160 }, duration: 1.5, ease: 'sine.inOut' },
                { at: 3,   to: { radius: 100 }, duration: 1.5, ease: 'sine.inOut' },
              ],
            },
          },
          {
            type: 'text', text: 'maskInverted',
            initial: { x: 'W/2', y: 'H + 30', anchorX: 0.5, anchorY: 0.5 },
            style: { fontSize: 'GW * 0.022', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
          },
        ],
      },

      // ─── Title bar at the top ──────────────────────────────
      {
        type: 'text', text: 'composition + mask',
        initial: { x: 'GW/2', y: 'GH * 0.08', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0, from: { alpha: 0, y: 'GH * 0.04' },
                   to:   { alpha: 1, y: 'GH * 0.08' },
                   duration: 0.5, ease: 'power3.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.04', fill: '#ffffff', fontWeight: 'bold' },
      },
    ],
  },
});
`;
