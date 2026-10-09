// examples/playground/presets/19-light.js
export default `// LIGHT AND SHADOW: a light layer lights every threeD layer of the composition. An ambient light keeps the room from going black, a spot
// light sweeps across three cards, and the cards throw shadows on the wall behind them. A shadow needs castsShadows on the light AND on the
// layer. What no light reaches is black; layers are drawn in distance order (no depth buffer), so the wall is a big layer far behind.

const W = 1280, H = 720, FPS = 30, DURATION = 6;
const BACKGROUND = '#05070d';

const card = (name, x, fill) => ({
  type: 'shape', shape: 'rect', name, width: 300, height: 200, anchorX: 0.5, anchorY: 0.5, threeD: true, castsShadows: true,
  initial: { x, y: 300, z: 0, fillColor: fill },
});

const sequences = [
  { type: 'light', kind: 'ambient', initial: { intensity: 0.18 } },
  { type: 'light', kind: 'spot', castsShadows: true,
    initial: { x: 160, y: -120, z: 700, lookAtX: 260, lookAtY: 330, lookAtZ: 0, coneAngle: 34, coneFeather: 0.7, intensity: 1.1, shadowDiffusion: 14 },
    keyframes: [{ at: 0.5, to: { x: 1100, lookAtX: 1020 }, duration: 4.5, ease: 'sine.inOut' }] },
  { type: 'shape', shape: 'rect', name: 'wall', width: 1800, height: 900, anchorX: 0.5, anchorY: 0.5, threeD: true,
    initial: { x: 640, y: 300, z: -260, fillColor: '#6b7280' } },
  card('a', 300, '#e0a458'), card('b', 640, '#58a4e0'), card('c', 980, '#e05876'),
  { type: 'text', text: 'light', name: 'title', style: { fontSize: 56, fill: '#f6efe6', fontFamily: 'Georgia, serif', letterSpacing: 8 },
    initial: { x: 'GW/2', y: 640, anchorX: 0.5, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 1, to: { alpha: 0.9 }, duration: 1 }] },
];

const POSTER = 2.6;
`;
