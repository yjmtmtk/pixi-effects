// threeD + camera inside / around a remapped composition; nested remaps; mask; `at`; motion blur
const W = 320, H = 180;
const bg = { type: 'shape', shape: 'rect', width: W, height: H, initial: { x: W / 2, y: H / 2, fillColor: '#101830' } };
const card = (name, z, x, c) => ({ type: 'shape', shape: 'rect', name, width: 80, height: 60, threeD: true, initial: { x, y: 90, z, fillColor: c } });
const scene3d = () => [bg,
  { type: 'camera', name: 'cam', keyframes: [{ at: 0, from: { x: 60, lookAtX: 60 }, to: { x: 260, lookAtX: 260 }, duration: 4, ease: 'sine.inOut' }, { at: 4.5, to: { fov: 70 }, duration: 3, ease: 'none' }] },
  card('far', -400, 100, '#31507a'), card('mid', -100, 160, '#7a3150'), card('near', 200, 220, '#50a131'),
  { type: 'shape', shape: 'rect', name: 'spin', width: 60, height: 60, threeD: true, initial: { x: 160, y: 90, z: 0, fillColor: '#ffffff' }, keyframes: [{ at: 1, to: { rotationY: 180 }, duration: 3, ease: 'none' }] }];
const res = {};
const sampleFrames = []; for (let f = 2; f < 240; f += 12) sampleFrames.push(f);
async function oracle(label, inner, extraOuter, g, extraPlain = {}, outerWrap = x => x, fr = 60) {
  await mk({ frameRate: fr, duration: 8, composition: { sequences: outerWrap([{ type: 'composition', width: W, height: H, duration: 8, sequences: inner(), ...extraPlain }]) } });
  const want = {};
  for (const f of sampleFrames) { const fp = Math.round(g(f / fr) * fr); if (!(fp in want)) want[fp] = await snap(fp); }
  await mk({ frameRate: fr, duration: 4, composition: { sequences: outerWrap([{ type: 'composition', width: W, height: H, duration: 4, sequences: inner(), ...extraOuter }]) } });
  let bad = 0, maxd = 0; const badFrames = [];
  for (const f of sampleFrames) { const d = await diff(await snap(f), want[Math.round(g(f / fr) * fr)]); if (d > 0) { bad++; maxd = Math.max(maxd, d); if (badFrames.length < 4) badFrames.push(f); } }
  const o = await orders(sampleFrames); delete o.fwd;
  res[label] = { bad, n: sampleFrames.length, maxd, badFrames, bwd: o.bwdMax, jmp: o.jmpMax, logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 2) };
}
await oracle('3d cam inside speed2', scene3d, { speed: 2 }, t => 2 * t);
await oracle('3d cam inside reverse', scene3d, { speed: -1 }, t => 4 - t);
// the remapped comp is itself a threeD layer (rotating in the outer space) holding a camera scene: oracle vs the same unremapped
const spinOuter = { threeD: true, initial: { x: W / 2, y: H / 2 }, keyframes: [{ at: 0, to: { rotationY: 40 }, duration: 8, ease: 'none' }] };
const spinOuterRemap = { threeD: true, initial: { x: W / 2, y: H / 2 }, keyframes: [{ at: 0, to: { rotationY: 40 }, duration: 8, ease: 'none' }] };
// NOTE: the outer spin is a function of OUTER time; so oracle = plain comp (8s) with rotation at the same outer time is not the same; compare seek-orders only
await mk({ frameRate: 60, duration: 4, composition: { sequences: [bg, { type: 'composition', width: W, height: H, duration: 4, speed: 2, ...spinOuterRemap, sequences: scene3d() }] } });
{ const o = await orders(sampleFrames); res['3d comp remapped AND threeD-rotated: orders'] = { bwd: o.bwdMax, jmp: o.jmpMax, jmp2: o.jmp2Max, logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 2) }; }
// oracle for it: plain 8s comp rotated by the SAME outer time function: rotationY(t) = 40/8*t_outer. Make the plain one rotate at 5*2t=10*t ... i.e. rotationY(local) with local = 2t -> 5*local
await oracle('3d comp remapped AND threeD-rotated oracle', scene3d, { speed: 2, threeD: true, initial: { x: W / 2, y: H / 2 }, keyframes: [{ at: 0, to: { rotationY: 40 }, duration: 4, ease: 'none' }] }, t => 2 * t,
  { threeD: true, initial: { x: W / 2, y: H / 2 }, keyframes: [{ at: 0, to: { rotationY: 40 }, duration: 8, ease: 'none' }] });
