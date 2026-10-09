// SPIKE 0.23 suites (throwaway). Each suite gets { cdp, save, backend } and returns a JSON-able report.
import { blendPixel, hexToRgb } from '../../../../tests/support/blendReference.ts';

const BACK = '#b0703a', SRC = '#3dd6c8';
const full = (fill, extra = {}) => ({ type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: fill }, ...extra });
const rect = (name, x, y, w, h, fill, alpha = 1, extra = {}) => ({ type: 'shape', shape: 'rect', name, width: w, height: h, anchorX: 0, anchorY: 0, initial: { x, y, fillColor: fill, alpha }, ...extra });
const circle = (name, x, y, r, fill = '#ffffff', extra = {}) => ({ type: 'shape', shape: 'circle', name, radius: r, initial: { x, y, fillColor: fill }, ...extra });
const IDENTITY = { type: 'colorMatrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] };

/** What a source of colour `src` covering the backdrop with coverage f (the matte) and `mode` gives, per the W3C formulas (0..255). */
export function expected(mode, back, src, f) {
  const cb = hexToRgb(back), cs = hexToRgb(src);
  if (mode === 'normal') return cb.map((b, k) => (f * cs[k] + (1 - f) * b) * 255);
  if (mode === 'multiply') return cb.map((b, k) => (f * cs[k] * b + (1 - f) * b) * 255);
  if (mode === 'screen') return cb.map((b, k) => (f * (b + cs[k] - b * cs[k]) + (1 - f) * b) * 255);
  return blendPixel(mode, cb, 1, cs, f).slice(0, 3);
}

const LUMA_R = 0.2126, LUMA_G = 0.7152;
const disc = `(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); return c.toDataURL('image/png'); })()`;
const solid = (hex) => `(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.fillStyle = '${hex}'; g.fillRect(0, 0, 160, 90); return c.toDataURL('image/png'); })()`;

/** The Q1 cases: the mattes, the mask value on the matted layer, and points with the coverage expected there. */
const CASES = [
  { name: 'alpha', mattes: [circle('m', 80, 45, 20)], mask: 'm', pts: [[80, 45, 1], [10, 10, 0]] },
  { name: 'alpha-0.5', mattes: [rect('m', 0, 0, 80, 90, '#ffffff', 0.5)], mask: 'm', pts: [[40, 45, 0.5], [120, 45, 0]] },
  { name: 'luma (a composition as the matte)', mattes: [{ type: 'composition', name: 'm', width: 160, height: 90, sequences: [rect('r', 0, 0, 80, 90, '#ff0000'), rect('g', 80, 0, 80, 90, '#00ff00')] }],
    mask: { layer: 'm', channel: 'luma' }, pts: [[40, 45, LUMA_R], [120, 45, LUMA_G]] },
  { name: 'alpha inverted', mattes: [circle('m', 80, 45, 20)], mask: { layer: 'm', invert: true }, pts: [[80, 45, 0], [10, 10, 1]] },
  { name: 'luma inverted', mattes: [{ type: 'composition', name: 'm', width: 160, height: 90, sequences: [rect('r', 0, 0, 80, 90, '#ff0000'), rect('g', 80, 0, 80, 90, '#00ff00')] }],
    mask: { layer: 'm', channel: 'luma', invert: true }, pts: [[40, 45, 1 - LUMA_R], [120, 45, 1 - LUMA_G]] },
  { name: 'subtract A·(1−B)', mattes: [rect('A', 20, 10, 120, 70, '#ffffff'), circle('B', 80, 45, 15)], mask: ['A', { layer: 'B', invert: true }], pts: [[80, 45, 0], [30, 45, 1], [5, 45, 0]] },
  { name: 'intersect A·B (luma B 0.5 grey)', mattes: [rect('A', 0, 0, 80, 90, '#ffffff'), rect('B', 40, 0, 120, 90, '#808080')], mask: ['A', { layer: 'B', channel: 'luma' }], pts: [[60, 45, 128 / 255], [20, 45, 0], [120, 45, 0]] },
  { name: 'text matte', mattes: [{ type: 'text', name: 'm', text: 'I', style: { fontSize: 90, fontWeight: '900', fill: '#ffffff', fontFamily: 'sans-serif' }, initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 } }],
    mask: 'm', pts: [[80, 45, 1], [10, 10, 0], [130, 45, 0]] },
  { name: 'image matte', assets: true, mattes: [{ type: 'image', name: 'm', asset: 'disc', initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 } }], mask: 'm', pts: [[80, 45, 1], [10, 10, 0]] },
  { name: 'alpha, matted layer has its own filter', mattes: [circle('m', 80, 45, 20)], mask: 'm', layerExtra: { filters: [IDENTITY] }, pts: [[80, 45, 1], [10, 10, 0]] },
];
const MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hue'];

