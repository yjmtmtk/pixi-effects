// 02 / SHAPES: one poster that draws itself. Construction lines and a dial of ticks draw on (trimEnd on lines, a path, a polygon), a vermilion
// progress ring fills (an arc's endAngle), a disc inside it morphs into a four-point star (morphTo) while its gradient turns (fillGradient
// animated partially), and a halftone field of dots is released in a stagger wave from the ring, then a second wave runs through it.
export default function chapter(P) {
  const { C, F } = P;
  const GW = 1920, GH = 1080;
  // The grid of the poster: the ring sits at 5/16 of the width, the right panel runs from 17/32 of the width to the right margin.
  const CX = GW * 5 / 16, CY = GH / 2;            // 600, 540
  const R = 300, RW = 26;                          // the ring and its stroke
  const PANEL_L = GW * 17 / 32, PANEL_R = GW - 96; // 1020 .. 1824
  const PANEL_W = PANEL_R - PANEL_L;               // 804
  const f = (n) => Math.round(n * 100) / 100;

  // ---- geometry, all derived from the grid above ----
  // a dial of 60 ticks just outside the ring, one path of 60 sub-paths: trimEnd walks them in order, clockwise from 12 o'clock
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (-90 + i * 6) * Math.PI / 180, r1 = R + 20, r2 = R + (i % 5 === 0 ? 48 : 34);
    ticks += `M ${f(CX + r1 * Math.cos(a))} ${f(CY + r1 * Math.sin(a))} L ${f(CX + r2 * Math.cos(a))} ${f(CY + r2 * Math.sin(a))} `;
  }
  // a diamond (a square on its corner) inscribed in the ring: its corners are where the star's points will land
  const D = R - 30;
  const diamond = [[CX, CY - D], [CX + D, CY], [CX, CY + D], [CX - D, CY]];
  // a disc written as four cubic curves, and a four-point star with the same start (12 o'clock) and direction (clockwise)
  const RD = 150, K = 0.5523 * RD;
  const disc = `M ${CX} ${CY - RD} C ${f(CX + K)} ${CY - RD} ${CX + RD} ${f(CY - K)} ${CX + RD} ${CY} ` +
    `C ${CX + RD} ${f(CY + K)} ${f(CX + K)} ${CY + RD} ${CX} ${CY + RD} ` +
    `C ${f(CX - K)} ${CY + RD} ${CX - RD} ${f(CY + K)} ${CX - RD} ${CY} ` +
    `C ${CX - RD} ${f(CY - K)} ${f(CX - K)} ${CY - RD} ${CX} ${CY - RD} Z`;
  const ri = 62;
  const starPts = [];
  for (let i = 0; i < 8; i++) {
    const a = (-90 + i * 45) * Math.PI / 180, r = i % 2 === 0 ? D : ri;
    starPts.push(`${f(CX + r * Math.cos(a))} ${f(CY + r * Math.sin(a))}`);
  }
  const star = `M ${starPts[0]} ` + starPts.slice(1).map((p) => `L ${p}`).join(' ') + ' Z';

  // ---- the display word, fitted to the right panel ----
  const wordStyle = { fontFamily: F.display, fontSize: 100, fill: C.bone, letterSpacing: 2 };
  const fit = Math.floor(100 * PANEL_W / P.measureText('SHAPES', wordStyle).width);
  wordStyle.fontSize = Math.min(200, fit);
  const WORD_Y = 420;                              // centre of the word, above the horizon line at CY

  // ---- the halftone field: 14 x 5 dots under the horizon, big near the ring, small to the right ----
  const COLS = 14, ROWS = 5, DOT_TOP = 640, DOT_GAP_Y = 54, DOT_MAX = 21;
  const gapX = (PANEL_W - 2 * DOT_MAX) / (COLS - 1);
  const pop = P.stagger(COLS * ROWS, { each: 0.035, grid: [COLS, ROWS], from: 2 * COLS, ease: 'sine.out' });
  const WAVE_IN = 3.3, RIPPLE = 4.45;
  const dots = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c, at = WAVE_IN + pop[i];
    const radius = f(DOT_MAX * (1 - 0.72 * c / (COLS - 1)));
    dots.push({
      type: 'shape', shape: 'circle', name: `dot-${r}-${c}`, radius, at, duration: 7 - at, colorSpace: 'oklch',
      initial: { x: f(PANEL_L + DOT_MAX + c * gapX), y: DOT_TOP + r * DOT_GAP_Y, fillColor: C.bone, scale: 0 },
      keyframes: [
        { at: 0, to: { scale: 1 }, duration: 0.45, ease: 'power3.out' },
        // the second wave: left to right, each dot swells and flashes vermilion, then settles back
        { at: f(RIPPLE + c * 0.055 + Math.abs(r - 2) * 0.03 - at), to: { scale: 1.55, fillColor: C.red }, duration: 0.28, ease: 'power2.out', repeat: 1, yoyo: true },
      ],
    });
  }

  const drawOn = (at, duration, ease = 'power2.inOut') => ({ at, to: { trimEnd: 1 }, duration, ease });
  const sfx = (name, preset, at, volume, extra = {}) => ({ type: 'audio', name, sfx: { preset, ...extra }, at, volume });

  return {
    duration: 7,
    poster: 6.2,
    sequences: [
      P.bg(C.ink),
      // the ring's track is there from the first frame (calm edge), the vermilion arc fills it
      { type: 'shape', shape: 'arc', name: 'track', radius: R, startAngle: 0, endAngle: 360,
        initial: { x: 'GW*5/16', y: 'GH/2', strokeColor: C.ink2, strokeWidth: RW } },
      // construction lines: the horizon across the whole poster and the ring's vertical axis
      { type: 'shape', shape: 'line', name: 'horizon', from: [96, CY], to: [GW - 96, CY], trimEnd: 0, strokeCap: 'butt',
        initial: { strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.5 }, keyframes: [drawOn(0.6, 1.5, 'power3.inOut')] },
      { type: 'shape', shape: 'line', name: 'axis', from: [CX, CY - R - 90], to: [CX, CY + R + 90], trimEnd: 0, strokeCap: 'butt',
        initial: { strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.5 }, keyframes: [drawOn(0.8, 1.1)] },
      // the dial: 60 ticks, one path, drawn on in order
      { type: 'shape', shape: 'path', name: 'dial', d: ticks.trim(), trimEnd: 0, strokeCap: 'butt',
        initial: { strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.7 }, keyframes: [drawOn(1.0, 1.3)] },
      // the diamond: a closed polygon drawn on
      { type: 'shape', shape: 'polygon', name: 'diamond', points: diamond, trimEnd: 0, strokeJoin: 'miter',
        initial: { strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.9 }, keyframes: [drawOn(1.5, 1.0)] },
      // the progress ring
      { type: 'shape', shape: 'arc', name: 'ring', radius: R, startAngle: -90, endAngle: -90, strokeCap: 'butt',
        initial: { x: 'GW*5/16', y: 'GH/2', strokeColor: C.red, strokeWidth: RW },
        keyframes: [{ at: 0.6, to: { endAngle: 270 }, duration: 1.3, ease: 'power2.inOut' }] },
      // the mark: a disc that grows, then morphs into a four-point star while its gradient turns
      { type: 'shape', shape: 'path', name: 'mark', d: disc, morphTo: star, at: 1.9, duration: 5.1, colorSpace: 'oklch',
        fillGradient: { type: 'linear', angle: 45, stops: [[0, C.red], [0.4, C.red], [1, C.gold]] },
        initial: { pivotX: CX, pivotY: CY, x: 'GW*5/16', y: 'GH/2', scale: 0, rotation: -45, morph: 0 },
        keyframes: [
          { at: 0, to: { scale: 1 }, duration: 0.55, ease: 'power3.out' },
          { at: 0.75, to: { morph: 1, rotation: 0 }, duration: 1.25, ease: 'power2.inOut' },
          { at: 0.5, to: { fillGradient: { angle: 315 } }, duration: 3.6, ease: 'sine.inOut' },
        ] },
      // the display word, rising through a slot cut by an inline mask
      { type: 'text', name: 'word', text: 'SHAPES', style: wordStyle, at: 1.2, duration: 5.8,
        initial: { x: PANEL_L, y: WORD_Y, anchorX: 0, anchorY: 0.5 },
        mask: { type: 'shape', shape: 'rect', name: 'word-slot', width: PANEL_W + 40, height: 250, initial: { x: PANEL_L - 10, y: WORD_Y - 135, anchorX: 0, anchorY: 0, fillColor: '#ffffff' } },
        keyframes: [{ at: 0, from: { y: WORD_Y + 240 }, to: { y: WORD_Y }, duration: 0.8, ease: 'power3.out' }] },
      ...dots,
      ...P.tag('02', 'SHAPES', 'a line, a ring, a morph, a wave: all shapes, all data'),
      sfx('sfx-draw', 'swoosh', 0.5, 0.5),
      sfx('sfx-word', 'swipe', 1.2, 0.4),
      sfx('sfx-mark', 'pop', 1.9, 0.55),
      sfx('sfx-morph', 'swoosh', 2.55, 0.4, { pitch: 5, brightness: 0.3 }),
      ...[0, 1, 2, 3, 4].map((k) => sfx(`sfx-dot-${k}`, 'click', f(WAVE_IN + k * 0.11), 0.45, { pitch: k * 2 })),
      sfx('sfx-ripple', 'chime', RIPPLE, 0.4, { pitch: 7 }),
    ],
  };
}
