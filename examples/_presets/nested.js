// examples/_presets/nested.js
export default `new Controller(movie, { canvas });
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 6, frameRate: 30,
  assets: [{ name: 'bgm', src: '/examples/_assets/bgm.mp3' }],
  composition: {
    sequences: [
      {
        type: 'composition', width: 800, height: 450,
        initial: { x: 'GW/2 - 400', y: 'GH/2 - 225' },
        keyframes: [
          { at: 0, to: { alpha: 1 }, duration: 0.5 },
          { at: 1, to: { rotation: 0.2 }, duration: 2, ease: 'sine.inOut' },
          { at: 3, to: { rotation: -0.2 }, duration: 2, ease: 'sine.inOut' },
        ],
        sequences: [
          {
            type: 'text', text: 'inner composition',
            initial: { x: 400, y: 225 },
            style: { fontSize: 64, fill: '#88ddff' },
          },
        ],
      },
      {
        type: 'audio', asset: 'bgm', volume: 0,
        keyframes: [
          { at: 0,  to: { volume: 0.6 }, duration: 1 },
          { at: -1, to: { volume: 0 },  duration: 1 },
        ],
      },
    ],
  },
});
`;
