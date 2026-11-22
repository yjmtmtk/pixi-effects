/**
 * Per-track effects of `music` (1.2), run in place on a track's bus over the samples where it sounds, in the order the renderer
 * calls them: drive → crush → tone sweep / resonance → chorus → delay. Each returns where the track's sound now ends (an effect that
 * rings on, like a delay, makes it longer). Deterministic: no noise, no clocks.
 */

import { Biquad, SR, TAU, type Bus } from './synth';

const cap = (bus: Bus, end: number): number => Math.min(bus.L.length, end);

/** Saturation (soft clipping): 0 is clean, 1 is a fuzz. A gentle low-pass after it, as a guitar cabinet would, keeps the fizz down. */
export function driveRun(bus: Bus, lo: number, end: number, amount: number): number {
  const k = 1 + amount * 14, g = (1 + 2 * amount) / k;
  const cl = new Biquad('lp', 6500, 0.7), cr = new Biquad('lp', 6500, 0.7);
  const stop = cap(bus, end + Math.round(0.01 * SR)), L = bus.L, R = bus.R;
  for (let i = lo; i < stop; i++) {
    L[i] = cl.run(Math.tanh(k * L[i]!) * g);
    R[i] = cr.run(Math.tanh(k * R[i]!) * g);
  }
  return stop;
}

/** Fewer bits and a lower rate: 0 is clean; 1 is 4 bits at about a tenth of the rate. */
export function crushRun(bus: Bus, lo: number, end: number, amount: number): void {
  const bits = 16 - 12 * amount, q = 2 ** (bits - 1), step = 1 - 0.9 * amount, L = bus.L, R = bus.R;
  let acc = 1, hl = 0, hr = 0;
  for (let i = lo; i < cap(bus, end); i++) {
    acc += step;
    if (acc >= 1) { acc -= 1; hl = Math.round(L[i]! * q) / q; hr = Math.round(R[i]! * q) / q; }
    L[i] = hl; R[i] = hr;
  }
}

/**
 * The tone filter when it moves or resonates: a 24 dB low-pass whose cutoff follows `[seconds, value]` points (value 0–1 as `tone`:
 * 400 Hz × 50^value, so 1 is about 20 kHz), and whose first stage peaks at the cutoff with `resonance` (the acid squelch).
 */
export function sweepRun(bus: Bus, lo: number, end: number, pts: ReadonlyArray<readonly [number, number]>, resonance: number, wrap = 0): number {
  const q = 0.7 + resonance * 9, at = (sec: number): number => {
    if (sec <= pts[0]![0]) return pts[0]![1];
    for (let j = 1; j < pts.length; j++) if (sec < pts[j]![0]) return pts[j - 1]![1] + ((pts[j]![1] - pts[j - 1]![1]) * (sec - pts[j - 1]![0])) / (pts[j]![0] - pts[j - 1]![0]);
    return pts[pts.length - 1]![1];
  };
  const a = [new Biquad('lp', 1000, q), new Biquad('lp', 1000, 0.7)], b = [new Biquad('lp', 1000, q), new Biquad('lp', 1000, 0.7)];
  const L = bus.L, R = bus.R, gain = 1 / (1 + resonance * 1.5);                  // a resonant peak is loud: the level comes down with it
  const stop = cap(bus, end + Math.round(0.05 * SR));
  for (let i = lo; i < stop; i++) {
    if ((i - lo) % 32 === 0) {
      const fc = 400 * 50 ** at(wrap > 0 ? (i / SR) % wrap : i / SR);   // with loop, the sweep starts again on every pass (as vol points do)
      a[0]!.set('lp', fc, q); b[0]!.set('lp', fc, q); a[1]!.set('lp', fc, 0.7); b[1]!.set('lp', fc, 0.7);
    }
    L[i] = a[1]!.run(a[0]!.run(L[i]!)) * gain;
    R[i] = b[1]!.run(b[0]!.run(R[i]!)) * gain;
  }
  return stop;
}

