// examples/playground/presets/16-depth-of-field.js
export default `// DEPTH OF FIELD: the camera's "focus" says which plane is sharp, "aperture" how shallow. A rack focus is a keyframe on "focus".
// Only threeD layers blur, by their distance from the sharp plane. A layer's name in "focus" means that layer's first z.

const W = 1280, H = 720, FPS = 30, DURATION = 6;
const BACKGROUND = '#101626';

const word = (name, text, x, z, fill) => ({
  type: 'text', name, text, threeD: true,
  style: { fontSize: 130, fill, fontFamily: 'sans-serif', fontWeight: '700' },
  initial: { x, y: 360, z, anchorX: 0.5, anchorY: 0.5 },
});

// out-of-focus lights far behind the words
const lights = Array.from({ length: 14 }, (_, i) => ({
  type: 'shape', shape: 'circle', radius: 26 + (i % 4) * 12, threeD: true,
  initial: { x: 90 + ((i * 197) % 1100), y: 80 + ((i * 131) % 560), z: -700 - (i % 3) * 200, fillColor: ['#ffb347', '#6ec6ff', '#ff6f91', '#c4f1be'][i % 4], alpha: 0.9 },
}));

const sequences = [
  // focus: 'near' (a layer's name), aperture: 40 (how shallow; 30 is the default, 0 turns it off)
  { type: 'camera', initial: { focus: 'near', aperture: 40 },
    keyframes: [
      { at: 1.2, to: { focus: 'mid' }, duration: 1, ease: 'power2.inOut' },
      { at: 2.8, to: { focus: 'far' }, duration: 1, ease: 'power2.inOut' },
      { at: 4.4, to: { focus: 'near' }, duration: 1, ease: 'power2.inOut' },
    ] },
  ...lights,
  word('far', 'FAR', 960, -300, '#6ec6ff'),
  word('mid', 'MID', 640, -100, '#ffd166'),
  word('near', 'NEAR', 320, 150, '#ef476f'),
];

const POSTER = 0.3;
`;
