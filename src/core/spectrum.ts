/** In-place radix-2 FFT (re/im arrays of the same power-of-two length). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const xr = re[b]! * wr - im[b]! * wi, xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr; im[b] = im[a]! - xi;
        re[a] = re[a]! + xr; im[a] = im[a]! + xi;
      }
    }
  }
}

const FRAME = 2048;

/**
 * Spectral centroid ("brightness") in Hz of `samples[from, to)`: the power-weighted mean frequency
 * over Hann-windowed 2048-sample frames (louder frames count more). 0 for silence.
 * Rough guide: < 500 Hz dark / boomy, 1–3 kHz mid, > 4 kHz bright / airy.
 */
export function spectralCentroid(samples: Float32Array, sampleRate: number, from = 0, to = samples.length): number {
  let num = 0;
  let den = 0;
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const end = Math.min(to, samples.length);
  for (let start = Math.max(0, from); start < end; start += FRAME / 2) {
    for (let i = 0; i < FRAME; i++) {
      const k = start + i;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
      re[i] = k < end ? samples[k]! * w : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 1; b < FRAME / 2; b++) {
      const power = re[b]! * re[b]! + im[b]! * im[b]!;
      num += power * ((b * sampleRate) / FRAME);
      den += power;
    }
  }
  return den > 1e-9 ? Math.round(num / den / 10) * 10 : 0;
}
