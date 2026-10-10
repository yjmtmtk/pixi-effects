/**
 * The voices of `music`: a handful of small synthesisers and drums, each rendering ONE note into a stereo buffer.
 * Pure DSP over Float32Array, seeded noise only, so the same score always gives the same samples. Ported from the
 * spike the owner approved by ear; the sample rate is set once per render (renders are synchronous).
 */

export interface Bus { L: Float32Array; R: Float32Array }
export type Rand = () => number;

/** Per-track knobs an instrument may use. */
export interface VoiceOptions {
  /** Seconds the sound fades in (pad, lead). */
  attack?: number;
  /** Seconds the sound fades out after the written length. */
  release?: number;
  /** Seconds a bell / music box keeps ringing. */
  ring?: number;
}

type Voice = (midi: number, dur: number, vel: number, out: Bus, start: number, rnd: Rand, o: VoiceOptions) => void;

const TAU = Math.PI * 2;
let SR = 44100;
/** Set the sample rate for the render that follows. */
export function setSampleRate(sr: number): void { if (sr !== SR) clearVoiceTables(); SR = sr; }
/** The tables the voices share within a render (see `keysTables`): let go of them when a render is over, they are tens of MB for a long piece. */
export function clearVoiceTables(): void { KEYS_TABLES.clear(); BELL_TABLES.clear(); }
interface BellTables { s35: Float64Array; e5: Float64Array; ek: Float64Array; s276: Float64Array; e4: Float64Array; n: number }
const BELL_TABLES = new Map<string, BellTables>();
function bellTables(f: number, k: number, n: number): BellTables {
  const key = f + '/' + k;
  let tb = BELL_TABLES.get(key);
  if (tb && tb.n >= n) return tb;
  const len = Math.max(n, tb ? tb.n * 2 : 0);
  const s35 = new Float64Array(len), e5 = new Float64Array(len), ek = new Float64Array(len), s276 = new Float64Array(len), e4 = new Float64Array(len);
  for (let i = 0; i < len; i++) { const t = i / SR; s35[i] = Math.sin(TAU * f * 3.5 * t); e5[i] = Math.exp(-t * 5); ek[i] = Math.exp(-t * k); s276[i] = Math.sin(TAU * f * 2.76 * t); e4[i] = Math.exp(-t * 4); }
  tb = { s35, e5, ek, s276, e4, n: len };
  BELL_TABLES.set(key, tb);
  return tb;
}


interface KeysTables { decay: Float64Array; s14: Float64Array; s1: Float64Array; e18: Float64Array; e32: Float64Array; n: number }
const KEYS_TABLES = new Map<number, KeysTables>();
/** Tables of exp(-t*(1.1+f/1500)), sin(TAU*f*14*t), sin(TAU*f*t) for this pitch and exp(-t*18), exp(-t*3.2) for t = i/SR, at least `n` long (grown when a longer note comes). */
function keysTables(f: number, n: number): KeysTables {
  let tb = KEYS_TABLES.get(f);
  if (tb && tb.n >= n) return tb;
  const len = Math.max(n, tb ? tb.n * 2 : 0);
  const decay = new Float64Array(len), s14 = new Float64Array(len), s1 = new Float64Array(len), e18 = new Float64Array(len), e32 = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    decay[i] = Math.exp(-t * (1.1 + f / 1500)); s14[i] = Math.sin(TAU * f * 14 * t); s1[i] = Math.sin(TAU * f * t); e18[i] = Math.exp(-t * 18); e32[i] = Math.exp(-t * 3.2);
  }
  tb = { decay, s14, s1, e18, e32, n: len };
  KEYS_TABLES.set(f, tb);
  return tb;
}


