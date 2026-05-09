// examples/_presets/06-filters.js
export default `new Controller(movie, { canvas });

// Dynamic imports — playground exposes only movie/Controller/canvas; pull in
// PIXI built-ins and pixi-filters via the importmap entries.
const { BlurFilter, ColorMatrixFilter } = await import('pixi.js');
const { GlowFilter, DropShadowFilter }  = await import('pixi-filters');

function gradientDataUrl() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 480;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 480, 480);
  g.addColorStop(0,   '#ff5577');
  g.addColorStop(0.5, '#7755ff');
  g.addColorStop(1,   '#33ccff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 480);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 72px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PIXI', 240, 240);
  return c.toDataURL();
}

const COLS = ['GW * 0.27', 'GW * 0.73'];
const ROWS = ['GH * 0.34', 'GH * 0.74'];
const FADE_OUT = { at: -0.5, to: { alpha: 0 }, duration: 0.5 };

function caption(label, x, y) {
  return {
    type: 'text', text: label,
    initial: { x, y: \`\${y} + 130\`, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [
      { at: 0.4, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.4 },
      FADE_OUT,
    ],
    style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
  };
}

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 8, frameRate: 30,
  background: '#0a0a0f',
  assets: [
    { name: 'photo', src: gradientDataUrl() },
    { name: 'green', src: '/examples/_assets/green.mp4' },
  ],
  composition: {
    sequences: [
      // ─── Tile 1: chromaKey on the green-screen video ──────────
      {
        type: 'video', asset: 'green', audio: false,
        initial: { x: COLS[0], y: ROWS[0], anchorX: 0.5, anchorY: 0.5, scale: 0.18, alpha: 0 },
        filters: [
          { name: 'k', type: 'chromaKey', keyColor: '#00ff00', threshold: 0.4, smoothing: 0.1, spill: 0.3 },
        ],
        keyframes: [
          { at: 0, to: { alpha: 1 }, duration: 0.5 },
          { at: 1.5, to: { 'filters.k.threshold': 0.6 }, duration: 1.5, ease: 'sine.inOut' },
          { at: 3.5, to: { 'filters.k.threshold': 0.4 }, duration: 1.5, ease: 'sine.inOut' },
          FADE_OUT,
        ],
      },
      caption('chromaKey · threshold', COLS[0], ROWS[0]),

      // ─── Tile 2: BlurFilter (built-in PIXI) ───────────────────
      {
        type: 'image', asset: 'photo',
        initial: { x: COLS[1], y: ROWS[0], anchorX: 0.5, anchorY: 0.5, scale: 0.5, alpha: 0 },
        filters: [
          { name: 'b', type: 'custom', filter: new BlurFilter({ strength: 0 }) },
        ],
        keyframes: [
          { at: 0.2, to: { alpha: 1 }, duration: 0.4 },
          { at: 0.8, to: { 'filters.b.strength': 16 }, duration: 1.2, ease: 'sine.inOut' },
          { at: 2.0, to: { 'filters.b.strength': 0  }, duration: 1.2, ease: 'sine.inOut' },
          { at: 3.2, to: { 'filters.b.strength': 16 }, duration: 1.2, ease: 'sine.inOut' },
          { at: 4.4, to: { 'filters.b.strength': 0  }, duration: 1.2, ease: 'sine.inOut' },
          FADE_OUT,
        ],
      },
      caption('BlurFilter · strength', COLS[1], ROWS[0]),

      // ─── Tile 3: ColorMatrixFilter — saturation pulse ─────────
      (() => {
        const cm = new ColorMatrixFilter();
        cm.saturate(-1);
        cm.alpha = 1;
        return {
          type: 'image', asset: 'photo',
          initial: { x: COLS[0], y: ROWS[1], anchorX: 0.5, anchorY: 0.5, scale: 0.5, alpha: 0 },
          filters: [
            { name: 'desat', type: 'custom', filter: cm },
          ],
          keyframes: [
            { at: 0.4, to: { alpha: 1 }, duration: 0.4 },
            { at: 1.0, to: { 'filters.desat.alpha': 0 }, duration: 1.5, ease: 'sine.inOut' },
            { at: 2.5, to: { 'filters.desat.alpha': 1 }, duration: 1.5, ease: 'sine.inOut' },
            { at: 4.0, to: { 'filters.desat.alpha': 0 }, duration: 1.5, ease: 'sine.inOut' },
            FADE_OUT,
          ],
        };
      })(),
      caption('ColorMatrix · saturate', COLS[0], ROWS[1]),

      // ─── Tile 4: stacked Glow + DropShadow from pixi-filters ──
      (() => {
        const glow = new GlowFilter({ outerStrength: 0, color: 0xff66cc, distance: 18 });
        const shadow = new DropShadowFilter({ alpha: 0, blur: 2, offset: { x: 12, y: 12 }, color: 0x000000 });
        return {
          type: 'image', asset: 'photo',
          initial: { x: COLS[1], y: ROWS[1], anchorX: 0.5, anchorY: 0.5, scale: 0.5, alpha: 0 },
          filters: [
            { name: 'glow',   type: 'custom', filter: glow },
            { name: 'shadow', type: 'custom', filter: shadow },
          ],
          keyframes: [
            { at: 0.6, to: { alpha: 1 }, duration: 0.4 },
            { at: 1.2, to: { 'filters.glow.outerStrength': 4 }, duration: 1.2, ease: 'sine.inOut' },
            { at: 2.4, to: { 'filters.glow.outerStrength': 0 }, duration: 1.0, ease: 'sine.inOut' },
            { at: 2.6, to: { 'filters.shadow.alpha': 0.8,
                             'filters.shadow.blur':  6 }, duration: 1.0, ease: 'sine.inOut' },
            { at: 4.0, to: { 'filters.shadow.alpha': 0,
                             'filters.shadow.blur':  2 }, duration: 1.0, ease: 'sine.inOut' },
            FADE_OUT,
          ],
        };
      })(),
      caption('Glow + DropShadow (pixi-filters)', COLS[1], ROWS[1]),

      // ─── Title ─────────────────────────────────────────────────
      {
        type: 'text', text: 'filters',
        initial: { x: 'GW/2', y: 'GH * 0.08', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0, from: { alpha: 0, y: 'GH * 0.04' },
                   to:   { alpha: 1, y: 'GH * 0.08' },
                   duration: 0.5, ease: 'power3.out' },
          FADE_OUT,
        ],
        style: { fontSize: 'GW * 0.04', fill: '#ffffff', fontWeight: 'bold' },
      },
    ],
  },
});
`;
