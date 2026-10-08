const layers = (n) => Array.from({ length: n }, (_, i) => ({ type: 'shape', shape: i % 2 ? 'circle' : 'rect', radius: 6, width: 12, height: 12, at: (i % 10) * 0.1, duration: 3,
  initial: { x: (i * 37) % 300, y: (i * 53) % 170, fillColor: '#ffffff' }, keyframes: [{ at: 0, to: { x: ((i * 37) % 300) + 20, rotation: 90 }, duration: 3, ease: 'power1.inOut' }, { at: 1, from: { alpha: 0.5 }, duration: 1 }] }));
const variants = {
  plain: dur => ({ type: 'composition', duration: dur, sequences: layers(200) }),
  speed2: dur => ({ type: 'composition', duration: dur, speed: 1, sequences: layers(200) }),
  timeKf: dur => ({ type: 'composition', duration: dur, keyframes: [{ at: 0, from: { time: 0 }, to: { time: dur }, duration: dur, ease: 'none' }], sequences: layers(200) }),
  nested2: dur => ({ type: 'composition', duration: dur, speed: 1, sequences: [{ type: 'composition', duration: dur, speed: 1, sequences: layers(200) }] }),
};
const res = {};
for (const rep of [0, 1]) {
  for (const [name, mkc] of Object.entries(variants)) {
    const t0 = performance.now();
    await mk({ frameRate: 30, duration: 4, composition: { sequences: [mkc(4)] } });
    const initMs = performance.now() - t0;
    // timeline seek only (no render)
    const tl = movie.timeline; let t1 = performance.now();
    for (let i = 0; i < 2000; i++) tl.time(((i * 7) % 120) / 30);
    const seekMs = (performance.now() - t1) / 2000;
    // full frame (seek + render), sequential
    t1 = performance.now();
    for (let f = 0; f < 120; f++) await movie.gotoFrame(f, true);
    const frameMs = (performance.now() - t1) / 120;
    if (rep) res[name] = { initMs: +initMs.toFixed(0), seekOnlyMs: +seekMs.toFixed(3), fullFrameMs: +frameMs.toFixed(2) };
  }
}
return res;
