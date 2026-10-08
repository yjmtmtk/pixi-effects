// examples/playground/presets/15-time-remap.js
export default `// A group of layers with its OWN TIME: play it, hold it, rewind it, replay it slowly. (speed / time on a composition)
// The layers INSIDE "act" write their at / duration / keyframes in act's own seconds (0 - 4.5); act's own keyframes (time) drive that clock.

const W = 1280, H = 720, FPS = 30, DURATION = 11;
const BACKGROUND = '#0b0b10';

const INK = '#f2efe8', ACCENT = '#ff4d3d';
const letters = 'AGAIN.'.split('');

const act = {
  type: 'composition', name: 'act', duration: DURATION,
  // act's clock: play 0 -> 2.2 s of its own time, hold 0.5 s, REWIND to 0 (faster and faster), hold, then replay it all slowly with a long glide.
  // 'time' is seconds of act's content; the same keyframe words as any property (at, duration, ease, from, to).
  keyframes: [
    { at: 0,   from: { time: 0 }, to: { time: 2.2 }, duration: 2.2, ease: 'none' },
    { at: 2.2, to: { time: 2.2 }, duration: 0.5 },
    { at: 2.7, to: { time: 0 },   duration: 1.3, ease: 'power2.in' },
    { at: 4,   to: { time: 0 },   duration: 0.4 },
    { at: 4.4, to: { time: 4.5 }, duration: 6.1, ease: 'cubic-bezier(.2, .8, .2, 1)' },
  ],
  sequences: [
    { type: 'shape', shape: 'rect', name: 'bar', width: 'GW', height: 14, anchorX: 0, anchorY: 0, duration: 4.5,
      initial: { x: 0, y: 430, fillColor: ACCENT, scaleX: 0 },
      keyframes: [{ at: 0, to: { scaleX: 1 }, duration: 0.8, ease: 'expo.out' }] },
    { type: 'audio', sfx: 'swoosh', at: 0 },
    // the title, a letter at a time (all in act's seconds)
    ...letters.map((ch, i) => ({
      type: 'text', text: ch, name: 'letter-' + i, at: 0.3 + i * 0.18, duration: 4.5 - (0.3 + i * 0.18),
      style: { fontSize: 170, fontWeight: 'bold', fill: INK },
      initial: { x: 330 + i * 120, y: 330, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
      keyframes: [{ at: 0, from: { y: 250 }, to: { y: 330, alpha: 1 }, duration: 0.5, ease: 'expo.out' }],
    })),
    ...letters.map((ch, i) => ({ type: 'audio', sfx: 'click', at: 0.3 + i * 0.18 })),
    { type: 'text', text: 'a title that plays twice', name: 'caption', at: 2, duration: 2.5,
      style: { fontSize: 28, fill: INK, letterSpacing: 6, fontFamily: 'ui-monospace, Menlo, monospace' },
      initial: { x: 'GW/2', y: 500, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
      keyframes: [{ at: 0, to: { alpha: 0.8 }, duration: 0.6 }] },
    { type: 'audio', sfx: 'chime', at: 4 },
  ],
};

const sequences = [
  act,
  // OUTSIDE act, in the movie's own time: this label is not rewound - it shows while act rewinds (2.7 - 4 s)
  { type: 'text', text: '<< REW', name: 'rew', at: 2.7, duration: 1.3,
    style: { fontSize: 38, fontWeight: 'bold', fill: ACCENT, fontFamily: 'ui-monospace, Menlo, monospace' },
    initial: { x: 64, y: 56 },
    keyframes: [{ at: 0, to: { alpha: 0.25 }, duration: 0.15, repeat: 7, yoyo: true }] },
];

const POSTER = 10.2;
`;
