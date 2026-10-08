// composition remap: oracle (plain comp at mapped time) + seek orders, per feature and per remap case
const W = 320, H = 180;
const bg = { type: 'shape', shape: 'rect', width: W, height: H, initial: { x: W / 2, y: H / 2, fillColor: '#101830' } };
const FEATURES = {
  tween: () => [{ type: 'shape', shape: 'rect', name: 'mover', width: 40, height: 40, initial: { x: 40, y: 90, fillColor: '#ffffff' }, keyframes: [
    { at: 0, to: { x: 250 }, duration: 4, ease: 'none' }, { at: 4, to: { x: 20 }, duration: 3, ease: 'power2.inOut' },
    { at: 1, from: { alpha: 0.2 }, duration: 0.5 }, { at: 2, from: { scale: 0.5 }, to: { scale: 2 }, duration: 1.5 }] }],
  color: () => [{ type: 'shape', shape: 'rect', name: 'colorer', width: 100, height: 100, initial: { x: 160, y: 90, fillColor: '#00ff00' }, keyframes: [
    { at: 0, to: { fillColor: '#ff0000' }, duration: 3, ease: 'none' }, { at: 3, to: { fillColor: '#0000ff' }, duration: 2, ease: 'none' }] }],
  text: () => [{ type: 'text', name: 'T', text: 'A', initial: { x: 160, y: 90 }, style: { fontSize: 60, fill: '#ffffff' }, keyframes: [
    { at: 2, set: { text: 'B' } }, { at: 3, set: { fill: '#ff0000' } }, { at: 4, set: { text: 'C' } }, { at: 5, set: { fill: '#00ffff' } }] }],
  gradient: () => [{ type: 'shape', shape: 'rect', name: 'g', width: 200, height: 120, initial: { x: 160, y: 90 }, fillGradient: { angle: 0, stops: [[0, '#ff2d55'], [1, '#0ea5e9']] },
    keyframes: [{ at: 0, duration: 5, ease: 'none', to: { fillGradient: { angle: 360, stops: [[0, '#00e5ff'], [1, '#ffd60a']] } } }] }],
  particles: () => particles({ count: 25, at: 1, emit: 1, life: [1, 2], area: { x: 160, y: 140 }, angle: [-120, -60], speed: [100, 200], gravity: 150, size: [2, 4], seed: 3, sampleRate: 60 }),
  spring: () => [{ type: 'shape', shape: 'circle', radius: 20, initial: { x: 160, y: 30, fillColor: '#ffcc00' }, keyframes: [
    { at: 1, from: { y: 30 }, to: { y: 150 }, duration: 2, ease: 'spring(1, 170, 12)' }, { at: 4, to: { y: 40 }, duration: 'auto', ease: 'spring(1, 170, 12)' }] }],
  video: () => [{ type: 'video', asset: 'v', at: 0.5, duration: 6, audio: false, initial: { scale: 0.5, x: 80, y: 45 } }],
  grain: () => [{ type: 'shape', shape: 'rect', width: W, height: H, initial: { x: W / 2, y: H / 2, fillColor: '#808080' }, filters: [{ type: 'grain', name: 'gr' }] }],
};
const ID = x => x;
const CASES = {
  speed2: [{ speed: 2 }, t => 2 * t],
  reverse: [{ speed: -1 }, t => 4 - t],
  half: [{ speed: 0.5 }, t => t / 2],
  kf: [{ keyframes: [{ at: 0, from: { time: 1 }, to: { time: 3 }, duration: 1, repeat: 1, ease: 'none' }, { at: 2, to: { time: 3 }, duration: 1, ease: 'none' }, { at: 3, to: { time: 0.5 }, duration: 1, ease: 'none' }] },
    t => (t < 2 ? 1 + 2 * (t % 1) : t < 3 ? 3 : 3 - 2.5 * (t - 3))],
};
const only = (typeof ONLY !== 'undefined') ? ONLY : null;
const res = {};
const sampleFrames = []; for (let f = 2; f < 240; f += 12) sampleFrames.push(f);
for (const [fname, make] of Object.entries(FEATURES)) {
  res[fname] = {};
  for (const [cname, [extra, g]] of Object.entries(CASES)) {
    const inner = () => [bg, ...make()];
    // oracle: plain composition, 8 s, snapshots at the mapped frame (frame rate 60)
    await mk({ frameRate: 60, duration: 8, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 8, sequences: inner() }] } });
    const want = {};
    for (const f of sampleFrames) { const fp = Math.round(g(f / 60) * 60); if (!(fp in want)) want[fp] = await snap(fp); }
    await mk({ frameRate: 60, duration: 4, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 4, sequences: inner(), ...extra }] } });
    let bad = 0, maxd = 0; const badFrames = [];
    for (const f of sampleFrames) {
      const s = await snap(f); const fp = Math.round(g(f / 60) * 60); const d = await diff(s, want[fp]);
      if (d > 0) { bad++; maxd = Math.max(maxd, d); if (badFrames.length < 4) badFrames.push(f); }
    }
    const o = await orders(sampleFrames); delete o.fwd;
    res[fname][cname] = { n: sampleFrames.length, bad, maxd, badFrames, bwdMax: o.bwdMax, jmpMax: o.jmpMax, jmp2Max: o.jmp2Max, logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 3) };
  }
}
return res;
