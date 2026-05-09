// examples/_presets/08-presets-export.js
export default `new Controller(movie, { canvas });

// kenBurns is exported from pixi-effects; dynamic import so the snippet works
// without registering an extra importmap entry. Relative URL resolves against
// the document (playground.html), giving /dist/index.js.
const { kenBurns } = await import('../dist/index.js');

function makePhoto(label, palette) {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  palette.forEach((color, i) => grad.addColorStop(i / (palette.length - 1), color));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1280, 720);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 8;
  ctx.strokeRect(40, 40, 1200, 640);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 200px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 640, 360);
  return c.toDataURL();
}

const SCENE_LEN = 5;
const T_DUR = 1;
const STEP = SCENE_LEN - T_DUR;

await movie.init({
  canvas,
  width: 1280, height: 720,
  duration: 4 * STEP + T_DUR,
  frameRate: 30,
  background: '#000',
  assets: [
    { name: 'p1', src: makePhoto('STILL',    ['#ff5577', '#5577ff']) },
    { name: 'p2', src: makePhoto('SCALE',    ['#33cc99', '#cc3399']) },
    { name: 'p3', src: makePhoto('ROTATION', ['#ffaa55', '#5599ff']) },
    { name: 'p4', src: makePhoto('PAN',      ['#88ccff', '#ffcc88']) },
  ],
  composition: {
    sequences: [
      // motion: 'still' — fitted, no animation. Useful as a rest beat.
      kenBurns({ asset: 'p1', name: 'p1', at: 0 * STEP, duration: SCENE_LEN, motion: 'still' }),
      // motion: 'scale' — focal-point zoom in on top-left quadrant.
      kenBurns({ asset: 'p2', name: 'p2', at: 1 * STEP, duration: SCENE_LEN, motion: 'scale',
                 origin: [0.25, 0.25], zoom: 1.25, direction: 'in' }),
      // motion: 'rotation' — gentle tilt, cw 8 degrees over the duration.
      kenBurns({ asset: 'p3', name: 'p3', at: 2 * STEP, duration: SCENE_LEN, motion: 'rotation',
                 angle: 8, direction: 'cw' }),
      // motion: 'position' — pan diagonally across the over-scaled image.
      kenBurns({ asset: 'p4', name: 'p4', at: 3 * STEP, duration: SCENE_LEN, motion: 'position',
                 from: [0, 0], to: [1, 1], zoom: 1.2 }),
    ],
    transitions: [
      { kind: 'crossfade', from: 'p1', to: 'p2', at: 1 * STEP, duration: T_DUR, ease: 'sine.inOut' },
      { kind: 'crossfade', from: 'p2', to: 'p3', at: 2 * STEP, duration: T_DUR, ease: 'sine.inOut' },
      { kind: 'crossfade', from: 'p3', to: 'p4', at: 3 * STEP, duration: T_DUR, ease: 'sine.inOut' },
    ],
  },
});

// To export from code (the same path Controller's download button takes):
//   const blob = await movie.render({ format: 'mp4' });
//   // then create a download link and click it.
`;
