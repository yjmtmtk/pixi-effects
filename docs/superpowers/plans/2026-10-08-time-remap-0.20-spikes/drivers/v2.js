// oracle: the remapped video at output time t must equal the plain video at source time g(t)
const out = {};
// reference: a staircase that shows source frame k from just before output frame k (mid-frame lookup, no float-boundary jitter)
const stairs = []; for (let k = 0; k < 240; k++) stairs.push({ at: Math.max(0, k / 30 - 1 / 120), set: { time: (k + 0.5) / 30 } });
await mk({ duration: 8, composition: { sequences: [{ type: 'video', asset: 'v', duration: 8, audio: false, keyframes: stairs }] } });
const plain = {};
for (let f = 0; f < 240; f++) plain[f] = await snap(f);
const distinct = new Set(Object.values(plain)).size;
const p2 = (p) => (p < 0.5 ? 4 * p * p * p : 1 - 4 * (1 - p) * (1 - p) * (1 - p));
const clamp = (x) => Math.min(Math.max(x, 0), 7.999);
const cases = {
  speed2: [{ speed: 2 }, t => clamp(2 * t)],
  speedHalf: [{ speed: 0.5 }, t => 0.5 * t],
  reverse: [{ speed: -1 }, t => 6 - t],
  ramp: [{ keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 1, ease: 'none' }, { at: 1, to: { time: 6 }, duration: 3, ease: 'power2.inOut' }] }, t => (t < 1 ? 2 * t : t < 4 ? 2 + 4 * p2((t - 1) / 3) : 6)],
  freeze: [{ keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 2, ease: 'none' }, { at: 2, to: { time: 2 }, duration: 2 }, { at: 4, to: { time: 5 }, duration: 1, ease: 'none' }] }, t => (t < 2 ? t : t < 4 ? 2 : t < 5 ? 2 + 3 * (t - 4) : 5)],
  yoyo: [{ keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 2, repeat: 2, yoyo: true, ease: 'none' }] }, t => { const u = t % 4; return u < 2 ? u : 4 - u; }],
};
for (const [name, [extra, g]] of Object.entries(cases)) {
  await mk({ duration: 6, composition: { sequences: [{ type: 'video', asset: 'v', duration: 6, audio: false, ...extra }] } });
  let exact = 0, off1 = 0, bad = 0, n = 0; const badAt = [];
  for (let f = 1; f < 180; f += 3) {
    const t = f / 30, src = g(t);
    const s = await snap(f);
    n++;
    const want = Math.floor(src * 30 + 1e-4);
    if (s === plain[want]) exact++;
    else if (s === plain[want - 1] || s === plain[want + 1]) off1++;
    else { bad++; if (badAt.length < 5) badAt.push([f, want]); }
  }
  out[name] = { n, exact, off1, bad, badAt };
}
return { distinctPlainFrames: distinct, out };