// nested remaps: outer speed 2 of inner speed -1 (inner duration 8): local = 2t -> inner local = 8 - 2t
const simple = () => [bg, { type: 'shape', shape: 'rect', width: 40, height: 40, initial: { x: 40, y: 90, fillColor: '#fff' }, keyframes: [{ at: 0, to: { x: 280 }, duration: 8, ease: 'none' }, { at: 2, from: { scale: 0.5 }, duration: 1 }] }];
await mk({ frameRate: 60, duration: 8, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 8, sequences: simple() }] } });
{
  const want = {}; const g = t => 8 - 2 * t;
  for (const f of sampleFrames) { const fp = Math.round(g(f / 60) * 60); if (!(fp in want)) want[fp] = await snap(fp); }
  await mk({ frameRate: 60, duration: 4, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 4, speed: 2, sequences: [{ type: 'composition', width: W, height: H, duration: 8, speed: -1, sequences: simple() }] }] } });
  let bad = 0; for (const f of sampleFrames) if (await diff(await snap(f), want[Math.round(g(f / 60) * 60)]) > 0) bad++;
  const o = await orders(sampleFrames);
  res['nested remap (2x of -1x)'] = { bad, n: sampleFrames.length, bwd: o.bwdMax, jmp: o.jmpMax, logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 2) };
}
// remapped comp with `at: 2` (starts later in outer time): local 0 at t=2
await mk({ frameRate: 60, duration: 8, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 8, sequences: simple() }] } });
{
  const want = {}; const g = t => 2 * (t - 2);
  for (const f of sampleFrames) if (f / 60 >= 2) { const fp = Math.round(g(f / 60) * 60); if (!(fp in want)) want[fp] = await snap(fp); }
  await mk({ frameRate: 60, duration: 6, composition: { sequences: [{ type: 'composition', width: W, height: H, at: 2, duration: 4, speed: 2, sequences: simple() }] } });
  let bad = 0, n = 0; for (const f of sampleFrames) if (f / 60 >= 2) { n++; if (await diff(await snap(f), want[Math.round(g(f / 60) * 60)]) > 0) bad++; }
  const o = await orders(sampleFrames);
  res['remapped comp with at:2'] = { bad, n, bwd: o.bwdMax, jmp: o.jmpMax, logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 2) };
}
// motion blur: movie-level 8 samples; reverse remap of a moving rect: blurred frame at t vs blurred plain at the mapped time (blur is symmetric in time so reverse must be pixel-equal up to sample order)
{
  const mb = { samples: 8, shutter: 0.5 };
  await mk({ frameRate: 30, duration: 4, motionBlur: mb, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 4, sequences: simple().map(s => ({ ...s, duration: 4 })) }] } });
  const plain = {}; for (const f of [30, 60, 90]) plain[f] = await movie.snapshot(f, { as: 'dataURL' });
  await mk({ frameRate: 30, duration: 4, motionBlur: mb, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 4, speed: -1, sequences: simple().map(s => ({ ...s, duration: 4 })) }] } });
  const out = {};
  for (const f of [30, 60, 90]) { const s = await movie.snapshot(f, { as: 'dataURL' }); out[f] = await diff(s, plain[120 - f]); }
  // and the unblurred reference: is blur direction right? compare reverse-blurred at 60 vs plain-blurred at 60 (centre of a symmetric move)
  res['motion blur reverse vs plain mapped (maxdiff per frame)'] = out;
}
return res;
