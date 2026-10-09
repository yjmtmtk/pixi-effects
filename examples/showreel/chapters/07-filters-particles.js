// 07 FILTERS AND PARTICLES: one word, five looks (a new one every 1.2 s), each named on screen with the data that made it.
// glow, then crt, then glitch + rgbSplit, then a seeded particle burst, and film grain over the whole frame at the end.
export default function chapter(P) {
  const { C, F } = P;
  const WORD = 'SIGNAL';
  const CX = 960, CY = 470;                       // where the word sits
  const BEAT = 1.2, T0 = 1.0;                     // a new treatment every 1.2 s, the first at 1.0 s
  const at = (i) => Math.round((T0 + i * BEAT) * 100) / 100;   // 1.0, 2.2, 3.4, 4.6, 5.8
  const END = 7;

  // The word itself, with the filters of its look. Positions are in the local space of the window composition below.
  const word = (name, filters, keyframes = []) => ({
    type: 'text', name, text: WORD,
    style: { fontSize: 330, fill: C.bone, fontFamily: F.display, letterSpacing: 6 },
    initial: { x: CX, y: CY, anchorX: 0.5, anchorY: 0.5 },
    filters, keyframes,
  });

  // A soft pool of light behind the word: mid-tones for the grain, the CRT and the glow to work on.
  const backdrop = (name) => ({
    type: 'shape', shape: 'rect', name, width: 1920, height: 1080, anchorX: 0, anchorY: 0,
    fillGradient: { type: 'radial', center: [0.5, 0.45], radius: 0.75, stops: [[0, '#2b3247'], [0.55, '#151a28'], [1, C.ink]] },
    initial: { x: 0, y: 0 },
  });

  // One window of the sequence: a 1920 x 1080 composition that lives from `from` for `len` seconds.
  const win = (name, from, len, children, filters) => ({
    type: 'composition', name, width: 1920, height: 1080, at: from, duration: len,
    filters, sequences: [backdrop(name + '-back'), ...children],
  });

  const glowAt = (strength) => ({ type: 'glow', name: 'halo', distance: 28, outerStrength: strength, innerStrength: 0, color: 0xff5a36, quality: 0.3 });

  // The label of each look: a big word in vermilion and the filter's own data line under it.
  const looks = [
    { label: 'PLAIN',            data: "text: 'SIGNAL'",                              from: 0.7,  to: at(0) },
    { label: 'GLOW',             data: "{ type: 'glow', outerStrength: 5 }",           from: at(0), to: at(1) },
    { label: 'CRT',              data: "+ { type: 'crt', curvature: 4 }",              from: at(1), to: at(2) },
    { label: 'GLITCH + RGB SPLIT', data: "+ { type: 'glitch' } + { type: 'rgbSplit' }", from: at(2), to: at(3) },
    { label: 'PARTICLES',        data: '...particles({ count: 220, seed: 7 })',        from: at(3), to: at(4) },
    { label: 'FILM GRAIN',       data: "{ type: 'grain', amount: 0.12 }",              from: at(4), to: END },
  ];
  const labels = looks.flatMap((l, i) => [
    { type: 'text', name: 'label-' + i, text: l.label, at: l.from, duration: l.to - l.from,
      style: { fontSize: 64, fill: i === 0 ? C.dim : C.red, fontFamily: F.mono, letterSpacing: 10, fontWeight: 'bold' },
      initial: { x: 96, y: 800, anchorX: 0, anchorY: 0.5 },
      keyframes: i === 0 ? [{ at: 0, from: { alpha: 0 }, to: { alpha: 1 }, duration: 0.4 }]
        : [{ at: 0, from: { alpha: 0, x: 76 }, to: { alpha: 1, x: 96 }, duration: 0.22, ease: 'power3.out' }] },
    { type: 'text', name: 'data-' + i, text: l.data, at: l.from, duration: l.to - l.from,
      style: { fontSize: 40, fill: C.bone, fontFamily: F.mono },
      initial: { x: 96, y: 996, anchorX: 0, anchorY: 0.5 },
      keyframes: [{ at: 0, from: { alpha: 0 }, to: { alpha: 0.9 }, duration: i === 0 ? 0.4 : 0.22 }] },
  ]);

  // The windows. Each look keeps what the one before added (the filters stack), so the word is built up, not swapped.
  // 0 PLAIN: calm, nothing but the word.
  const plain = win('w-plain', 0, at(0), [word('word-plain', [], [{ at: 0, to: { scale: 1.02 }, duration: at(0), ease: 'none' }])]);

  // 1 GLOW: the halo swells in.
  const glow = win('w-glow', at(0), BEAT, [
    word('word-glow', [glowAt(0)], [
      { at: 0, from: { scale: 1.02 }, to: { scale: 1.02 }, duration: 0.01 },
      { at: 0, to: { 'filters.halo.outerStrength': 5 }, duration: 0.45, ease: 'power3.out' },
    ]),
  ]);

  // 2 CRT: scanlines, curved glass and a vignette are switched on; the lines crawl.
  const crt = win('w-crt', at(1), BEAT, [
    word('word-crt', [glowAt(5)], [{ at: 0, from: { scale: 1.02 }, to: { scale: 1.02 }, duration: 0.01 }]),
  ], [
    { type: 'crt', name: 'tube', curvature: 4, lineWidth: 3, lineContrast: 0.35, noise: 0.12, noiseSize: 1, vignetting: 0.3, vignettingAlpha: 0.9, vignettingBlur: 0.3, time: 0 },
  ]);
  // the tube's own clock crawls the lines; lineContrast comes up as the glass lights
  crt.keyframes = [{ at: 0, from: { 'filters.tube.lineContrast': 0 }, to: { 'filters.tube.lineContrast': 0.35 }, duration: 0.3, ease: 'power2.out' },
                   { at: 0, from: { 'filters.tube.time': 0 }, to: { 'filters.tube.time': 3 }, duration: BEAT, ease: 'none' }];

  // 3 GLITCH + RGB SPLIT: the picture tears into slices (a new seed every 3 frames), the colour channels pull apart, the word jitters.
  const gSteps = [];
  for (let i = 0; i < 12; i++) gSteps.push({ at: i * 0.1, set: { 'filters.tear.seed': Math.floor(P.random(11 + i)() * 900) / 10 } });
  const glitch = win('w-glitch', at(2), BEAT, [
    word('word-glitch', [glowAt(5)], [
      ...P.wiggle({ duration: BEAT, freq: 14, seed: 4, props: { x: { around: CX, amp: 16 }, rotation: { around: 0, amp: 1.2 } } }),
    ]),
  ], [
    { type: 'crt', name: 'tube', curvature: 4, lineWidth: 3, lineContrast: 0.35, noise: 0.12, vignetting: 0.3, vignettingAlpha: 0.9, vignettingBlur: 0.3, time: 3 },
    { type: 'glitch', name: 'tear', slices: 9, offset: 90, direction: 0, seed: 1, average: false, minSize: 8, sampleSize: 512 },
    { type: 'rgbSplit', name: 'split', red: { x: -16, y: 0 }, green: { x: 0, y: 6 }, blue: { x: 16, y: 0 } },
  ]);
  glitch.keyframes = [
    ...gSteps,
    { at: 0, from: { 'filters.tube.time': 3 }, to: { 'filters.tube.time': 6 }, duration: BEAT, ease: 'none' },
    { at: 0.9, to: { 'filters.tear.offset': 0 }, duration: 0.25, ease: 'power2.in' },
  ];

  // 4 PARTICLES: the picture snaps clean, the word slams, the glow flares and a seeded burst leaves it.
  const bx = CX, by = CY;
  const burstAt = at(3);
  const burst = [
    ...P.particles({ count: 150, at: burstAt, life: [1.0, 1.9], area: { x: bx, y: by, width: 520, height: 120 }, angle: [0, 360], speed: [260, 980],
      gravity: 520, drag: 1.4, size: [4, 9], scale: [1, 0.2], fade: { out: 0.5 }, colors: [C.gold, C.red, C.bone], blendMode: 'add', seed: 7, name: 'sparks' }),
    ...P.particles({ count: 70, at: burstAt, life: [1.2, 1.8], area: { x: bx, y: by - 60, width: 700, height: 100 }, angle: [200, 340], speed: [320, 900],
      gravity: 900, drag: 0.8, size: [12, 22], scale: [1, 0.6], fade: { out: 0.4 }, colors: [C.red, C.gold, C.bone, C.cyan], shape: 'rect', spin: [-420, 420], seed: 8, name: 'confetti' }),
  ];
  const ring = { type: 'shape', shape: 'circle', name: 'ring', radius: 150, at: burstAt, duration: 0.8,
    initial: { x: bx, y: by, fillAlpha: 0, strokeColor: C.gold, strokeWidth: 10, strokeAlpha: 0.9, scale: 0.4 },
    keyframes: [{ at: 0, to: { scale: 4.2, strokeAlpha: 0, strokeWidth: 2 }, duration: 0.8, ease: 'power3.out' }] };
  const slam = win('w-burst', at(3), BEAT, [
    word('word-burst', [glowAt(5)], [
      { at: 0, from: { scale: 1.16 }, to: { scale: 1.02 }, duration: 0.5, ease: 'power3.out' },
      { at: 0, from: { 'filters.halo.outerStrength': 14 }, to: { 'filters.halo.outerStrength': 5 }, duration: 0.7, ease: 'power2.out' },
    ]),
  ]);

  // 5 GRAIN: the word settles; the grain of the whole scene (below) comes up to show.
  const settle = win('w-grain', at(4), END - at(4), [
    word('word-grain', [glowAt(5)], [{ at: 0, from: { scale: 1.02 }, to: { scale: 1.0 }, duration: END - at(4), ease: 'power1.inOut' }]),
  ]);

  const sfx = [
    { type: 'audio', name: 'sfx-glow', sfx: 'chime', at: at(0), volume: 0.35 },
    { type: 'audio', name: 'sfx-crt', sfx: 'beep', at: at(1), volume: 0.3 },
    { type: 'audio', name: 'sfx-glitch', sfx: 'glitch', at: at(2), volume: 0.5 },
    { type: 'audio', name: 'sfx-hit', sfx: 'hit', at: at(3), volume: 0.5 },
    { type: 'audio', name: 'sfx-pop', sfx: 'pop', at: at(3) + 0.03, volume: 0.35 },
    { type: 'audio', name: 'sfx-grain', sfx: 'swoosh', at: at(4) - 0.1, volume: 0.25 },
  ];

  // Everything sits in one scene so the film grain lies over the whole frame, the labels too.
  const scene = {
    type: 'composition', name: 'scene', width: 1920, height: 1080,
    filters: [{ type: 'grain', name: 'film', amount: 0.03, size: 1.6, seed: 5, fps: 24 }],
    keyframes: [{ at: at(4), from: { 'filters.film.amount': 0.03 }, to: { 'filters.film.amount': 0.12 }, duration: 0.5, ease: 'power2.out' }],
    sequences: [plain, glow, crt, glitch, slam, settle, ring, ...burst, ...labels],
  };

  return {
    duration: 7,
    poster: at(3) + 0.5,
    sequences: [
      P.bg(C.ink),
      scene,
      ...P.tag('07', 'FILTERS AND PARTICLES', null, { at: 0.7 }),
      ...sfx,
    ],
  };
}
