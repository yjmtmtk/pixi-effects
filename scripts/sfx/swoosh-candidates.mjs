import { writeFileSync } from 'node:fs';
const SR = 44100;
const OUT = process.argv[2];

// seeded white noise (deterministic)
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }; }

// Chamberlin state-variable filter, centre frequency may change every sample
function svf() {
  let low = 0, band = 0;
  return (x, fc, Q, mode) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR * 0.45) / SR), q = 1 / Q;
    low += f * band; const high = x - low - q * band; band += f * high;
    return mode === 'hp' ? high : mode === 'lp' ? low : band;
  };
}
const expSweep = (a, b, u) => a * Math.pow(b / a, u);
const smooth = u => u * u * (3 - 2 * u);
const bell = (u, atk) => (u < atk ? smooth(u / atk) : Math.pow(1 - (u - atk) / (1 - atk), 2));

// each recipe returns [mono samples]; panning is applied afterwards
const recipes = {
  // classic airy whoosh: band of noise sweeping up, soft attack and tail
  air: { dur: 0.50, pan: [-0.6, 0.6], gen(t, u, n, f) { return f(n(), expSweep(500, 5200, u), 1.3, 'bp') * bell(u, 0.32) * 3.2; } },
  // quick UI swipe: short, bright, hard front
  swipe: { dur: 0.22, pan: [-0.3, 0.3], gen(t, u, n, f) { return f(n(), expSweep(2200, 9000, u), 0.9, 'hp') * Math.pow(1 - u, 3) * Math.min(1, u / 0.04) * 1.6; } },
  // reverse-cymbal style riser: swells and is cut at the top (a hit comes after it)
  riser: { dur: 0.70, pan: [0, 0], gen(t, u, n, f) { return f(n(), expSweep(300, 6500, u), 0.8, 'bp') * Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1) * 3.0; } },
  // sci-fi glide: a sine gliding up with a little air on top
  scifi: { dur: 0.50, pan: [-0.2, 0.2], phase: 0, gen(t, u, n, f, st) { const fr = expSweep(220, 1500, smooth(u)); st.phase += 2 * Math.PI * fr / SR; return (Math.sin(st.phase) * 0.55 + f(n(), expSweep(900, 6000, u), 1.6, 'bp') * 1.2) * bell(u, 0.3); } },
  // soft cloth: low-passed noise falling away, gentle (a "whoosh out")
  cloth: { dur: 0.55, pan: [0.5, -0.5], gen(t, u, n, f) { return f(n(), expSweep(3500, 250, u), 0.7, 'lp') * bell(u, 0.14) * 4.0; } },
  // pass-by: rises then falls like something flying past, travelling left to right
  passby: { dur: 0.80, pan: [-0.9, 0.9], gen(t, u, n, f) { const c = u < 0.45 ? expSweep(380, 3600, u / 0.45) : expSweep(3600, 520, (u - 0.45) / 0.55); const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 1.6); return f(n(), c, 1.1, 'bp') * env * 3.4; } },
};

function render(name, r, seed) {
  const N = Math.round(r.dur * SR), n = rng(seed), f = svf(), st = { phase: 0 };
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR, u = i / (N - 1);
    const x = r.gen(t, u, n, f, st);
    const p = r.pan[0] + (r.pan[1] - r.pan[0]) * u;           // -1 … 1
    const a = (p + 1) * Math.PI / 4;                           // constant-power pan
    L[i] = x * Math.cos(a); R[i] = x * Math.sin(a);
  }
  // 3 ms fade at both ends (no clicks), then peak-normalise to -3 dBFS
  const fade = Math.round(0.003 * SR);
  for (let i = 0; i < fade; i++) { const g = i / fade; L[i] *= g; R[i] *= g; L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 0.708 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4); }
  writeFileSync(`${OUT}/swoosh-${name}.wav`, buf);
  console.log(name, r.dur + 's');
}
let seed = 7; for (const [name, r] of Object.entries(recipes)) render(name, r, seed++ * 977);
