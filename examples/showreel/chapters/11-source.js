// Chapter 11 — SOURCE: the reveal that the whole reel is data. (1) real lines of the reel's own JSON scroll past, (2) three measured numbers,
// (3) the install line as the last frame. P.facts is empty in the one-chapter check page: a sample stands in until the build fills it.
export default function chapter(P) {
  const { C, F } = P;
  const D = 8;

  // ---- the facts (real in the built reel, a plausible sample in the check page) ----------------------------------------------------
  const facts = P.facts || {};
  const real = Array.isArray(facts.lines) && facts.lines.length > 0;
  const SAMPLE = [
    '{', '  "type": "camera",', '  "name": "cam",', '  "initial": { "z": 0, "fov": 40, "focus": "title" },', '  "keyframes": [',
    '    { "at": 0.5, "to": { "focus": "card-2" }, "duration": 1.2, "ease": "power2.inOut" },', '    { "at": 2, "to": { "offsetZ": -300 }, "duration": 3 }',
    '  ]', '},', '{', '  "type": "text",', '  "name": "title-3",', '  "text": "SPACE",', '  "style": { "fontSize": 240, "fill": "#f2ede4", "fontFamily": "Arial Black" },',
    '  "initial": { "x": 960, "y": 540, "anchorX": 0.5, "anchorY": 0.5, "alpha": 0 },', '  "keyframes": [',
    '    { "at": 0.6, "from": { "y": 600 }, "to": { "y": 540, "alpha": 1 }, "duration": 0.8, "ease": "power3.out" }', '  ],', '  "threeD": true', '},',
    '{', '  "type": "light",', '  "kind": "spot",', '  "castsShadows": true,', '  "initial": { "x": 400, "y": 200, "z": 600, "intensity": 1.2, "coneAngle": 40 }', '},',
    '{', '  "type": "audio",', '  "sfx": "swoosh",', '  "at": 2.4,', '  "volume": 0.4', '},', '{', '  "type": "shape",', '  "shape": "arc",', '  "radius": 200,',
    '  "startAngle": -90,', '  "endAngle": -90,', '  "strokeCap": "round",', '  "initial": { "x": 960, "y": 540, "strokeColor": "#ff5a36", "strokeWidth": 24 },',
    '  "keyframes": [{ "at": 1, "to": { "endAngle": 270 }, "duration": 2, "ease": "power2.inOut" }]', '},',
    '{', '  "type": "shader",', '  "name": "field",', '  "fragment": "void mainImage(out vec4 fragColor, in vec2 fragCoord) { vec2 uv = fragCoord / iResolution.xy; …",',
    '  "uniforms": { "speed": 1, "tint": "#38c8ff" }', '},',
  ];
  const lines = real ? facts.lines : [...SAMPLE, ...SAMPLE];
  const lineCount = real ? facts.lineCount : 6000;
  const kb = real ? facts.kb : 300;
  const layers = real ? facts.layers : 1200;
  const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---- beat 1: the wall of data -----------------------------------------------------------------------------------------------------
  const LH = 46, FS = 36, COLS = 78, X0 = 96, TOP = 140, VIEW = 800, SHOW = 96;
  const monoStyle = { fontSize: FS, fill: C.bone, fontFamily: F.mono };
  // start the slice at the first camera (a telling line) if there is one; a long line is cut to the width of the wall
  let start = 0;
  if (real) { const i = lines.findIndex(l => /"type": "camera"/.test(l)); start = Math.max(0, (i < 0 ? 0 : i) - 24); }
  const slice = lines.slice(start, start + SHOW).map(l => (l.length > COLS ? l.slice(0, COLS - 1) + '…' : l));
  const charW = P.measureText('M', monoStyle).width;
  const wallLayers = [];
  slice.forEach((text, i) => {
    const y = TOP + i * LH;
    wallLayers.push({ type: 'text', name: `src-${i}`, text, style: monoStyle, initial: { x: X0, y, anchorX: 0, anchorY: 0 } });
    const m = text.match(/^(\s*"type": )("[a-z]+")/);              // the kind of every layer, in the signal colour
    if (m) wallLayers.push({ type: 'text', name: `key-${i}`, text: m[2], style: { ...monoStyle, fill: C.red }, initial: { x: X0 + m[1].length * charW, y, anchorX: 0, anchorY: 0 } });
  });
  const contentH = slice.length * LH;
  const SCROLL = Math.min(2800, contentH - VIEW - 600);                 // the fast scroll, then a slow drift of 600 px: both stay inside the content
  const wall = {
    type: 'composition', name: 'wall', width: 1920, height: TOP + contentH + 200, at: 0, duration: 5.6, sequences: wallLayers,
    initial: { x: 0, y: 0 },
    mask: { type: 'shape', shape: 'rect', width: 1728, height: VIEW, anchorX: 0, anchorY: 0, initial: { x: X0, y: TOP, fillColor: '#ffffff' } },
    keyframes: [
      { at: 0.6, to: { y: -SCROLL }, duration: 2.7, ease: 'power2.in' },
      { at: 3.3, to: { y: -SCROLL - 600 }, duration: 2.3, ease: 'none' },
      { at: 3.3, to: { alpha: 0.25 }, duration: 0.25 },
      { at: 5.3, to: { alpha: 0 }, duration: 0.3 },
    ],
  };
  const fade = (name, y, stops) => ({ type: 'shape', shape: 'rect', name, width: 1728, height: 150, anchorX: 0, anchorY: 0, at: 0, duration: 5.6,
    fillGradient: { type: 'linear', angle: 90, stops }, initial: { x: X0, y } });
  const readHead = { type: 'shape', shape: 'rect', name: 'read-head', width: 1728, height: LH + 8, anchorX: 0, anchorY: 0.5, at: 0, duration: 3.5,
    initial: { x: X0, y: 540, fillColor: C.ink2, alpha: 0 }, keyframes: [{ at: 0.6, to: { alpha: 1 }, duration: 0.4 }, { at: 3.25, to: { alpha: 0 }, duration: 0.2 }] };
  const linesLabel = { type: 'text', name: 'lines-label', text: `${num(lineCount)} lines`, style: { fontSize: 34, fill: C.dim, fontFamily: F.mono, letterSpacing: 2 },
    at: 0, duration: 3.5, initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 0.7, to: { alpha: 1 }, duration: 0.5 }, { at: 3.25, to: { alpha: 0 }, duration: 0.2 }] };
  // a veil over the wall under the numbers (one layer, so the wall dims as one picture)
  const veil = { type: 'shape', shape: 'rect', name: 'veil', width: 1920, height: 1080, anchorX: 0, anchorY: 0, at: 3.3, duration: D - 3.3,
    initial: { x: 0, y: 0, fillColor: C.ink, alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 0.85 }, duration: 0.25 }, { at: 2, to: { alpha: 1 }, duration: 0.3 }] };

  // ---- beat 2: three numbers --------------------------------------------------------------------------------------------------------
  const numStyle = { fontSize: 170, fill: C.bone, fontFamily: F.display };
  const unitStyle = { fontSize: 56, fill: C.dim, fontFamily: F.mono, letterSpacing: 2 };
  const rows = [
    { n: '1', unit: 'file', color: C.red },
    { n: num(kb), unit: 'KB' },
    { n: num(layers), unit: 'layers' },
  ];
  const NUM_AT = 3.4, NUM_END = 5.55;
  const numbers = [];
  rows.forEach((r, i) => {
    const y = 300 + i * 245, at = NUM_AT + i * 0.15;
    const w = P.measureText(r.n, numStyle).width;
    const life = NUM_END - at;
    const enter = (yy, dy) => [{ at: 0, from: { y: yy + dy, alpha: 0 }, to: { y: yy, alpha: 1 }, duration: 0.6, ease: 'power3.out' }, { at: -0.25, to: { alpha: 0 }, duration: 0.25 }];
    numbers.push({ type: 'text', name: `num-${i}`, text: r.n, style: { ...numStyle, fill: r.color ?? C.bone }, at, duration: life,
      initial: { x: X0, y, anchorX: 0, anchorY: 0.5 }, keyframes: enter(y, 70) });
    numbers.push({ type: 'text', name: `unit-${i}`, text: r.unit, style: unitStyle, at: at + 0.08, duration: life - 0.08,
      initial: { x: X0 + w + 40, y: y + 30, anchorX: 0, anchorY: 0.5 }, keyframes: enter(y + 30, 50) });
  });

  // ---- beat 3: the lock-up (the last frame of the reel) -------------------------------------------------------------------------------
  const LOCK_AT = 5.6;
  const cmdStyle = { fontSize: 92, fill: C.bone, fontFamily: F.mono, fontWeight: 'bold' };
  const cmdW = P.measureText('npm i pixi-effects', cmdStyle).width;
  const rise = (y, dy, at, dur = 0.7) => [{ at, from: { y: y + dy, alpha: 0 }, to: { y, alpha: 1 }, duration: dur, ease: 'power3.out' }];
  const lockup = [
    { type: 'text', name: 'cmd', text: 'npm i pixi-effects', style: cmdStyle, at: LOCK_AT, duration: D - LOCK_AT,
      initial: { x: 960, y: 450, anchorX: 0.5, anchorY: 0.5 }, keyframes: rise(450, 60, 0) },
    { type: 'shape', shape: 'rect', name: 'cursor', width: Math.round(charW * 92 / FS * 0.9), height: 96, anchorX: 0, anchorY: 0.5, at: LOCK_AT, duration: D - LOCK_AT,
      initial: { x: 960 + cmdW / 2 + 22, y: 450, fillColor: C.red, alpha: 0 }, keyframes: [{ at: 0.5, to: { alpha: 1 }, duration: 0.2 }] },
    { type: 'text', name: 'url', text: 'github.com/yjmtmtk/pixi-effects', style: { fontSize: 48, fill: C.dim, fontFamily: F.mono, letterSpacing: 1 }, at: LOCK_AT + 0.15, duration: D - LOCK_AT - 0.15,
      initial: { x: 960, y: 590, anchorX: 0.5, anchorY: 0.5 }, keyframes: rise(590, 40, 0) },
    { type: 'text', name: 'status', text: 'experimental · pre-1.0 · MIT', style: { fontSize: 44, fill: C.bone, fontFamily: F.mono, letterSpacing: 4 }, at: LOCK_AT + 0.3, duration: D - LOCK_AT - 0.3,
      initial: { x: 960, y: 690, anchorX: 0.5, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: 0, to: { alpha: 0.9 }, duration: 0.6 }] },
  ];

  // ---- label and sound ----------------------------------------------------------------------------------------------------------------
  const tag = P.tag('11', 'SOURCE', 'the data of this reel, as it is written');
  const caption = tag.find(l => l.name === 'caption');
  if (caption) caption.keyframes.push({ at: 3.3, set: { text: 'the whole reel, measured: one HTML page' } }, { at: LOCK_AT, set: { text: 'read it, run it, change it' } });
  const sfx = [
    { type: 'audio', name: 'sfx-cut', sfx: { preset: 'swipe', pitch: -4 }, at: 3.3, volume: 0.4 },
    ...rows.map((_, i) => ({ type: 'audio', name: `sfx-row-${i}`, sfx: { preset: 'click', pitch: i * 2 }, at: NUM_AT + i * 0.15 + 0.12, volume: 0.5 })),
    { type: 'audio', name: 'sfx-lock', sfx: { preset: 'hit', pitch: -6, brightness: -0.4 }, at: LOCK_AT + 0.05, volume: 0.45 },
  ];

  return {
    duration: D,
    poster: 4.6,
    sequences: [
      P.bg(C.ink),
      readHead,                                                         // under the lines: a highlight bar the data passes through
      wall,
      fade('fade-top', TOP, [[0, C.ink], [1, 'rgba(11,13,18,0)']]),
      fade('fade-bottom', TOP + VIEW - 150, [[0, 'rgba(11,13,18,0)'], [1, C.ink]]),
      veil,
      ...tag,
      linesLabel,
      ...numbers,
      ...lockup,
      ...sfx,
    ],
  };
}
