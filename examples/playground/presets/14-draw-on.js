// examples/playground/presets/14-draw-on.js
export default `// Draw-on strokes (trimStart / trimEnd) and text that changes over time (visibleChars, set: { text }).

const W = 1280, H = 720, FPS = 30, DURATION = 12;
const BACKGROUND = '#0a0e1a';

const INK = '#e8eefc', ACCENT = '#ffd166', TEAL = '#4cc9f0', PINK = '#ff7aa8', DIM = '#9fb3d9';
const stroke = (color, width = 10) => ({ strokeColor: color, strokeWidth: width });
// A draw-on: trimEnd runs 0 -> 1 (trimStart / trimEnd are fractions of the outline's length; the fill is never trimmed).
const drawOn = (at, duration = 1.4) => ({ at, to: { trimEnd: 1 }, duration, ease: 'power2.inOut' });

// a five-point star outline, as a polygon
const star = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
  return [cx + d * Math.cos(a), cy + d * Math.sin(a)];
});
const label = (text, x, at) => ({ type: 'text', text, at, duration: DURATION - at,
  style: { fontSize: 22, fill: DIM, fontFamily: 'ui-monospace, Menlo, monospace' },
  initial: { x, y: 390, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
  keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.5 }] });

const sequences = [
  { type: 'text', text: 'draw-on strokes, text that changes', duration: DURATION,
    style: { fontSize: 34, fill: DIM, fontFamily: 'system-ui, sans-serif' },
    initial: { x: 'GW/2', y: 64, anchorX: 0.5, anchorY: 0.5 } },
  // a line: trimEnd 0 -> 1, with a round end
  { type: 'shape', shape: 'line', from: [340, 100], to: [940, 100], trimEnd: 0, strokeCap: 'round',
    initial: stroke(ACCENT, 6), keyframes: [drawOn(0.2, 1)] },
  // a rounded rectangle's border starts at its top-left and goes clockwise
  { type: 'shape', shape: 'rect', width: 200, height: 140, cornerRadius: 28, trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
    initial: { x: 200, y: 270, ...stroke(TEAL) }, keyframes: [drawOn(0.8)] },
  label('rect', 200, 1.8),
  // a circle starts at 12 o'clock; then trimStart follows trimEnd and wipes it off the same way
  { type: 'shape', shape: 'circle', radius: 70, trimEnd: 0, strokeCap: 'round',
    initial: { x: 480, y: 270, ...stroke(ACCENT) },
    keyframes: [drawOn(1.4), { at: 3.4, to: { trimStart: 1 }, duration: 1.2, ease: 'power2.inOut' }] },
  label('circle', 480, 2.4),
  // a polygon's outline (the closing edge counts)
  { type: 'shape', shape: 'polygon', points: star(760, 275, 90, 38), trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
    initial: { fillColor: '#ff7aa8', fillAlpha: 0, ...stroke(PINK, 8) },
    keyframes: [drawOn(2), { at: 3.4, to: { fillAlpha: 0.35 }, duration: 0.8 }] },
  label('polygon', 760, 3),
  // an SVG path: a check mark (curves are followed too)
  { type: 'shape', shape: 'path', d: 'M 0 50 L 45 95 L 130 0', trimEnd: 0, strokeCap: 'round', strokeJoin: 'round',
    initial: { x: 1040, y: 270, ...stroke('#7bd88f', 16) }, keyframes: [drawOn(2.6, 1)] },
  label('path', 1040, 3.6),

  // text that changes: visibleChars is a typewriter; set: { text } swaps the string at a time
  { type: 'text', text: 'No mask, no per-letter layers.', at: 4.5, duration: DURATION - 4.5,
    style: { fontSize: 40, fill: INK, fontFamily: 'ui-monospace, Menlo, monospace' },
    initial: { x: 120, y: 520, anchorX: 0, anchorY: 0.5, visibleChars: 0 },
    keyframes: [{ at: 0, to: { visibleChars: 30 }, duration: 2.4, ease: 'none' }] },
  { type: 'text', text: '3', at: 7.2, duration: DURATION - 7.2,
    style: { fontSize: 150, fontWeight: '900', fill: ACCENT, fontFamily: 'Arial Black, Arial, sans-serif' },
    initial: { x: 1060, y: 540, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [{ at: 1, set: { text: '2' } }, { at: 2, set: { text: '1' } }, { at: 3, set: { text: 'Go!' } }] },
];

const POSTER = DURATION * 0.75;
`;
