// examples/_presets/02-keyframes.js
export default `new Controller(movie, { canvas });
await movie.init({
  canvas,
  width: 1280, height: 720, duration: 8, frameRate: 30,
  background: '#0a0a0f',
  composition: {
    sequences: [
      // ── Word that walks through one transform per beat ──
      {
        type: 'text',
        text: 'TWEEN',
        initial: {
          x: 'GW/2', y: 'GH/2',
          anchorX: 0.5, anchorY: 0.5,
          alpha: 0,
        },
        keyframes: [
          // 0.0–0.6  scale-pop entry (fromTo)
          { at: 0,   from: { alpha: 0, scale: 0 },
                     to:   { alpha: 1, scale: 1 },
                     duration: 0.6, ease: 'back.out(2)' },

          // 1.0–1.6  rotation in degrees, elastic settle
          { at: 1.0, to: { rotation: 18 }, duration: 0.6, ease: 'elastic.out(1, 0.5)' },
          { at: 1.6, to: { rotation: 0  }, duration: 0.4, ease: 'sine.inOut' },

          // 2.0–3.2  positional drift using GW/GH expressions
          { at: 2.0, to: { x: 'GW * 0.7', y: 'GH * 0.5' }, duration: 0.6, ease: 'power2.inOut' },
          { at: 2.6, to: { x: 'GW * 0.3', y: 'GH * 0.5' }, duration: 0.6, ease: 'power2.inOut' },
          { at: 3.2, to: { x: 'GW/2',     y: 'GH/2'    }, duration: 0.4, ease: 'sine.out' },

          // 3.8  \`set\` — instantaneous tint flip (no duration)
          { at: 3.8, set: { tint: '#88ccff' } },

          // 4.0–4.8  skew + scale wobble in parallel
          { at: 4.0, to: { skewX: 18, scaleY: 0.85 }, duration: 0.4, ease: 'sine.inOut' },
          { at: 4.4, to: { skewX: -18, scaleY: 1.15 }, duration: 0.4, ease: 'sine.inOut' },
          { at: 4.8, to: { skewX: 0, scaleY: 1 },     duration: 0.4, ease: 'sine.out' },

          // 5.4  tint cycle back to white
          { at: 5.4, to: { tint: '#ffffff' }, duration: 0.6, ease: 'sine.inOut' },

          // 6.0–6.6  pulse via responsive font-tied scale
          { at: 6.0, to: { scale: 1.4 }, duration: 0.3, ease: 'power2.out' },
          { at: 6.3, to: { scale: 1   }, duration: 0.3, ease: 'power2.in' },

          // -0.5  exit fade (negative \`at\` = duration - 0.5)
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: {
          fontSize: 'min(GW, GH) * 0.18',   // responsive: stays sane on tall canvases too
          fill: '#ffffff',
          fontWeight: '900',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: 8,
        },
      },

      // ── Caption labelling the current beat ──
      {
        type: 'text',
        text: 'pop · rotate · pan · tint · skew · pulse',
        initial: { x: 'GW/2', y: 'GH * 0.86', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0.6, from: { alpha: 0, y: 'GH * 0.92' },
                     to:   { alpha: 1, y: 'GH * 0.86' },
                     duration: 0.5, ease: 'power3.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.022', fill: '#88ccff', fontStyle: 'italic' },
      },
    ],
  },
});
`;
