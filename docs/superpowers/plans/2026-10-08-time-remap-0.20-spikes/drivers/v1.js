const out = {};
const frames = [];
for (let f = 0; f <= 180; f += 7) frames.push(f);
const cases = {
  plain: {},
  speed2: { speed: 2 },
  speedHalf: { speed: 0.5 },
  speedOdd: { speed: 0.37 },
  reverse: { speed: -1 },
  ramp: { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 1 }, { at: 1, to: { time: 6 }, duration: 3, ease: 'power2.inOut' }] },
  freeze: { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 2 }, { at: 2, to: { time: 2 }, duration: 2 }, { at: 4, to: { time: 5 }, duration: 1 }] },
  loopKf: { keyframes: [{ at: 0, from: { time: 1 }, to: { time: 2 }, duration: 1, repeat: 3 }] },
  yoyo: { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 2, repeat: 2, yoyo: true }] },
};
for (const [name, extra] of Object.entries(cases)) {
  await mk({ duration: 6, composition: { sequences: [{ type: 'video', asset: 'v', duration: 6, audio: false, ...extra }] } });
  const r = await orders(frames);
  delete r.fwd;
  out[name] = { ...r, logs: window.__logs.filter(l => !l.includes('Resolver')) };
}
return out;