const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(type: 'lp' | 'hp' | 'bp', fc: number, q = 0.707) { this.set(type, fc, q); }
  /** Change the cutoff without clearing the state (so it can move while a sound plays). */
  set(type: 'lp' | 'hp' | 'bp', fc: number, q = 0.707): void {
    const w = (TAU * Math.min(fc, SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  /** All four memories are so small that anything this filter outputs from silence on rounds to 0 in a Float32Array (below half its smallest number). */
  settled(): boolean {
    return Math.abs(this.x1) < 1e-47 && Math.abs(this.x2) < 1e-47 && Math.abs(this.y1) < 1e-47 && Math.abs(this.y2) < 1e-47;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
export { Biquad };

const polyblep = (t: number, dt: number): number => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
const saw = (ph: number, dt: number): number => 2 * ph - 1 - polyblep(ph, dt);
const adsr = (t: number, dur: number, a: number, d: number, s: number, r: number): number => {
  if (t < dur) return t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : s;
  const base = dur < a ? dur / a : dur < a + d ? 1 - (1 - s) * ((dur - a) / d) : s;
  return Math.max(0, base * (1 - (t - dur) / r));
};

export const INSTRUMENTS = ['keys', 'pluck', 'pad', 'bass', 'sub', 'lead', 'bell', 'musicbox'] as const;
export type InstrumentName = (typeof INSTRUMENTS)[number];

export const VOICES: Record<InstrumentName, Voice> = {
  // electric piano: two FM operators (tine + bell), a little stereo chorus
  keys(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.5, total = dur + rel + 1.2;
    // the envelope is 0 from `dur + rel` on: what follows is silence, so it is not computed (the notes used to run 1.2 s of zeros)
    const n = Math.min(Math.floor(Math.min(total, 6) * SR), Math.ceil((dur + rel) * SR) + 2), idx = 1.1 + 2.2 * vel, det = 1 + (rnd() - 0.5) * 0.002;
    const lim = Math.min(n, out.L.length - start);
    // the parts of the sound that depend only on the pitch and the sample index are the same for every note of that pitch: tabled once (the same Math.exp / Math.sin values, so the same samples)
    const tb = keysTables(f, lim), dcy = tb.decay, s14 = tb.s14, s1 = tb.s1, e18 = tb.e18, e32 = tb.e32;
    for (let i = 0; i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      const decay = dcy[i]!;
      const mod = s14[i]! * idx * 0.12 * e18[i]! + s1[i]! * idx * e32[i]!;
      const body = Math.sin(TAU * f * t + mod) * decay;
      const body2 = Math.sin(TAU * f * det * t + mod * 0.9) * decay;
      const env = t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel);
      const a = Math.min(1, t / 0.004) * env * 0.5 * vel;
      { const wl = a * (body * 0.7 + body2 * 0.3), wr = a * (body * 0.3 + body2 * 0.7); out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // plucked string (Karplus–Strong with a darker loss filter): guitar / harp / koto
  pluck(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), len = Math.max(2, Math.round(SR / f)), buf = new Float32Array(len);
    const lp = new Biquad('lp', 2500 + 3500 * vel, 0.6);
    for (let i = 0; i < len; i++) buf[i] = lp.run(rnd() * 2 - 1);
    const rel = o.release ?? 0.25, total = Math.min(dur + rel + 0.4, 5), n = Math.floor(total * SR), loss = 0.9965 - 0.5 / (f + 100);
    let p = 0, prev = 0;
    const pan = (rnd() - 0.5) * 0.3;
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const cur = buf[p]!, nxt = buf[(p + 1) % len]!;
      buf[p] = loss * 0.5 * (cur + nxt);
      p = (p + 1) % len;
      const t = i / SR, env = t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel);
      const y = (cur - prev * 0.2) * env * 0.55 * vel;
      prev = cur;
      { const wl = y * (1 - pan), wr = y * (1 + pan); out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // warm pad: five detuned band-limited saws through a slow low-pass
  pad(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.7, R = o.release ?? 1.4, n = Math.floor((dur + R) * SR);
    const cs = [-0.14, -0.07, 0, 0.07, 0.14];
    const st = (k: number): number => (f * 2 ** ((cs[k]! / 12) * 0.6)) / SR, gL = (k: number): number => 1 - (k - 2) / 2.5, gR = (k: number): number => 1 + (k - 2) / 2.5;
    let p0 = rnd(), p1 = rnd(), p2 = rnd(), p3 = rnd(), p4 = rnd();
    const d0 = st(0), d1 = st(1), d2 = st(2), d3 = st(3), d4 = st(4);
    const gl0 = gL(0), gl1 = gL(1), gl2 = gL(2), gl3 = gL(3), gl4 = gL(4), gr0 = gR(0), gr1 = gR(1), gr2 = gR(2), gr3 = gR(3), gr4 = gR(4);
    const cut = Math.min(1800, 500 + f * 1.5);
    const lp = new Biquad('lp', cut, 0.6), lp2 = new Biquad('lp', cut, 0.6);
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {
      const t = i / SR;
      let l = 0, r = 0, sv: number;
      p0 += d0; if (p0 >= 1) p0 -= 1; sv = saw(p0, d0); l += sv * gl0 * 0.5; r += sv * gr0 * 0.5;
      p1 += d1; if (p1 >= 1) p1 -= 1; sv = saw(p1, d1); l += sv * gl1 * 0.5; r += sv * gr1 * 0.5;
      p2 += d2; if (p2 >= 1) p2 -= 1; sv = saw(p2, d2); l += sv * gl2 * 0.5; r += sv * gr2 * 0.5;
      p3 += d3; if (p3 >= 1) p3 -= 1; sv = saw(p3, d3); l += sv * gl3 * 0.5; r += sv * gr3 * 0.5;
      p4 += d4; if (p4 >= 1) p4 -= 1; sv = saw(p4, d4); l += sv * gl4 * 0.5; r += sv * gr4 * 0.5;
      const env = t < dur ? Math.min(1, t / A) : Math.max(0, Math.min(1, dur / A) * (1 - (t - dur) / R));
      const g = env * 0.11 * vel;
      { const wl = lp.run(l) * g, wr = lp2.run(r) * g; out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // synth bass: saw + sine sub, filter envelope
  bass(m, dur, vel, out, start, _rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.12, n = Math.floor((dur + rel) * SR);
    let ph = 0, ph2 = 0;
    const lp = new Biquad('lp', 400, 1.1);
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR, dt = f / SR;
      ph = (ph + dt) % 1; ph2 = (ph2 + dt) % 1;
      if (i % 64 === 0) lp.set('lp', Math.min(160 + 900 * Math.exp(-t * 7) * vel, 4000), 1.1);
      const s = lp.run(saw(ph, dt)) * 0.55 + Math.sin(TAU * ph2) * 0.55;
      const env = t < dur ? Math.min(1, t / 0.006) * (0.75 + 0.25 * Math.exp(-t * 4)) : Math.max(0, 1 - (t - dur) / rel) * 0.75;
      const y = s * env * 0.5 * vel;
      { const wl = y, wr = y; out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // a pure sine bass: a soft heartbeat or sub (no filter sweep, hardly any upper harmonics)
  sub(m, dur, vel, out, start, _rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.2, n = Math.floor((dur + rel) * SR);
    let ph = 0;
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      ph += (TAU * f) / SR;
      const env = t < dur ? Math.min(1, t / (o.attack ?? 0.012)) * (0.8 + 0.2 * Math.exp(-t * 5)) : Math.max(0, 1 - (t - dur) / rel) * 0.8;
      const y = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * env * 0.6 * vel;
      { const wl = y, wr = y; out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // lead: soft saw / triangle with a delayed vibrato
  lead(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.18, A = o.attack ?? 0.02, n = Math.floor((dur + rel) * SR);
    let ph = rnd(), ph2 = rnd();
    const lp = new Biquad('lp', 2600 + 1800 * vel, 0.8);
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR, vib = 1 + 0.0035 * Math.sin(TAU * 5.3 * t) * Math.min(1, Math.max(0, (t - 0.18) / 0.3));
      const dt = (f * vib) / SR;
      ph = (ph + dt) % 1; ph2 = (ph2 + dt * 1.003) % 1;
      const tri = 4 * Math.abs(ph - 0.5) - 1;
      const s = lp.run(saw(ph2, dt) * 0.35 + tri * 0.65);
      const y = s * adsr(t, dur, A, 0.15, 0.7, rel) * 0.28 * vel;
      { const wl = y * 0.9, wr = y * 1.1; out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // bell / glockenspiel: inharmonic FM; `ring` is how many seconds it keeps sounding
  bell(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), ring = o.ring ?? 2.5, n = Math.floor(Math.min(dur + ring, 6) * SR), pan = (rnd() - 0.5) * 0.6;
    const k = 1.5 * (2.5 / ring);
    const lim = Math.min(n, out.L.length - start);
    const tb = bellTables(f, k, lim), s35 = tb.s35, e5 = tb.e5, ek = tb.ek, s276 = tb.s276, e4 = tb.e4;
    for (let i = 0; i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      const mod = s35[i]! * 1.6 * e5[i]!;
      const s = Math.sin(TAU * f * t + mod) * ek[i]! + s276[i]! * 0.25 * e4[i]!;
      const y = s * Math.min(1, t / 0.002) * 0.3 * vel;
      { const wl = y * (1 - pan), wr = y * (1 + pan); out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
  // music box: a bright tine with a strong upper partial and a short, dry ring
  musicbox(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), ring = o.ring ?? 1.3, n = Math.floor(Math.min(dur + ring, 4) * SR), pan = (rnd() - 0.5) * 0.4;
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      const s = Math.sin(TAU * f * t) * Math.exp(-t * (3.2 / ring * 1.3)) + Math.sin(TAU * f * 4.0 * t) * 0.22 * Math.exp(-t * (9 / ring)) + Math.sin(TAU * f * 6.8 * t) * 0.08 * Math.exp(-t * 18);
      const y = s * Math.min(1, t / 0.0015) * 0.34 * vel;
      { const wl = y * (1 - pan), wr = y * (1 + pan); out.L[start + i]! += wl; out.R[start + i]! += wr; }
    }
  },
};

export const DRUMS = ['kick', 'snare', 'hat', 'openhat', 'clap', 'rim', 'tom', 'crash', 'shaker', 'sleigh'] as const;
export type DrumName = (typeof DRUMS)[number];

export function hitDrum(kind: DrumName, vel: number, out: Bus, start: number, rnd: Rand): void {
  const mono = (n: number, f: (t: number) => number, gl = 1, gr = 1): void => {
    // `f` runs for every sample (it draws noise from the seeded stream); only the samples inside the bus are written
    const lim = Math.min(n, out.L.length - start), L = out.L, R = out.R;
    for (let i = 0; i < n; i++) { const o = f(i / SR); if (i < lim) { L[start + i]! += o * gl; R[start + i]! += o * gr; } }
  };
  const len = (s: number) => Math.floor(s * SR);
  if (kind === 'kick') {
    let ph = 0;
    mono(len(0.5), t => { ph += (TAU * (45 + 110 * Math.exp(-t * 28))) / SR; const o = (Math.sin(ph) * Math.exp(-t * 7.5) + (t < 0.004 ? (rnd() - 0.5) * 0.5 : 0)) * 0.95 * vel; return o; });
  } else if (kind === 'snare') {
    const bp = new Biquad('bp', 1900, 0.9), hp = new Biquad('hp', 700, 0.7);
    let ph = 0;
    mono(len(0.4), t => { ph += (TAU * (185 - 40 * t)) / SR; const nz = hp.run(bp.run(rnd() * 2 - 1)) * 2.2; const o = (nz * Math.exp(-t * 17) + Math.sin(ph) * Math.exp(-t * 26) * 0.6) * 0.6 * vel; return o; }, 0.95, 1.05);
  } else if (kind === 'clap') {
    const bp = new Biquad('bp', 1500, 1.2);
    mono(len(0.35), t => { const burst = t < 0.033 ? Math.exp(-((t * 1000) % 11) * 0.5) : Math.exp(-(t - 0.033) * 22); const o = bp.run(rnd() * 2 - 1) * 2.4 * burst * 0.5 * vel; return o; }, 1, 0.9);
  } else if (kind === 'hat' || kind === 'openhat') {
    const hp = new Biquad('hp', 7500, 0.8), dec = kind === 'hat' ? 55 : 9;
    mono(len(kind === 'hat' ? 0.12 : 0.6), t => { const o = hp.run(rnd() * 2 - 1) * Math.exp(-t * dec) * 0.35 * vel; return o; }, 0.8, 1.2);
  } else if (kind === 'rim') {
    let ph = 0;
    const bp = new Biquad('bp', 3200, 4);
    mono(len(0.1), t => { ph += (TAU * 1750) / SR; const o = (Math.sin(ph) * 0.5 + bp.run(rnd() * 2 - 1)) * Math.exp(-t * 70) * 0.5 * vel; return o; });
  } else if (kind === 'tom') {
    let ph = 0;
    mono(len(0.5), t => { ph += (TAU * (95 + 70 * Math.exp(-t * 15))) / SR; const o = Math.sin(ph) * Math.exp(-t * 7) * 0.7 * vel; return o; });
  } else if (kind === 'crash') {
    const hp = new Biquad('hp', 5200, 0.7), bp = new Biquad('bp', 9000, 0.6);
    mono(len(1.8), t => { const nz = rnd() * 2 - 1; const o = (hp.run(nz) * 0.7 + bp.run(nz) * 0.5) * (0.55 * Math.exp(-t * 2.6) + 0.45 * Math.exp(-t * 11)) * 0.5 * vel; return o; }, 0.9, 1.1);
  } else if (kind === 'shaker') {
    const bp = new Biquad('bp', 6500, 1.4);
    mono(len(0.16), t => { const env = (t < 0.018 ? t / 0.018 : 1) * Math.exp(-t * 28); const o = bp.run(rnd() * 2 - 1) * env * 1.4 * 0.3 * vel; return o; }, 0.85, 1.15);
  } else { // sleigh: a jingle of small bells (bright noise + a cluster of high partials with a fast flutter)
    const bp = new Biquad('bp', 7800, 1.0);
    const partials = [4200, 5630, 6900, 8350];
    mono(len(0.5), t => {
      let s = 0;
      for (let k = 0; k < partials.length; k++) s += Math.sin(TAU * partials[k]! * t * (1 + k * 0.0007)) * (0.5 + 0.5 * Math.sin(TAU * (19 + k * 3.1) * t + k)) * Math.exp(-t * (7 + k * 2));
      const o = (s * 0.11 + bp.run(rnd() * 2 - 1) * Math.exp(-t * 16) * 0.5) * Math.min(1, t / 0.003) * vel * 0.8;
      return o;
    }, 0.85, 1.15);
  }
}

/** Freeverb-style reverb: sums the `send` bus to mono and adds its tail to `out` (the same bus works too). `wet` 0–1. */
/** `reverb` in slices: it yields how far it is (0..1) every 16384 samples, so a caller can hand control back to the page. */
export function* reverbSteps(send: Bus, out: Bus, wet: number, size = 0.8): Generator<number, void, void> {
  const L = out.L, R = out.R, sL = send.L, sR = send.R;
  const scale = SR / 44100;
  type Comb = { b: Float32Array; i: number; fb: number; d: number; damp: number };
  const comb = (len: number): Comb => ({ b: new Float32Array(Math.max(8, Math.round(len * scale))), i: 0, fb: size, d: 0, damp: 0.35 });
  const mk = (off: number) => ({
    c: [1116, 1188, 1277, 1356, 1422, 1491].map(l => comb(l + off)),
    a: [556, 441, 341].map(l => ({ b: new Float32Array(Math.max(8, Math.round((l + off) * scale))), i: 0 })),
  });
  const chL = mk(0), chR = mk(23);
  const block = (i: number, stop: number): void => {
    for (; i < stop; i++) {
      const m = (sL[i]! + sR[i]!) * 0.5;
      L[i]! += runFlat(m, chL) * wet; R[i]! += runFlat(m, chR) * wet;
    }
  };
  for (let i = 0; i < L.length; ) {
    yield i / L.length;
    const stop = Math.min(L.length, (i | 16383) + 1);
    block(i, stop);
    i = stop;
  }
}

function runFlat(x: number, ch: { c: { b: Float32Array; i: number; fb: number; d: number; damp: number }[]; a: { b: Float32Array; i: number }[] }): number {
  let y = 0;
  const cs = ch.c, as = ch.a;
  for (let k = 0; k < 6; k++) {
    const c = cs[k]!, b = c.b;
    const o = b[c.i]!;
    c.d = o * (1 - c.damp) + c.d * c.damp;
    b[c.i] = x * 0.03 + c.d * c.fb;
    c.i = c.i + 1 === b.length ? 0 : c.i + 1;
    y += o;
  }
  for (let k = 0; k < 3; k++) {
    const a = as[k]!, b = a.b;
    const o = b[a.i]!, inp = y;
    b[a.i] = inp + o * 0.5;
    a.i = a.i + 1 === b.length ? 0 : a.i + 1;
    y = o - inp;
  }
  return y;
}
export function reverb(send: Bus, out: Bus, wet: number, size = 0.8): void {
  for (const _ of reverbSteps(send, out, wet, size)) void _;
}
