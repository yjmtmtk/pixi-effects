// examples/_presets/07-transitions.js
export default `new Controller(movie, { canvas });

// Tiny solid-color PNG used as a stretchable background sprite.
function bgDataUrl(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 8);
  return c.toDataURL();
}

function scene(label, color, name, at, duration) {
  return [
    {
      type: 'image', asset: \`bg-\${name}\`, name,
      at, duration,
      initial: { x: 0, y: 0, scale: 'cover' },
    },
    {
      type: 'text', text: label, at, duration,
      initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
      style: { fontSize: 'GW * 0.06', fill: '#ffffff', fontWeight: 'bold' },
    },
  ];
}

const SCENES = [
  ['SCENE A',  '#a13b3b', 'A'],
  ['SCENE B',  '#2266bb', 'B'],
  ['SCENE C',  '#1d8c5e', 'C'],
  ['SCENE D',  '#bb44aa', 'D'],
  ['SCENE E',  '#222222', 'E'],
  ['SCENE F',  '#cc7733', 'F'],
  ['SCENE G',  '#3366cc', 'G'],
  ['SCENE H',  '#aa5544', 'H'],
];

const SCENE_LEN = 4;
const T_DUR     = 1;
const STEP      = SCENE_LEN - T_DUR;

await movie.init({
  canvas,
  width: 1280, height: 720,
  duration: SCENES.length * STEP + T_DUR,
  frameRate: 30,
  background: '#000000',
  assets: SCENES.map(([_, color, name]) => ({ name: \`bg-\${name}\`, src: bgDataUrl(color) })),
  composition: {
    sequences: SCENES.flatMap(([label, color, name], i) =>
      scene(label, color, name, i * STEP, SCENE_LEN)
    ),
    transitions: [
      { kind: 'crossfade', from: 'A', to: 'B', at: 1 * STEP, duration: T_DUR, ease: 'sine.inOut' },
      { kind: 'wipe',      from: 'B', to: 'C', at: 2 * STEP, duration: T_DUR, direction: 'left' },
      { kind: 'iris',      from: 'C', to: 'D', at: 3 * STEP, duration: T_DUR, mode: 'in', ease: 'power2.inOut' },
      { kind: 'slide',     from: 'D', to: 'E', at: 4 * STEP, duration: T_DUR, direction: 'left', ease: 'power2.inOut' },
      { kind: 'dip',       from: 'E', to: 'F', at: 5 * STEP, duration: T_DUR, ease: 'sine.inOut' },
      { kind: 'zoom',      from: 'F', to: 'G', at: 6 * STEP, duration: T_DUR, mode: 'in', fromScale: 4, ease: 'power2.out' },
      { kind: 'dissolve',  from: 'G', to: 'H', at: 7 * STEP, duration: T_DUR, scale: 30, seed: 0 },
    ],
  },
});
`;
