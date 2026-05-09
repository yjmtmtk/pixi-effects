// examples/_presets/01-hello.js
export default `// Injected: movie (Movie instance), Controller (class), canvas (HTMLCanvasElement).
// Press ⌘↵ / Ctrl+↵ to Run. Top-level await is supported.
new Controller(movie, { canvas });
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 4, frameRate: 30,
  background: '#0a0a0f',
  composition: {
    sequences: [
      {
        type: 'text',
        text: 'hello',
        // \`initial\` applies before any keyframe runs. Anchor 0.5/0.5 makes
        // (x, y) the *centre* of the text rather than the top-left.
        initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          // Entry: at t=0, animate from (alpha 0, scale 0.6) → (alpha 1, scale 1).
          { at: 0, from: { alpha: 0, scale: 0.6 },
                   to:   { alpha: 1, scale: 1 },
                   duration: 0.6, ease: 'back.out(1.7)' },
          // Exit: at t = duration - 0.5, fade alpha → 0 over 500ms.
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: {
          fontSize: 'GW * 0.12',   // expressions work inside style too
          fill: '#ffffff',
          fontWeight: 'bold',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
      },
    ],
  },
});
`;
