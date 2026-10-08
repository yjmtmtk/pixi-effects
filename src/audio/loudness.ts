/** Loudness of a mix, ITU-R BS.1770-4 / EBU R128, without a dependency. Pure: takes channels, returns numbers. */
export interface LoudnessReport { integratedLufs: number | null; truePeakDb: number | null; samplePeakDb: number; clippedSamples: number }

/** Where the advice in `inspectAudio().notes` starts: one place, so the docs can point at it. */
export const LOUDNESS_NOTES = { quietBelow: -24, loudAbove: -9, headroomDb: -1 } as const;

interface Biquad { b: [number, number, number]; a: [number, number, number] }

/** The K-weighting of BS.1770-4: a high shelf, then a 38 Hz high-pass, as biquads for any sample rate (bilinear transform). */
function kWeighting(fs: number): [Biquad, Biquad] {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan(Math.PI * f0 / fs), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
  };
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / fs), a1 = 1 + K1 / Q1 + K1 * K1;
  const high: Biquad = { b: [1, -2, 1], a: [1, 2 * (K1 * K1 - 1) / a1, (1 - K1 / Q1 + K1 * K1) / a1] };
  return [shelf, high];
}

function filter(x: Float32Array, stages: Biquad[]): Float32Array {
  let cur = x;
  for (const { b, a } of stages) {
    const out = new Float32Array(cur.length);                            // Float32 between stages: half the memory, far below the measurement's resolution
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < cur.length; i++) {
      const xi = cur[i]!, y = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = y; out[i] = y;
    }
    cur = out;
  }
  return cur;
}

const toDb = (x: number): number => Math.round(200 * Math.log10(Math.max(x, 1e-6))) / 10;       // 0.1 dB, floor -120

const TP_HALF = 12, TP_BLOCK = 32;
const TP_KERNELS = [0.25, 0.5, 0.75].map(p => Float64Array.from({ length: 2 * TP_HALF }, (_, j) => {
  const k = j - TP_HALF + 1, x = k - p, s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  return s * (0.5 + 0.5 * Math.cos(Math.PI * x / (TP_HALF + 1)));
}));
/** No interpolated value can exceed (the loudest sample around it) x this: where that cannot beat the peak so far, skip the sums. */
const TP_GAIN = Math.max(...TP_KERNELS.map(k => k.reduce((a, v) => a + Math.abs(v), 0)));

/** 4x oversampled peak (windowed-sinc interpolation, 12 samples either side): catches peaks between samples. Equal to checking every phase of every sample, only faster. */
function truePeak(chans: Float32Array[]): number {
  let peak = 0;
  for (const c of chans) {
    const n = c.length;
    const blocks = Math.ceil(n / TP_BLOCK), blockMax = new Float32Array(blocks + 2);          // [b + 1] is block b; the ends stay 0
    for (let i = 0; i < n; i++) { const a = Math.abs(c[i]!), b = (i / TP_BLOCK | 0) + 1; if (a > blockMax[b]!) blockMax[b] = a; if (a > peak) peak = a; }
    const padded = new Float32Array(n + 2 * TP_HALF);                                          // zeros around, so the sums need no bounds check
    padded.set(c, TP_HALF);
    for (let i = 0; i < n; i++) {
      const b = (i / TP_BLOCK | 0) + 1;
      const local = Math.max(blockMax[b - 1]!, blockMax[b]!, blockMax[b + 1]!);                // the 24 samples around i lie in these three blocks
      if (local * TP_GAIN <= peak) continue;
      for (let pi = 0; pi < 3; pi++) {
        const k = TP_KERNELS[pi]!;
        let v = 0;
        for (let j = 0; j < 2 * TP_HALF; j++) v += padded[i + 1 + j]! * k[j]!;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
    }
  }
  return peak;
}

export function measureLoudness(channels: Float32Array[], sampleRate: number, opts: { truePeak?: boolean } = {}): LoudnessReport {
  let samplePeak = 0, clipped = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]!); if (a > samplePeak) samplePeak = a; if (a >= 1) clipped++; }
  const stages = kWeighting(sampleRate);
  const weighted = channels.map(c => filter(c, stages));
  const block = Math.round(0.4 * sampleRate), hop = Math.round(0.1 * sampleRate);
  const energies: number[] = [];
  for (let s = 0; s + block <= (weighted[0]?.length ?? 0); s += hop) {
    let sum = 0;
    for (const w of weighted) { let z = 0; for (let i = s; i < s + block; i++) z += w[i]! * w[i]!; sum += z / block; }       // the weight is 1 for L, R and mono
    energies.push(sum);
  }
  const lufs = (e: number): number => -0.691 + 10 * Math.log10(e);
  const absolute = energies.filter(e => e > 0 && lufs(e) > -70);
  let integrated: number | null = null;
  if (absolute.length) {
    const relative = lufs(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
    const gated = absolute.filter(e => lufs(e) > relative);
    if (gated.length) integrated = Math.round(10 * lufs(gated.reduce((a, b) => a + b, 0) / gated.length)) / 10;
  }
  return { integratedLufs: integrated, truePeakDb: opts.truePeak === false ? null : toDb(truePeak(channels)), samplePeakDb: toDb(samplePeak), clippedSamples: clipped };
}

/** Runs of at least `minLength` seconds where every channel stays below `thresholdDb` (default -60 dBFS). */
export function findSilences(channels: Float32Array[], sampleRate: number, opts: { minLength?: number; thresholdDb?: number } = {}): Array<{ from: number; to: number }> {
  const min = Math.round((opts.minLength ?? 1) * sampleRate), limit = 10 ** ((opts.thresholdDb ?? -60) / 20);
  const n = channels[0]?.length ?? 0, out: Array<{ from: number; to: number }> = [];
  let start = -1;
  const quiet = (i: number): boolean => channels.every(c => Math.abs(c[i]!) < limit);
  for (let i = 0; i <= n; i++) {
    const q = i < n && quiet(i);
    if (q && start < 0) start = i;
    if (!q && start >= 0) { if (i - start >= min) out.push({ from: Math.round(start / sampleRate * 1000) / 1000, to: Math.round(i / sampleRate * 1000) / 1000 }); start = -1; }
  }
  return out;
}