export async function q1({ cdp, save, backend }) {
  const rows = [];
  let worst = 0;
  const discUrl = await cdp.eval(disc);
  for (const c of CASES) for (const mode of MODES) {
    const layer = full(SRC, { name: 'L', mask: c.mask, ...(mode === 'normal' ? {} : { blendMode: mode }), ...(c.layerExtra ?? {}) });
    const comp = { sequences: [full(BACK), ...c.mattes, layer] };
    const info = await cdp.eval(`mk(${JSON.stringify({ composition: comp, ...(c.assets ? { assets: [{ name: 'disc', src: discUrl }] } : {}) })})`);
    const url = await cdp.eval('snap(0)');
    if (mode === 'overlay') await save(`q1-${backend}-${c.name.replace(/[^a-z0-9]+/gi, '_')}-overlay.png`, url);
    const got = await cdp.eval(`pxs(${JSON.stringify(url)}, ${JSON.stringify(c.pts.map(p => [p[0], p[1]]))})`);
    let w = 0;
    const detail = c.pts.map((p, i) => { const want = expected(mode, BACK, SRC, p[2]); const d = Math.max(...[0, 1, 2].map(k => Math.abs(got[i][k] - want[k]))); w = Math.max(w, d); return { at: [p[0], p[1]], f: +p[2].toFixed(3), got: got[i].slice(0, 3), want: want.map(Math.round), d: +d.toFixed(1) }; });
    worst = Math.max(worst, w);
    const logs = (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU'));
    rows.push({ case: c.name, mode, backend: info.backend, worst: +w.toFixed(1), ...(w > 2 ? { detail } : {}), ...(logs.length ? { logs } : {}) });
  }
  return { backends: [...new Set(rows.map(r => r.backend))], worst: +worst.toFixed(2), failing: rows.filter(r => r.worst > 2), warned: rows.filter(r => r.logs).map(r => ({ case: r.case, mode: r.mode, logs: r.logs })), rows: rows.map(r => `${r.case} | ${r.mode} | ${r.worst}`) };
}

/** Q1 with media as the MATTED layer: a text layer, an image, a video; compared with the same layer unmatted (normal) or the reference. */
export async function q1media({ cdp, save, backend }) {
  const out = [];
  const solidUrl = await cdp.eval(solid(SRC));
  // text matted: an 'I' in SRC with a small circle matte at its top; inside the circle: blend, in the letter below: backdrop
  for (const mode of ['normal', 'overlay', 'multiply']) {
    const text = { type: 'text', name: 'L', text: 'I', style: { fontSize: 90, fontWeight: '900', fill: SRC, fontFamily: 'sans-serif' }, initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 }, mask: 'm', ...(mode === 'normal' ? {} : { blendMode: mode }) };
    await cdp.eval(`mk(${JSON.stringify({ composition: { sequences: [full(BACK), circle('m', 80, 30, 8), text] } })})`);
    const url = await cdp.eval('snap(0)');
    if (mode === 'overlay') await save(`q1-${backend}-matted-text-overlay.png`, url);
    const [a, b] = await cdp.eval(`pxs(${JSON.stringify(url)}, [[80, 30], [80, 60]])`);
    const wa = expected(mode, BACK, SRC, 1), wb = expected('normal', BACK, SRC, 0);
    out.push({ layer: 'text', mode, inMatte: a.slice(0, 3), want: wa.map(Math.round), outside: b.slice(0, 3), wantOutside: wb.map(Math.round), worst: Math.max(...[0, 1, 2].map(k => Math.max(Math.abs(a[k] - wa[k]), Math.abs(b[k] - wb[k])))) });
  }
  for (const mode of ['normal', 'overlay', 'multiply']) {
    const img = { type: 'image', name: 'L', asset: 'solid', initial: { x: 0, y: 0, anchorX: 0, anchorY: 0 }, mask: { layer: 'm', invert: true }, ...(mode === 'normal' ? {} : { blendMode: mode }) };
    await cdp.eval(`mk(${JSON.stringify({ composition: { sequences: [full(BACK), circle('m', 80, 45, 20), img] }, assets: [{ name: 'solid', src: solidUrl }] })})`);
    const url = await cdp.eval('snap(0)');
    const [a, b] = await cdp.eval(`pxs(${JSON.stringify(url)}, [[10, 10], [80, 45]])`);
    const wa = expected(mode, BACK, SRC, 1), wb = expected('normal', BACK, SRC, 0);
    out.push({ layer: 'image (inverted matte)', mode, outsideHole: a.slice(0, 3), want: wa.map(Math.round), inHole: b.slice(0, 3), wantHole: wb.map(Math.round), worst: Math.max(...[0, 1, 2].map(k => Math.max(Math.abs(a[k] - wa[k]), Math.abs(b[k] - wb[k])))) });
  }
  // video matted, normal: inside the matte = the unmatted video pixel; outside = the backdrop. Then overlay vs the reference from the unmatted pixel.
  const vid = (extra) => ({ type: 'video', name: 'L', asset: 'green', audio: false, initial: { x: 0, y: 0, scale: 'cover' }, ...extra });
  const VA = { assets: [{ name: 'green', src: '/examples/_assets/green.mp4' }] };
  await cdp.eval(`mk(${JSON.stringify({ ...VA, duration: 2, composition: { sequences: [full(BACK), vid({})] } })})`);
  const plainUrl = await cdp.eval('snap(10)');
  const plain = await cdp.eval(`pxs(${JSON.stringify(plainUrl)}, [[80, 45], [10, 10]])`);
  for (const mode of ['normal', 'overlay']) {
    await cdp.eval(`mk(${JSON.stringify({ ...VA, duration: 2, composition: { sequences: [full(BACK), circle('m', 80, 45, 20), vid({ mask: 'm', ...(mode === 'normal' ? {} : { blendMode: mode }) })] } })})`);
    const url = await cdp.eval('snap(10)');
    if (mode === 'overlay') await save(`q1-${backend}-matted-video-overlay.png`, url);
    const [a, b] = await cdp.eval(`pxs(${JSON.stringify(url)}, [[80, 45], [10, 10]])`);
    const s = plain[0].slice(0, 3).map(v => v / 255);
    const want = mode === 'normal' ? plain[0].slice(0, 3) : blendPixel('overlay', hexToRgb(BACK), 1, s, plain[0][3] / 255).slice(0, 3);
    const wb = hexToRgb(BACK).map(v => v * 255);
    out.push({ layer: 'video', mode, inMatte: a.slice(0, 3), want: want.map(Math.round), outside: b.slice(0, 3), wantOutside: wb.map(Math.round), worst: Math.max(...[0, 1, 2].map(k => Math.max(Math.abs(a[k] - want[k]), Math.abs(b[k] - wb[k])))), logs: (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU')) });
  }
  return out;
}

/** Q2: one named matte, animated (x, width, scaleY), used by three layers (normal, overlay, inverted). Checked against a render of the matte alone, and in three seek orders. */
export async function q2({ cdp, save, backend }, opts = {}) {
  const GRAY = '#808080', R = '#e04040', G = '#40c060', B = '#4060e0';
  const W = 320, H = 180;
  const matte = opts.matte ?? { type: 'shape', shape: 'rect', name: 'wipe', width: 60, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#ffffff' },
    keyframes: [{ at: 0, to: { x: 200, width: 120, scaleY: 0.5 }, duration: 1, ease: 'power1.inOut' }] };
  const band = (name, y, fill, extra) => ({ type: 'shape', shape: 'rect', name, width: W, height: 60, anchorX: 0, anchorY: 0, initial: { x: 0, y, fillColor: fill }, ...extra });
  const frames = [0, 5, 10, 15, 20, 25, 29];
  const grid = []; for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) grid.push([x, y]);
  // the matte alone, white on black: coverage at each grid point (only 0 and 255 are used)
  const cov = {};
  await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: { sequences: [matte] } })})`);
  for (const f of frames) { const u = await cdp.eval(`snap(${f})`); cov[f] = (await cdp.eval(`pxs(${JSON.stringify(u)}, ${JSON.stringify(grid)})`)).map(p => p[0]); }
  const comp = { sequences: [
    { type: 'shape', shape: 'rect', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: GRAY } },
    matte,
    band('L0', 0, R, { mask: 'wipe' }),
    band('L1', 60, G, { mask: 'wipe', blendMode: 'overlay' }),
    band('L2', 120, B, { mask: { layer: 'wipe', invert: true } }),
  ] };
  await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: comp })})`);
  let checked = 0, bad = 0, worst = 0; const badList = [];
  for (const f of frames) {
    const u = await cdp.eval(`snap(${f})`);
    if (f === 15 || f === 29 || f === 0) await save(`q2-${opts.tag ?? ''}${backend}-frame${f}.png`, u);
    const got = await cdp.eval(`pxs(${JSON.stringify(u)}, ${JSON.stringify(grid)})`);
    grid.forEach(([x, y], i) => {
      const c = cov[f][i]; if (c !== 0 && c !== 255) return;
      const m = c / 255;
      const want = y < 60 ? expected('normal', GRAY, R, m) : y < 120 ? expected('overlay', GRAY, G, m) : expected('normal', GRAY, B, 1 - m);
      const d = Math.max(...[0, 1, 2].map(k => Math.abs(got[i][k] - want[k])));
      checked++; worst = Math.max(worst, d);
      if (d > 2) { bad++; if (badList.length < 8) badList.push({ f, x, y, got: got[i].slice(0, 3), want: want.map(Math.round) }); }
    });
  }
  const o = await cdp.eval(`orders(${JSON.stringify(frames)})`);
  const logs = (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU'));
  return { backend, checked, bad, worst: +worst.toFixed(2), badList, seekOrders: o, logs };
}

