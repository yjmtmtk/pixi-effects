// examples/_presets/chromakey.js
export default `new Controller(movie, { canvas });
const { BlurFilter } = await import('pixi.js');
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 6, frameRate: 30,
  background: '#0a3a5c',
  assets: [{ name: 'green', src: '/examples/_assets/green.mp4' }],
  composition: {
    sequences: [
      {
        type: 'video', asset: 'green', name: 'fg',
        initial: { x: 0, y: 0, scale: 'cover' },
        filters: [
          { name: 'k', type: 'chromaKey', keyColor: '#00ff00', threshold: 0.4, smoothing: 0.1, spill: 0.3 },
          { name: 'b', type: 'custom', filter: new BlurFilter({ strength: 0 }) },
        ],
        keyframes: [
          { at: 2,    to: { 'filters.b.strength': 8 }, duration: 1 },
          { at: 4,    to: { 'filters.k.threshold': 0.5 }, duration: 1 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      },
    ],
  },
});
`;
