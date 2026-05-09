// examples/_presets/shapes.js
export default `new Controller(movie, { canvas });

// Layout — single source of truth so rows / columns stay aligned.
const ROW1 = 'H * 0.50';
const ROW2 = 'H * 0.78';
const COL  = [ 'W * 0.3', 'W * 0.5', 'W * 0.7' ];
const FADE_OUT = { at: -0.5, to: { alpha: 0 }, duration: 0.5 };

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 9, frameRate: 30,
  background: '#0a0a0f',
  composition: {
    sequences: [

      // ── Background panel: rounded rect, slides up from below ──
      {
        type: 'shape', shape: 'rect',
        width: 'W * 0.85', height: 'H * 0.78', cornerRadius: 28,
        initial: {
          x: 'W/2', y: 'H/2',
          fillColor: '#141a2c', fillAlpha: 0.9,
          strokeColor: '#2c3a5e', strokeWidth: 2,
        },
        keyframes: [
          { at: 0, from: { y: 'H + 200', alpha: 0 },
                   to:   { y: 'H/2',     alpha: 1 },
                   duration: 0.8, ease: 'power3.out' },
          FADE_OUT,
        ],
      },

      // ── Header: title + accent underline ──
      {
        type: 'text', text: 'shape primitives',
        initial: { x: 'W/2', y: 'H * 0.22', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 0.4, to: { alpha: 1 }, duration: 0.5 },
          FADE_OUT,
        ],
        style: { fontSize: 'GW * 0.05', fill: '#ffffff', fontWeight: 'bold' },
      },
      {
        type: 'shape', shape: 'line',
        from: [-180, 0], to: [180, 0],
        initial: {
          x: 'W/2', y: 'H * 0.30',
          strokeColor: '#88ccff', strokeWidth: 3,
          scaleX: 0,
        },
        keyframes: [
          { at: 0.7, to: { scaleX: 1 }, duration: 0.6, ease: 'power3.out' },
          FADE_OUT,
        ],
      },

      // ── Row 1: three circles, each interpolating through a different
      //     colour space so the difference is visible side-by-side.
      //     All three ramp red → green over the same window — sRGB on the
      //     left passes through muddy olive, OKLab gives a brighter
      //     orange-tan, OKLCH sweeps through saturated orange.
      ...[
        { space: 'rgb',   label: 'rgb' },
        { space: 'oklab', label: 'oklab' },
        { space: 'oklch', label: 'oklch' },
      ].map((c, i) => ({
        type: 'shape', shape: 'circle', radius: 42,
        colorSpace: c.space,
        initial: { x: COL[i], y: ROW1, fillColor: '#ff0000' },
        keyframes: [
          { at: 1.0 + i * 0.15, from: { alpha: 0, scale: 0 },
                                to:   { alpha: 1, scale: 1 },
                                duration: 0.5, ease: 'back.out(2)' },
          { at: 2.0 + i * 0.15, to: { scale: 1.2 }, duration: 0.5, ease: 'sine.inOut' },
          { at: 2.5 + i * 0.15, to: { scale: 1.0 }, duration: 0.5, ease: 'sine.inOut' },
          { at: 5.0, to: { fillColor: '#00ff00' }, duration: 2.0, ease: 'sine.inOut' },
          FADE_OUT,
        ],
      })),
      // Labels under each circle so the colourspace is obvious in the demo.
      ...['rgb', 'oklab', 'oklch'].map((label, i) => ({
        type: 'text', text: label,
        initial: { x: COL[i], y: 'H * 0.62', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 1.0 + i * 0.15, to: { alpha: 1 }, duration: 0.5 },
          FADE_OUT,
        ],
        style: { fontSize: 'GW * 0.018', fill: '#888', fontFamily: 'Menlo, monospace' },
      })),

      // ── Row 2: triangle (polygon), ellipse, heart (path) ──
      {
        type: 'shape', shape: 'polygon',
        // Equilateral-ish triangle, points relative to its own origin.
        // Auto-centring picks up the bbox, so x, y land on the visual centre.
        points: [[0, -45], [40, 25], [-40, 25]],
        initial: { x: COL[0], y: ROW2, fillColor: '#ffaa55', alpha: 0 },
        keyframes: [
          { at: 3.4, to: { alpha: 1 }, duration: 0.4 },
          { at: 3.4, to: { rotation: Math.PI * 2 }, duration: 4, ease: 'none' },
          FADE_OUT,
        ],
      },
      {
        type: 'shape', shape: 'ellipse', radiusX: 70, radiusY: 42,
        initial: {
          x: COL[1], y: ROW2,
          strokeColor: '#cc66ff', strokeWidth: 4, alpha: 0,
        },
        keyframes: [
          { at: 3.55, to: { alpha: 1 }, duration: 0.4 },
          { at: 4.05, to: { scale: 1.15 }, duration: 0.7, ease: 'sine.inOut' },
          { at: 4.75, to: { scale: 1.0 },  duration: 0.7, ease: 'sine.inOut' },
          // Stroke colour + width tween together — both flow through the
          // same _state pipeline so they stay perfectly in sync.
          { at: 5.45, to: { scale: 1.15, strokeColor: '#88ccff', strokeWidth: 8 },
                      duration: 0.7, ease: 'sine.inOut' },
          { at: 6.15, to: { scale: 1.0,  strokeColor: '#cc66ff', strokeWidth: 4 },
                      duration: 0.7, ease: 'sine.inOut' },
          FADE_OUT,
        ],
      },
      {
        type: 'shape', shape: 'path',
        d: 'M 0 -20 C -30 -50 -70 -10 0 30 C 70 -10 30 -50 0 -20 Z',
        initial: { x: COL[2], y: ROW2, fillColor: '#ff3366' },
        keyframes: [
          { at: 3.7, from: { alpha: 0, scale: 0 },
                     to:   { alpha: 1, scale: 1 },
                     duration: 0.5, ease: 'back.out(2.5)' },
          { at: 5.3, to: { scale: 1.2 }, duration: 0.3, ease: 'power2.out' },
          { at: 5.6, to: { scale: 1.0 }, duration: 0.3, ease: 'power2.in' },
          FADE_OUT,
        ],
      },

    ],
  },
});
`;
