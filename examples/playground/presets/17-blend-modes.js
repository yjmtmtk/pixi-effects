// examples/playground/presets/17-blend-modes.js
export default `// BLEND MODES: a layer mixes with everything BELOW it. Eighteen CSS names: soft-light for a colour cast, color-dodge for a light
// leak, multiply for a vignette, overlay for contrast ... Each of these is ONE layer (a gradient): the modes beyond add / screen / multiply
// cost a full-frame pass each.

const W = 1280, H = 720, FPS = 30, DURATION = 6;
const BACKGROUND = '#0d1220';

// a dusk sky and a skyline
const sky = { type: 'shape', shape: 'rect', name: 'sky', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, initial: { x: 0, y: 0 },
  fillGradient: { stops: [[0, '#2a3b66'], [0.55, '#8a5a78'], [1, '#e8a060']] } };
const skyline = Array.from({ length: 9 }, (_, i) => ({
  type: 'shape', shape: 'rect', name: 'block-' + i, width: 90 + (i % 3) * 30, height: 160 + ((i * 53) % 190), anchorX: 0, anchorY: 1,
  initial: { x: 40 + i * 140, y: 650, fillColor: '#0d1220' },
}));

const sequences = [
  sky,
  ...skyline,
  // soft-light: a colour cast, orange at the top, blue at the bottom; it fades in
  { type: 'shape', shape: 'rect', name: 'cast', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, blendMode: 'soft-light', initial: { x: 0, y: 0, alpha: 0 },
    fillGradient: { stops: [[0, '#ff9a3c'], [1, '#3c5bff']] },
    keyframes: [{ at: 0.5, to: { alpha: 0.9 }, duration: 2, ease: 'sine.inOut' }] },
  // color-dodge: a light leak that burns out toward white as it drifts in from the right
  { type: 'shape', shape: 'circle', name: 'leak', radius: 380, blendMode: 'color-dodge', initial: { x: 1500, y: 140 },
    fillGradient: { type: 'radial', stops: [[0, 'rgba(255,120,30,0.9)'], [1, 'rgba(255,120,30,0)']] },
    keyframes: [{ at: 1, to: { x: 900 }, duration: 3.5, ease: 'power2.out' }] },
  // multiply: a vignette, clear in the middle and dark at the corners
  { type: 'shape', shape: 'rect', name: 'vignette', width: 'GW', height: 'GH', anchorX: 0, anchorY: 0, blendMode: 'multiply', initial: { x: 0, y: 0 },
    fillGradient: { type: 'radial', radius: 0.8, stops: [[0.5, 'rgba(255,255,255,1)'], [1, 'rgba(60,60,80,1)']] } },
  { type: 'text', text: 'blend modes', name: 'title', style: { fontSize: 64, fill: '#f6efe6', fontFamily: 'Georgia, serif', letterSpacing: 6 },
    initial: { x: 'GW/2', y: 140, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 1.5, to: { alpha: 1 }, duration: 1 }] },
];

const POSTER = 4.5;
`;
