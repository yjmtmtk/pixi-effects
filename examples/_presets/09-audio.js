// examples/_presets/09-audio.js
export default `new Controller(movie, { canvas });

// Each event = (time, label, sfx asset name).
const EVENTS = [
  { at: 0.8, label: 'click',  sfx: 'sfxClick'  },
  { at: 2.6, label: 'pop',    sfx: 'sfxPop'    },
  { at: 5.0, label: 'swoosh', sfx: 'sfxSwoosh' },
  { at: 7.6, label: 'chime',  sfx: 'sfxChime'  },
];
const DURATION = 10;

// Build BGM volume keyframes: ducks for ~0.5s after each SFX hit.
const bgmKeys = [
  { at: 0,   to: { volume: 0.5 }, duration: 1, ease: 'sine.out' },
];
for (const e of EVENTS) {
  bgmKeys.push({ at: e.at, to: { volume: 0.15 }, duration: 0.15, ease: 'sine.out' });
  bgmKeys.push({ at: e.at + 0.4, to: { volume: 0.5 }, duration: 0.5, ease: 'sine.in' });
}
bgmKeys.push({ at: -1, to: { volume: 0 }, duration: 1, ease: 'sine.in' });

await movie.init({
  canvas,
  width: 1280, height: 720, duration: DURATION, frameRate: 30,
  background: '#0a0a0f',
  assets: [
    { name: 'bgm',       src: '_assets/bgm.mp3'        },
    { name: 'sfxClick',  src: '_assets/sfx-click.mp3'  },
    { name: 'sfxPop',    src: '_assets/sfx-pop.mp3'    },
    { name: 'sfxSwoosh', src: '_assets/sfx-swoosh.mp3' },
    { name: 'sfxChime',  src: '_assets/sfx-chime.mp3'  },
  ],
  composition: {
    sequences: [
      // ── Audio: BGM with ducking volume keyframes ──
      {
        type: 'audio', asset: 'bgm', volume: 0,
        keyframes: bgmKeys,
      },
      // ── Audio: each SFX placed at its event time ──
      ...EVENTS.map(e => ({
        type: 'audio', asset: e.sfx, at: e.at, volume: 1,
      })),

      // 0.8s click → small white dot fades in at left
      {
        type: 'shape', shape: 'circle', radius: 22,
        initial: { x: 'GW * 0.18', y: 'GH/2', fillColor: '#ffffff', alpha: 0, scale: 0 },
        keyframes: [
          { at: 0.8, to: { alpha: 1, scale: 1 }, duration: 0.15, ease: 'power2.out' },
          { at: 1.6, to: { alpha: 0.4 }, duration: 0.5, ease: 'sine.in' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      },
      {
        type: 'text', text: 'click',
        initial: { x: 'GW * 0.18', y: 'GH * 0.62', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 0.85, to: { alpha: 1 }, duration: 0.3 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
      },

      // 2.6s pop → "POP!" text scale-pops in
      {
        type: 'text', text: 'POP!',
        initial: { x: 'GW * 0.4', y: 'GH/2', anchorX: 0.5, anchorY: 0.5, alpha: 0, scale: 0 },
        keyframes: [
          { at: 2.6, to: { alpha: 1, scale: 1 }, duration: 0.25, ease: 'back.out(3)' },
          { at: 3.0, to: { rotation: -8 }, duration: 0.2 },
          { at: 3.2, to: { rotation: 0 }, duration: 0.2 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.07', fill: '#ffaa55', fontWeight: '900', letterSpacing: 4 },
      },
      {
        type: 'text', text: 'pop',
        initial: { x: 'GW * 0.4', y: 'GH * 0.62', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 2.65, to: { alpha: 1 }, duration: 0.3 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
      },

      // 5.0s swoosh → arrow flies across the canvas
      {
        type: 'shape', shape: 'rect',
        width: 80, height: 6, cornerRadius: 3,
        initial: { x: 'GW * -0.1', y: 'GH/2', fillColor: '#88ccff', alpha: 0, anchorX: 0.5 },
        keyframes: [
          { at: 5.0, to: { alpha: 1 }, duration: 0.05 },
          { at: 5.0, to: { x: 'GW * 1.1', width: 220 }, duration: 0.3, ease: 'power3.out' },
          { at: 5.3, to: { alpha: 0 }, duration: 0.1 },
        ],
      },
      {
        type: 'text', text: 'swoosh',
        initial: { x: 'GW/2', y: 'GH * 0.62', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 5.05, to: { alpha: 1 }, duration: 0.3 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
      },

      // 7.6s chime → three stars (✦) appear with success vibe
      ...[0.78, 0.5, 0.22].map((cx, i) => ({
        type: 'text', text: '✦',
        initial: {
          x: \`GW * \${cx}\`, y: 'GH/2',
          anchorX: 0.5, anchorY: 0.5,
          alpha: 0, scale: 0,
        },
        keyframes: [
          { at: 7.6 + i * 0.08,
            to: { alpha: 1, scale: 1 },
            duration: 0.35, ease: 'back.out(2.2)' },
          { at: 8.5,
            to: { rotation: 25 },
            duration: 0.4, ease: 'sine.inOut' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.06', fill: '#ffeb88' },
      })),
      {
        type: 'text', text: 'chime',
        initial: { x: 'GW/2', y: 'GH * 0.62', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 7.7, to: { alpha: 1 }, duration: 0.3 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#aaccee', fontFamily: 'Menlo, monospace' },
      },

      // ── Title ──
      {
        type: 'text', text: 'audio',
        initial: { x: 'GW/2', y: 'GH * 0.12', anchorX: 0.5, anchorY: 0.5 },
        keyframes: [
          { at: 0, from: { alpha: 0, y: 'GH * 0.08' },
                   to:   { alpha: 1, y: 'GH * 0.12' },
                   duration: 0.6, ease: 'power3.out' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.04', fill: '#ffffff', fontWeight: 'bold' },
      },
      {
        type: 'text', text: 'BGM ducks while each SFX plays',
        initial: { x: 'GW/2', y: 'GH * 0.18', anchorX: 0.5, anchorY: 0.5, alpha: 0 },
        keyframes: [
          { at: 0.4, to: { alpha: 1 }, duration: 0.5 },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
        style: { fontSize: 'GW * 0.018', fill: '#88ccff', fontStyle: 'italic' },
      },

      // ── Bottom timeline ribbon ──
      {
        type: 'shape', shape: 'rect',
        width: 0, height: 4, cornerRadius: 2, anchorX: 0,
        initial: { x: 'GW * 0.05', y: 'GH * 0.92', fillColor: '#88ccff' },
        keyframes: [
          { at: 0, to: { width: 'GW * 0.9' }, duration: DURATION - 0.5, ease: 'none' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      },
      ...EVENTS.map(e => ({
        type: 'shape', shape: 'rect',
        width: 4, height: 14, cornerRadius: 2,
        initial: {
          x: \`GW * (0.05 + 0.9 * \${e.at} / \${DURATION})\`,
          y: 'GH * 0.92',
          fillColor: '#ffaa55',
          alpha: 0,
          anchorY: 0.5,
        },
        keyframes: [
          { at: e.at - 0.05, to: { alpha: 1, height: 22 }, duration: 0.1, ease: 'power2.out' },
          { at: e.at + 0.5,  to: { alpha: 0.4, height: 14 }, duration: 0.4, ease: 'sine.in' },
          { at: -0.5, to: { alpha: 0 }, duration: 0.5 },
        ],
      })),
    ],
  },
});
`;