/** Q3: ms per frame at 1080p. N full-frame layers (alpha 0.6, different colours) and a moving circle matte per layer (or one shared). */
export async function q3({ cdp, backend }) {
  const W = 1920, H = 1080;
  const colours = ['#e04040', '#40c060', '#4060e0', '#e0c040', '#c040e0', '#40e0e0', '#e08040', '#80e040', '#4080e0', '#e04080'];
  const move = (i) => [{ at: 0, to: { x: 1400 - i * 30 }, duration: 1, ease: 'none' }];
  const circ = (name, i) => ({ type: 'shape', shape: 'circle', ...(name ? { name } : {}), radius: 380, initial: { x: 500 + i * 30, y: 540, fillColor: '#ffffff' }, keyframes: move(i) });
  const layer = (i, extra) => ({ type: 'shape', shape: 'rect', name: `L${i}`, width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: colours[i], alpha: 0.6 }, ...extra });
  const back = { type: 'shape', shape: 'rect', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#808080' } };
  const variants = {
    'none': (n) => [back, ...range(n).map(i => layer(i, {}))],
    'stencil (inline shape mask)': (n) => [back, ...range(n).map(i => layer(i, { mask: circ(null, i) }))],
    'AlphaMask (inline maskInverted)': (n) => [back, ...range(n).map(i => layer(i, { mask: circ(null, i), maskInverted: true }))],
    'own-texture, one matte per layer': (n) => [back, ...range(n).map(i => circ(`m${i}`, i)), ...range(n).map(i => layer(i, { mask: `m${i}` }))],
    'own-texture, one shared matte': (n) => [back, circ('m', 0), ...range(n).map(i => layer(i, { mask: 'm' }))],
    'overlay, no mask': (n) => [back, ...range(n).map(i => layer(i, { blendMode: 'overlay' }))],
    'overlay + own-texture matte per layer': (n) => [back, ...range(n).map(i => circ(`m${i}`, i)), ...range(n).map(i => layer(i, { mask: `m${i}`, blendMode: 'overlay' }))],
    'two mattes per layer (A·(1−B)), own-texture': (n) => [back, ...range(n).map(i => circ(`m${i}`, i)), { ...circ('hole', 0), radius: 150 }, ...range(n).map(i => layer(i, { mask: [`m${i}`, { layer: 'hole', invert: true }] }))],
  };
  const rows = [];
  let info = '';
  for (const [name, mkSeq] of Object.entries(variants)) for (const n of [1, 3, 10]) {
    await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, duration: 1, composition: { sequences: mkSeq(n) } })})`);
    if (!info) info = await cdp.eval('gpuInfo()');
    const b = await cdp.eval('bench(30, 5)');
    const tex = await cdp.eval('texBytes()');
    rows.push({ variant: name, n, ms: +b.median.toFixed(2), min: +b.min.toFixed(2), max: +b.max.toFixed(2), textures: tex.count, texMB: tex.mb });
  }
  return { backend, info, rows: rows.map(r => `${r.variant} | ${r.n} | ${r.ms} (${r.min}–${r.max}) | tex ${r.textures} / ${r.texMB} MB`) };
}
/**
 * Q4: scene-graph cases. Technique: the TEST has the matte hidden and a full-frame WHITE layer matted by it on black, so the picture is
 * the matte's coverage; the REFERENCE draws the matte layer itself, white, in the same place. Equal pictures = the matte is where it should be.
 */
export async function q4({ cdp, save, backend }) {
  const W = 320, H = 180;
  const white = (extra = {}) => ({ type: 'shape', shape: 'rect', name: 'L', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#ffffff' }, ...extra });
  const blob = (extra = {}) => ({ type: 'shape', shape: 'ellipse', radiusX: 60, radiusY: 22, name: 'm', initial: { x: 120, y: 90, fillColor: '#ffffff', rotation: 10 },
    keyframes: [{ at: 0, to: { x: 200, rotation: 60 }, duration: 1, ease: 'none' }], ...extra });
  const nest = (seqs, extra = {}) => ({ type: 'composition', name: 'N', width: W, height: H, initial: { x: 170, y: 95, pivotX: 160, pivotY: 90, scale: 0.8, rotation: 12 }, sequences: seqs, ...extra });
  const pairs = {
    'top level': { test: [blob(), white({ mask: 'm' })], ref: [blob()] },
    'nested comp, moved / scaled / rotated': { test: [nest([blob(), white({ mask: 'm' })])], ref: [nest([blob()])] },
    'nested comp with a blur filter of its own': { test: [nest([blob(), white({ mask: 'm' })], { filters: [{ type: 'blur', strength: 4 }] })], ref: [nest([blob()], { filters: [{ type: 'blur', strength: 4 }] })] },
    'threeD comp (rotationY 25) holding the matte': { test: [nest([blob(), white({ mask: 'm' })], { threeD: true, initial: { x: 160, y: 90, rotationY: 25 } })], ref: [nest([blob()], { threeD: true, initial: { x: 160, y: 90, rotationY: 25 } })] },
    'matted layer has parent (a moving null)': {
      test: [{ type: 'null', name: 'P', initial: { x: 40, y: 0 }, keyframes: [{ at: 0, to: { x: -40 }, duration: 1 }] }, blob(), white({ mask: 'm', parent: 'P', width: 480, initial: { x: -80, y: 0, fillColor: '#ffffff' } })],
      ref: [blob()] },
    'MATTE layer has parent (a moving null)': {
      test: [{ type: 'null', name: 'P', initial: { x: 40, y: 20 }, keyframes: [{ at: 0, to: { x: -40 }, duration: 1 }] }, blob({ parent: 'P' }), white({ mask: 'm' })],
      ref: [{ type: 'null', name: 'P', initial: { x: 40, y: 20 }, keyframes: [{ at: 0, to: { x: -40 }, duration: 1 }] }, blob({ parent: 'P' })] },
    'time-remapped comp (speed 2) holding both': { test: [nest([blob(), white({ mask: 'm' })], { speed: 2, initial: {} })], ref: [nest([blob()], { speed: 2, initial: {} })] },
    'matte with a lifespan (at 0.3, duration 0.4)': { test: [blob({ at: 0.3, duration: 0.4 }), white({ mask: 'm' })], ref: [blob({ at: 0.3, duration: 0.4 })] },
    'matte with a filter of its own (blur)': { test: [blob({ filters: [{ type: 'blur', strength: 6 }] }), white({ mask: 'm' })], ref: [blob({ filters: [{ type: 'blur', strength: 6 }] })] },
  };
  const out = [];
  for (const [name, p] of Object.entries(pairs)) {
    const r = { case: name };
    for (const f of [0, 15, 25]) {
      await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: { sequences: p.ref } })})`);
      const ref = await cdp.eval(`snap(${f})`);
      await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: { sequences: p.test } })})`);
      const got = await cdp.eval(`snap(${f})`);
      const logs = (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU'));
      const d = await cdp.eval(`diffCount(${JSON.stringify(ref)}, ${JSON.stringify(got)}, 24)`);
      r[`f${f}`] = `${d.n} px > 24 (max ${d.max})`;
      if (logs.length) r.logs = logs;
      if (f === 15) { await save(`q4-${backend}-${name.replace(/[^a-z0-9]+/gi, '_')}-ref.png`, ref); await save(`q4-${backend}-${name.replace(/[^a-z0-9]+/gi, '_')}-test.png`, got); }
    }
    out.push(r);
  }
  // a transition whose `from` scene uses a named matte, and inspect on a matted composition
  const tr = { sequences: [blob({ duration: 1 }), white({ name: 'A', mask: 'm', duration: 0.7 }), { type: 'shape', shape: 'rect', name: 'B', at: 0.3, width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#3060c0' } }],
    transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 0.3, duration: 0.4, direction: 'left' }] };
  let trOut;
  try {
    await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: tr })})`);
    const u = await cdp.eval('snap(15)'); await save(`q4-${backend}-transition-from-matted.png`, u);
    trOut = { logs: (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU')) };
  } catch (e) { trOut = { error: String(e).slice(0, 300) }; }
  await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, composition: { sequences: [blob(), { type: 'text', name: 'T', text: 'HELLO', style: { fontSize: 60, fill: '#ffffff' }, initial: { x: 160, y: 90, anchorX: 0.5, anchorY: 0.5 }, mask: 'm' }] } })})`);
  const insp = await cdp.eval(`(async () => { const r = await movie.inspect(15); return { issues: r.issues, layers: r.layers.map(l => ({ path: l.path, type: l.type, visible: l.visible, bounds: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height].map(Math.round) })) }; })()`);
  return { backend, pairs: out, transition: trOut, inspect: insp };
}

/** Q5: luma wipe between two scenes, built-in radial map and an image asset map; plus a wipe from a scene that has a named matte. */
export async function q5({ cdp, save, backend }) {
  const W = 320, H = 180;
  const scene = (name, fill, letter, extra = {}) => ({ type: 'composition', name, width: W, height: H, ...extra, sequences: [
    { type: 'shape', shape: 'rect', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: fill } },
    { type: 'text', text: letter, style: { fontSize: 120, fontWeight: '900', fill: '#ffffff', fontFamily: 'sans-serif' }, initial: { x: 160, y: 90, anchorX: 0.5, anchorY: 0.5 } }] });
  const map = await cdp.eval(`(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) { const v = Math.round(255 * (0.5 + 0.5 * Math.sin(x / 18) * Math.cos(y / 14)) * 0.6 + 255 * 0.4 * (x / 320)); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x, y, 1, 1); }
    return c.toDataURL('image/png'); })()`);
  const out = {};
  for (const [label, tr, assets] of [
    ['radial', { kind: 'luma', from: 'A', to: 'B', at: 0.2, duration: 0.6, map: 'radial', softness: 0.08 }, []],
    ['image map', { kind: 'luma', from: 'A', to: 'B', at: 0.2, duration: 0.6, map: 'lumamap', softness: 0.15 }, [{ name: 'lumamap', src: map }]],
  ]) {
    await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, duration: 1, assets, composition: { sequences: [scene('A', '#c03030', 'A', { duration: 0.8 }), scene('B', '#3050c0', 'B', { at: 0.2, duration: 0.8 })], transitions: [tr] } })})`);
    const frames = [6, 10, 14, 18, 23];
    const shots = [];
    for (const f of frames) { const u = await cdp.eval(`snap(${f})`); shots.push(u); await save(`q5-${backend}-${label.replace(/ /g, '_')}-f${String(f).padStart(2, '0')}.png`, u); }
    const mid = await cdp.eval(`pxs(${JSON.stringify(shots[2])}, [[160, 20], [5, 5], [315, 175]])`);
    const o = await cdp.eval(`orders(${JSON.stringify(frames)})`);
    out[label] = { midFrame14: { centreTop: mid[0].slice(0, 3), corner: mid[1].slice(0, 3), otherCorner: mid[2].slice(0, 3) }, seekOrders: o, logs: (await cdp.eval('__logs')).filter(l => !l.includes('WebGPU')).map(l => l.slice(0, 400)) };
  }
  // a wipe from a scene that is matted by a named sibling matte (the wrapper carries the matte)
  const m = { type: 'shape', shape: 'circle', name: 'm', radius: 70, initial: { x: 160, y: 90, fillColor: '#ffffff' } };
  await cdp.eval(`mk(${JSON.stringify({ width: W, height: H, duration: 1, composition: { sequences: [m, { ...scene('A', '#c03030', 'A', { duration: 0.8 }), mask: 'm' }, scene('B', '#3050c0', 'B', { at: 0.2, duration: 0.8 })], transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 0.2, duration: 0.6, direction: 'left' }] } })})`);
  const u = await cdp.eval('snap(14)'); await save(`q5-${backend}-wipe-from-matted.png`, u);
  out['wipe from a matted scene'] = { logs: (await cdp.eval('__logs')).filter(l => l.includes('pixi-effects') && !l.includes('WebGPU')) };
  return { backend, ...out };
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

/** Q2 again with a text layer as the shared matte, growing (scale and x keyframes). */
export async function q2b(ctx) {
  const matte = { type: 'text', name: 'wipe', text: 'MATTE', style: { fontSize: 90, fontWeight: '900', fill: '#ffffff', fontFamily: 'sans-serif' },
    initial: { x: 40, y: 90, anchorX: 0, anchorY: 0.5, scale: 0.6 }, keyframes: [{ at: 0, to: { scale: 1.2, x: 10 }, duration: 1, ease: 'none' }] };
  return q2(ctx, { matte, tag: 'text-' });
}
