// examples/_presets/11-depth.js
export default `// Injected: movie (Movie instance), Controller (class), canvas (HTMLCanvasElement).
// 2.5D: threeD layers + a camera layer. +z is toward the viewer; rotations are degrees.
new Controller(movie, { canvas });

// A card = a small composition lifted into depth (pivot at the centre).
const card = (name, label, color, x, y, z, extra = {}) => ({
  type: 'composition', name, width: 360, height: 220, threeD: true,
  initial: { x, y, z, pivotX: 180, pivotY: 110 },
  sequences: [
    { type: 'shape', shape: 'rect', width: 360, height: 220, cornerRadius: 24,
      initial: { x: 180, y: 110, fillColor: color } },
    { type: 'text', text: label,
      style: { fontSize: 36, fill: '#ffffff', fontWeight: 'bold', fontFamily: 'system-ui, sans-serif' },
      initial: { x: 180, y: 110, anchorX: 0.5, anchorY: 0.5 } },
  ],
  ...extra,
});

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 8, frameRate: 30,
  background: '#0a0a0f',
  composition: {
    sequences: [
      { type: 'shape', shape: 'rect', width: 'GW', height: 'GH', initial: { x: 'GW/2', y: 'GH/2', fillColor: '#101830' } },
      // Camera moves sideways (parallax), then only fov animates (dolly zoom).
      { type: 'camera',
        keyframes: [
          { at: 0, from: { x: 'GW/2 - 260', lookAtX: 'GW/2 - 260' },
                   to:   { x: 'GW/2 + 260', lookAtX: 'GW/2 + 260' }, duration: 4, ease: 'sine.inOut' },
          { at: 4.5, to: { fov: 70 }, duration: 3, ease: 'sine.inOut' },
        ] },
      card('far',   'z -600', '#31507a', 'GW/2 - 420', 'GH/2 - 90', -600),
      card('far2',  'z -300', '#3a6ea5', 'GW/2 + 380', 'GH/2 + 80', -300),
      card('mid',   'z 0',    '#d96a3a', 'GW/2',       'GH/2',       0, {
        keyframes: [{ at: 1, to: { rotationY: 360 }, duration: 3, ease: 'power2.inOut' }],
      }),
      card('near',  'z +250', '#38a169', 'GW/2 - 360', 'GH/2 + 120', 250),
      card('near2', 'z +450', '#b794f4', 'GW/2 + 470', 'GH/2 - 130', 450),
    ],
  },
});
`;
