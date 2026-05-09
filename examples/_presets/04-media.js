// examples/_presets/04-media.js
export default `new Controller(movie, { canvas });

// Generate a 1280x720 gradient image inline so the preset doesn't need an asset file.
function gradientDataUrl() {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0,    '#1a3a5c');
  grad.addColorStop(0.5,  '#3a1a5c');
  grad.addColorStop(1,    '#5c1a3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 32; y < 720; y += 64) {
    for (let x = 32; x < 1280; x += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c.toDataURL();
}

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 8, frameRate: 30,
  background: '#000000',
  assets: [
    { name: 'bg',    src: gradientDataUrl() },
    { name: 'green', src: '_assets/green.mp4' },
    { name: 'bgm',   src: '_assets/bgm.mp3'   },
  ],
  composition: {
    sequences: [
      // ── Background image — fits the canvas, slow tint sweep ──
      {
        type: 'image', asset: 'bg',
        initial: { x: 0, y: 0, scale: 'cover' },
        colorSpace: 'oklab',
        keyframes: [
          { at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.6 },
          { at: 1, to: { tint: '#ff99cc' }, duration: 3, ease: 'sine.inOut' },
          { at: 4, to: { tint: '#ffffff' }, duration: 2, ease: 'sine.inOut' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      },

      // ── Foreground video, chroma-keyed against green so the background shows through ──
      {
        type: 'video', asset: 'green', name: 'fg',
        audio: false,                      // mute video's own audio so BGM is the only sound
        initial: { x: 0, y: 0, scale: 'contain', alpha: 0 },
        filters: [
          { name: 'k', type: 'chromaKey', keyColor: '#00ff00', threshold: 0.4, smoothing: 0.1, spill: 0.3 },
        ],
        keyframes: [
          { at: 0.6, to: { alpha: 1 }, duration: 0.5 },
          { at: 4,   to: { 'filters.k.threshold': 0.55 }, duration: 1 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      },

      // ── BGM track. No visual; volume keyframes fade in / out. ──
      {
        type: 'audio', asset: 'bgm',
        volume: 0,
        keyframes: [
          { at: 0,    to: { volume: 0.6 }, duration: 1   },
          { at: -1,   to: { volume: 0   }, duration: 1   },
        ],
      },

      // ── Captions ──
      {
        type: 'text', text: 'image · video · audio',
        initial: { x: 'GW/2', y: 'GH * 0.08', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0.3, from: { alpha: 0, y: 'GH * 0.04' },
                     to:   { alpha: 1, y: 'GH * 0.08' },
                     duration: 0.5, ease: 'power3.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.04', fill: '#ffffff', fontWeight: 'bold' },
      },
      {
        type: 'text', text: 'green-screen video over a gradient image, BGM fading in & out',
        initial: { x: 'GW/2', y: 'GH * 0.94', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0.6, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontStyle: 'italic' },
      },
    ],
  },
});
`;
