export default function chapter(P) {
  const { C, F } = P;

  // ONE table of numbers drives every layer of this chapter: change it and the bars, the line, the dots, the counters,
  // the percentage and the second page all follow. (Sample data: invented.)
  const DATA = [['Q1', 1.4], ['Q2', 1.9], ['Q3', 2.6], ['Q4', 3.4], ['Q5', 4.6]];
  const N = DATA.length, VALS = DATA.map(d => d[1]);
  const MAX = Math.max(...VALS), LAST = VALS[N - 1], FIRST = VALS[0];
  const STEP = [1, 2, 2.5, 5, 10].find(s => MAX / s <= 3) ?? 10;        // axis ticks: 0, 2, 4, 6 for this table
  const TOP = Math.ceil(MAX / STEP) * STEP;
  const GROWTH = Math.round((LAST / FIRST - 1) * 100);                   // +229 (%)
  const fmt = v => v.toFixed(1);

  const T = 0.6;                                                         // the slide between the two pages
  const D1 = 3.9, D2 = 3.7;                                              // 3.9 + 3.7 - 0.6 = 7 s

  const mono = (size, fill, extra = {}) => ({ fontSize: size, fill, fontFamily: F.mono, ...extra });

  // ---------------------------------------------------------------- page 1: the chart (dark)
  const X0 = 190, BW = 130, PITCH = 186, BASE = 860, CH = 500;
  const cx = i => X0 + 30 + BW / 2 + i * PITCH;
  const hOf = v => CH * v / TOP;
  const yOf = v => BASE - hOf(v);
  const BAR_AT = 0.7, BAR_DUR = 0.7, EACH = 0.14;
  const delay = P.stagger(N, { each: EACH });
  const LINE_AT = 1.5, LINE_DUR = 1.2;

  const page1 = [P.bg(C.ink, 'bg1')];
  page1.push(...P.tag('10', 'DATA AND TALKS', 'sample data: one array of numbers draws every bar, line and counter'));
  page1.push({ type: 'text', name: 'page-no-1', text: '1 / 2', style: mono(34, C.dim, { letterSpacing: 4 }), initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5 } });
  page1.push({ type: 'text', name: 'chart-title', text: 'Revenue per quarter, $M', style: { fontSize: 64, fill: C.bone, fontFamily: F.display },
    initial: { x: 96, y: 190, anchorX: 0, anchorY: 0.5 } });

  // axis: grid lines and tick labels from the table's range
  for (let v = 0; v <= TOP; v += STEP) {
    const y = yOf(v);
    page1.push({ type: 'shape', shape: 'line', name: 'grid-' + v, from: [X0 - 6, y], to: [X0 + 30 + N * PITCH - 56 + 30, y],
      initial: { strokeColor: v === 0 ? C.dim : '#232a3b', strokeWidth: v === 0 ? 3 : 2 } });
    page1.push({ type: 'text', name: 'tick-' + v, text: String(v), style: mono(34, C.dim), initial: { x: X0 - 26, y, anchorX: 1, anchorY: 0.5 } });
  }

  // bars (a wave of delays from stagger()), their counting labels and the quarter names
  DATA.forEach(([q, v], i) => {
    const at = BAR_AT + delay[i], h = hOf(v), last = i === N - 1;
    page1.push({ type: 'shape', shape: 'rect', name: 'bar-' + q, width: BW, height: 0, cornerRadius: 6, anchorY: 1, at,
      initial: { x: cx(i), y: BASE, fillColor: last ? C.red : '#34405c' },
      keyframes: [{ at: 0, to: { height: h }, duration: BAR_DUR, ease: 'power3.out' }] });
    page1.push({ type: 'text', name: 'val-' + q, text: '{value}', format: { decimals: 1 }, at,
      style: mono(38, last ? C.red : C.bone, { fontWeight: 'bold' }),
      initial: { x: cx(i), y: BASE - 30, anchorX: 0.5, anchorY: 1, value: 0, alpha: 0 },
      keyframes: [{ at: 0, to: { value: v, y: BASE - h - 36, alpha: 1 }, duration: BAR_DUR, ease: 'power3.out' }] });
    page1.push({ type: 'text', name: 'qlabel-' + q, text: q, style: mono(40, last ? C.bone : C.dim), initial: { x: cx(i), y: BASE + 22, anchorX: 0.5, anchorY: 0 } });
  });

  // the line across the bar tops draws on (trimEnd 0 -> 1); a dot lands where it reaches each point
  const pts = VALS.map((v, i) => [cx(i), yOf(v)]);
  const segLen = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = segLen.reduce((a, b) => a + b, 0);
  const d = pts.map((p, i) => (i ? 'L ' : 'M ') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  page1.push({ type: 'shape', shape: 'path', name: 'trend-line', d, trimEnd: 0, strokeCap: 'round', strokeJoin: 'round', at: LINE_AT,
    initial: { strokeColor: C.cyan, strokeWidth: 9 }, keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: LINE_DUR, ease: 'none' }] });
  let run = 0;
  pts.forEach((p, i) => {
    if (i) run += segLen[i - 1];
    page1.push({ type: 'shape', shape: 'circle', name: 'dot-' + DATA[i][0], radius: 15, at: LINE_AT + LINE_DUR * run / total,
      initial: { x: p[0], y: p[1], fillColor: C.ink, strokeColor: C.cyan, strokeWidth: 7, scale: 0 },
      keyframes: [{ at: 0, to: { scale: 1 }, duration: 0.3, ease: 'back.out(2)' }] });
  });

  // the headline number counts up as the line reaches the end
  const PX = 1230;
  page1.push({ type: 'text', name: 'kpi-label', text: 'Q5 REVENUE', style: mono(40, C.dim, { letterSpacing: 4 }),
    initial: { x: PX, y: 400, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: LINE_AT - 0.3, to: { alpha: 1 }, duration: 0.5 }] });
  page1.push({ type: 'text', name: 'kpi', text: '${value}M', format: { decimals: 1 }, style: { fontSize: 156, fill: C.red, fontFamily: F.display },
    initial: { x: PX, y: 540, anchorX: 0, anchorY: 0.5, value: 0, alpha: 0 },
    keyframes: [{ at: LINE_AT - 0.3, to: { alpha: 1 }, duration: 0.3 }, { at: LINE_AT, to: { value: LAST }, duration: LINE_DUR + 0.2, ease: 'power2.out' }] });
  page1.push({ type: 'text', name: 'kpi-sub', text: `up from $${fmt(FIRST)}M in Q1`, style: { fontSize: 46, fill: C.bone, fontFamily: F.sans },
    initial: { x: PX, y: 665, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: LINE_AT + LINE_DUR - 0.2, to: { alpha: 1 }, duration: 0.6 }] });

  // ---------------------------------------------------------------- page 2: the takeaway (bone page)
  const INK = C.ink, SOFT = '#4a5266';
  const page2 = [P.bg(C.bone, 'bg2')];
  page2.push(...P.tag('10', 'DATA AND TALKS', 'sample data: one array of numbers draws every bar, line and counter', { at: 0.1, color: SOFT, captionColor: INK }));
  page2.push({ type: 'text', name: 'page-no-2', text: '2 / 2', style: mono(34, SOFT, { letterSpacing: 4 }), initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5 } });
  page2.push({ type: 'text', name: 'growth-label', text: `REVENUE GROWTH, ${DATA[0][0]} TO ${DATA[N - 1][0]}`, style: mono(40, SOFT, { letterSpacing: 3 }),
    initial: { x: 96, y: 260, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 0.8, to: { alpha: 1 }, duration: 0.5 }] });
  page2.push({ type: 'text', name: 'growth', text: '+{value}%', format: { decimals: 0 }, style: { fontSize: 290, fill: C.red, fontFamily: F.display },
    initial: { x: 96, y: 440, anchorX: 0, anchorY: 0.5, value: 0, alpha: 0 },
    keyframes: [{ at: 0.8, to: { alpha: 1 }, duration: 0.3 }, { at: 0.9, to: { value: GROWTH }, duration: 1.5, ease: 'power3.out' }] });
  page2.push({ type: 'text', name: 'range', text: `$${fmt(FIRST)}M  to  $${fmt(LAST)}M`, style: { fontSize: 72, fill: INK, fontFamily: F.display },
    initial: { x: 96, y: 650, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 1.5, to: { alpha: 1 }, duration: 0.6 }] });
  page2.push({ type: 'text', name: 'range-sub', text: `in ${N} quarters`, style: { fontSize: 48, fill: SOFT, fontFamily: F.sans },
    initial: { x: 96, y: 740, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 1.7, to: { alpha: 1 }, duration: 0.6 }] });
  // the same table again as a small chart
  const MB = 66, MP = 106, MX = 1290, MBASE = 760, MH = 380, mdelay = P.stagger(N, { each: 0.1 });
  page2.push({ type: 'shape', shape: 'line', name: 'mini-base', from: [MX - 20, MBASE], to: [MX + (N - 1) * MP + MB + 20, MBASE], initial: { strokeColor: INK, strokeWidth: 3 } });
  DATA.forEach(([q, v], i) => {
    const x = MX + MB / 2 + i * MP, last = i === N - 1;
    page2.push({ type: 'shape', shape: 'rect', name: 'mini-' + q, width: MB, height: 0, cornerRadius: 4, anchorY: 1, at: 1.0 + mdelay[i],
      initial: { x, y: MBASE, fillColor: last ? C.red : INK },
      keyframes: [{ at: 0, to: { height: MH * v / MAX }, duration: 0.7, ease: 'power3.out' }] });
    page2.push({ type: 'text', name: 'mini-q-' + q, text: q, style: mono(34, last ? INK : SOFT), initial: { x, y: MBASE + 20, anchorX: 0.5, anchorY: 0 } });
  });

  // ---------------------------------------------------------------- the deck: two pages joined by a slide
  const deck = P.deck({
    width: 1920, height: 1080, frameRate: 30,
    transition: { kind: 'slide', direction: 'left', duration: T, ease: 'power3.inOut' },
    pages: [
      { name: 'Chart', duration: D1, stops: [3.0], sequences: page1 },
      { name: 'Takeaway', duration: D2, stops: [3.0], sequences: page2 },
    ],
  });

  const sfx = [];
  DATA.forEach((_, i) => sfx.push({ type: 'audio', name: 'pop-' + i, sfx: { preset: 'pop', pitch: i * 2 }, at: BAR_AT + delay[i], volume: 0.3 }));
  sfx.push({ type: 'audio', name: 'sfx-line', sfx: 'swipe', at: LINE_AT, volume: 0.25 });
  sfx.push({ type: 'audio', name: 'sfx-slide', sfx: 'swoosh', at: D1 - T - 0.1, volume: 0.4 });
  sfx.push({ type: 'audio', name: 'sfx-land', sfx: 'chime', at: D1 - T + 2.1, volume: 0.3 });

  return {
    duration: 7,
    poster: 2.9,
    sequences: [
      P.bg(C.ink),
      { type: 'composition', name: 'deck', at: 0, duration: 7, width: 1920, height: 1080,
        sequences: deck.composition.sequences, transitions: deck.composition.transitions },
      ...sfx,
    ],
  };
}