/** Two slowly moving delay taps (left and right a quarter turn apart) mixed with the sound: wider, shimmering, even from a mono voice. */
export function chorusRun(bus: Bus, lo: number, end: number, amount: number): number {
  const maxD = Math.ceil(0.02 * SR), stop = cap(bus, end + maxD), n = stop - lo;
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = (bus.L[lo + i]! + bus.R[lo + i]!) * 0.5;
  const tap = (pos: number): number => { const i0 = Math.floor(pos), fr = pos - i0; return i0 < 0 ? 0 : (src[i0] ?? 0) * (1 - fr) + (src[i0 + 1] ?? 0) * fr; };
  const dry = 1 - 0.35 * amount, wet = 0.7 * amount;
  for (let i = 0; i < n; i++) {
    const t = (lo + i) / SR, ph = TAU * 0.8 * t;
    const dl = (0.012 + 0.004 * Math.sin(ph)) * SR, dr = (0.012 + 0.004 * Math.sin(ph + Math.PI / 2)) * SR;
    bus.L[lo + i] = bus.L[lo + i]! * dry + tap(i - dl) * wet;
    bus.R[lo + i] = bus.R[lo + i]! * dry + tap(i - dr) * wet;
  }
  return stop;
}

/**
 * Echoes whose distance changes with the tempo: `delayAt(seconds)` is how many samples back the echo heard at that moment comes from
 * (asked every 32 samples). Read between samples, so a slowing tempo stretches the echoes smoothly. Otherwise as `delayRun`.
 */
export function delayRunVarying(bus: Bus, lo: number, end: number, delayAt: (sec: number) => number, mix: number, feedback: number): number {
  const extra = Math.round(0.007 * SR), L = bus.L, R = bus.R;
  let longest = 1;
  for (let i = lo; i < cap(bus, end + 1); i += 256) longest = Math.max(longest, delayAt(i / SR));
  const repeats = feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
  // the echoes of the last sound reach this far (a slowing tempo spaces them out: measure there too)
  for (let k = 1, at = end; k <= repeats; k++) { const d = delayAt(at / SR); longest = Math.max(longest, d); at += d; }
  const stop = cap(bus, end + Math.ceil((longest + extra) * repeats) + 1), n = stop - lo;
  const dl = new Float32Array(n), dr = new Float32Array(n);
  const read = (a: Float32Array, base: number, pos: number): number => { if (pos < 0) return 0; const i0 = Math.floor(pos), fr = pos - i0; return (a[base + i0] ?? 0) * (1 - fr) + (a[base + i0 + 1] ?? 0) * fr; };
  let ml = 0, mr = 0, D = 1;
  for (let i = 0; i < n; i++) {
    if (i % 32 === 0) D = Math.max(1, delayAt((lo + i) / SR));
    const pl = i - D, pr = i - D - extra;
    const xl = read(L, lo, pl), xr = read(R, lo, pr), fl = read(dl, 0, pl), fr = read(dr, 0, pr);
    ml += 0.35 * (fl - ml); mr += 0.35 * (fr - mr);
    dl[i] = xl + feedback * (fl * 0.6 + ml * 0.4);
    dr[i] = xr + feedback * (fr * 0.6 + mr * 0.4);
  }
  for (let i = 0; i < n; i++) { L[lo + i] = L[lo + i]! + dl[i]! * mix; R[lo + i] = R[lo + i]! + dr[i]! * mix; }
  return stop;
}

/** Echoes `delay` samples apart (the right side a hair later, for width), each `feedback` as loud as the last and a little darker. */
export function delayRun(bus: Bus, lo: number, end: number, delay: number, mix: number, feedback: number): number {
  const D = Math.max(1, delay), DR = D + Math.round(0.007 * SR);
  const repeats = feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
  const stop = cap(bus, end + DR * repeats + 1), n = stop - lo, L = bus.L, R = bus.R;
  const dl = new Float32Array(n), dr = new Float32Array(n);
  let ml = 0, mr = 0;
  for (let i = 0; i < n; i++) {
    const xl = i >= D ? L[lo + i - D]! : 0, xr = i >= DR ? R[lo + i - DR]! : 0;
    // what was written into the line one delay ago, darkened a little each time round
    const fl = i >= D ? dl[i - D]! : 0, fr = i >= DR ? dr[i - DR]! : 0;
    ml += 0.35 * (fl - ml); mr += 0.35 * (fr - mr);
    dl[i] = xl + feedback * (fl * 0.6 + ml * 0.4);
    dr[i] = xr + feedback * (fr * 0.6 + mr * 0.4);
  }
  // the dry signal at i must still be the input when a later sample reads it: add the echoes only after the line is built
  for (let i = 0; i < n; i++) { L[lo + i] = L[lo + i]! + dl[i]! * mix; R[lo + i] = R[lo + i]! + dr[i]! * mix; }
  return stop;
}
