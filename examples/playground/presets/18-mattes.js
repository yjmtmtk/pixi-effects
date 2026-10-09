// examples/playground/presets/18-mattes.js
export default `// MATTES AND A LUMA WIPE: name a layer and write its name as the \`mask\` of other layers. The named layer (the matte) is not drawn; it is
// drawn once per frame and cuts every layer that names it. mask: 'band' reads its opacity, { layer, channel: 'luma' } its brightness,
// { layer, invert: true } the opposite, and a list intersects. The scenes are joined by a luma wipe: { kind: 'luma', map: 'radial' }.

const W = 1280, H = 720, FPS = 30, DURATION = 8;
const BACKGROUND = '#0b1020';

const rect = (name, color, extra = {}) => ({ type: 'shape', shape: 'rect', name, width: 1280, height: 720, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: color }, ...extra });
const line = (y, text, mask, fill) => ({
  type: 'text', text, mask, style: { fontSize: 120, fill, fontWeight: 'bold', fontFamily: 'Helvetica, Arial, sans-serif' },
  initial: { x: 640, y, anchorX: 0.5, anchorY: 0.5 },
});

// scene A: one band sweeps right; three lines share it
const sceneA = {
  type: 'composition', name: 'a', at: 0, duration: 5, width: 1280, height: 720,
  sequences: [
    rect('a-bg', '#142142'),
    // the matte: a white band that grows from x = 140 (a rect with anchorX 0 grows to the right)
    { type: 'shape', shape: 'rect', name: 'band', anchorX: 0, anchorY: 0, width: 0, height: 720, initial: { x: 140, y: 0, fillColor: '#ffffff' },
      keyframes: [{ at: 0.4, to: { width: 1000 }, duration: 2, ease: 'power2.inOut' }] },
    line(190, 'ONE MATTE', 'band', '#f6efe6'),                                   // by opacity
    line(360, 'SHARED BY', { layer: 'band', channel: 'luma' }, '#9fd3ff'),       // by brightness
    line(530, 'THREE LAYERS', { layer: 'band', invert: true }, '#ffd166'),       // the opposite: everywhere but the band
  ],
};

// scene B: a calm title card
const sceneB = {
  type: 'composition', name: 'b', at: 4, duration: 4, width: 1280, height: 720,
  sequences: [
    rect('b-bg', '#e8a060', { fillGradient: { stops: [[0, '#e8a060'], [1, '#8a3b5a']] } }),
    { type: 'text', text: 'LUMA WIPE', style: { fontSize: 140, fill: '#fff6ea', fontWeight: 'bold', fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: 8 }, initial: { x: 640, y: 340, anchorX: 0.5, anchorY: 0.5 } },
    { type: 'text', text: "map: 'radial'", style: { fontSize: 44, fill: '#fff6ea', fontFamily: 'Menlo, monospace' }, initial: { x: 640, y: 450, anchorX: 0.5, anchorY: 0.5 } },
  ],
};

const sequences = [sceneA, sceneB];

// Extra options for movie.init (assets, transitions, …) go in INIT.
const INIT = {
  composition: { transitions: [
    { kind: 'luma', from: 'a', to: 'b', at: 4, duration: 1, map: 'radial', softness: 0.15 },
  ] },
};
const POSTER = 1.5;
`;
