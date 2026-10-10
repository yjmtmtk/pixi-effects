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
export function setSampleRate(sr: number): void { SR = sr; }

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
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
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      const decay = Math.exp(-t * (1.1 + f / 1500));
      const mod = Math.sin(TAU * f * 14 * t) * idx * 0.12 * Math.exp(-t * 18) + Math.sin(TAU * f * t) * idx * Math.exp(-t * 3.2);
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
    // the five detuned saws as plain arrays (their numbers are computed in the same order as ever: the samples do not change)
    const ph = new Float64Array(5), step = new Float64Array(5), gl = new Float64Array(5), gr = new Float64Array(5);
    cs.forEach((c, k) => { ph[k] = rnd(); step[k] = (f * 2 ** ((c / 12) * 0.6)) / SR; const pan = (k - 2) / 2.5; gl[k] = 1 - pan; gr[k] = 1 + pan; });
    const cut = Math.min(1800, 500 + f * 1.5);
    const lp = new Biquad('lp', cut, 0.6), lp2 = new Biquad('lp', cut, 0.6);
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {
      const t = i / SR;
      let l = 0, r = 0;
      for (let k = 0; k < 5; k++) {
        const dt = step[k]!;
        let p = ph[k]! + dt; if (p >= 1) p -= 1; ph[k] = p;
        const sv = saw(p, dt);
        l += sv * gl[k]! * 0.5; r += sv * gr[k]! * 0.5;
      }
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
    for (let i = 0, lim = Math.min(n, out.L.length - start); i < lim; i++) {   // what falls past the end of the bus is not made
      const t = i / SR;
      const mod = Math.sin(TAU * f * 3.5 * t) * 1.6 * Math.exp(-t * 5);
      const s = Math.sin(TAU * f * t + mod) * Math.exp(-t * k) + Math.sin(TAU * f * 2.76 * t) * 0.25 * Math.exp(-t * 4);
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
  const mono = (n: number, f: (t: number) => [number, number]): void => {
    // `f` runs for every sample (it draws noise from the seeded stream); only the samples inside the bus are written
    const lim = Math.min(n, out.L.length - start);
    for (let i = 0; i < n; i++) { const [l, r] = f(i / SR); if (i < lim) { out.L[start + i]! += l; out.R[start + i]! += r; } }
  };
  const len = (s: number) => Math.floor(s * SR);
  if (kind === 'kick') {
    let ph = 0;
    mono(len(0.5), t => { ph += (TAU * (45 + 110 * Math.exp(-t * 28))) / SR; const o = (Math.sin(ph) * Math.exp(-t * 7.5) + (t < 0.004 ? (rnd() - 0.5) * 0.5 : 0)) * 0.95 * vel; return [o, o]; });
  } else if (kind === 'snare') {
    const bp = new Biquad('bp', 1900, 0.9), hp = new Biquad('hp', 700, 0.7);
    let ph = 0;
    mono(len(0.4), t => { ph += (TAU * (185 - 40 * t)) / SR; const nz = hp.run(bp.run(rnd() * 2 - 1)) * 2.2; const o = (nz * Math.exp(-t * 17) + Math.sin(ph) * Math.exp(-t * 26) * 0.6) * 0.6 * vel; return [o * 0.95, o * 1.05]; });
  } else if (kind === 'clap') {
    const bp = new Biquad('bp', 1500, 1.2);
    mono(len(0.35), t => { const burst = t < 0.033 ? Math.exp(-((t * 1000) % 11) * 0.5) : Math.exp(-(t - 0.033) * 22); const o = bp.run(rnd() * 2 - 1) * 2.4 * burst * 0.5 * vel; return [o, o * 0.9]; });
  } else if (kind === 'hat' || kind === 'openhat') {
    const hp = new Biquad('hp', 7500, 0.8), dec = kind === 'hat' ? 55 : 9;
    mono(len(kind === 'hat' ? 0.12 : 0.6), t => { const o = hp.run(rnd() * 2 - 1) * Math.exp(-t * dec) * 0.35 * vel; return [o * 0.8, o * 1.2]; });
  } else if (kind === 'rim') {
    let ph = 0;
    const bp = new Biquad('bp', 3200, 4);
    mono(len(0.1), t => { ph += (TAU * 1750) / SR; const o = (Math.sin(ph) * 0.5 + bp.run(rnd() * 2 - 1)) * Math.exp(-t * 70) * 0.5 * vel; return [o, o]; });
  } else if (kind === 'tom') {
    let ph = 0;
    mono(len(0.5), t => { ph += (TAU * (95 + 70 * Math.exp(-t * 15))) / SR; const o = Math.sin(ph) * Math.exp(-t * 7) * 0.7 * vel; return [o, o]; });
  } else if (kind === 'crash') {
    const hp = new Biquad('hp', 5200, 0.7), bp = new Biquad('bp', 9000, 0.6);
    mono(len(1.8), t => { const nz = rnd() * 2 - 1; const o = (hp.run(nz) * 0.7 + bp.run(nz) * 0.5) * (0.55 * Math.exp(-t * 2.6) + 0.45 * Math.exp(-t * 11)) * 0.5 * vel; return [o * 0.9, o * 1.1]; });
  } else if (kind === 'shaker') {
    const bp = new Biquad('bp', 6500, 1.4);
    mono(len(0.16), t => { const env = (t < 0.018 ? t / 0.018 : 1) * Math.exp(-t * 28); const o = bp.run(rnd() * 2 - 1) * env * 1.4 * 0.3 * vel; return [o * 0.85, o * 1.15]; });
  } else { // sleigh: a jingle of small bells (bright noise + a cluster of high partials with a fast flutter)
    const bp = new Biquad('bp', 7800, 1.0);
    const partials = [4200, 5630, 6900, 8350];
    mono(len(0.5), t => {
      let s = 0;
      for (let k = 0; k < partials.length; k++) s += Math.sin(TAU * partials[k]! * t * (1 + k * 0.0007)) * (0.5 + 0.5 * Math.sin(TAU * (19 + k * 3.1) * t + k)) * Math.exp(-t * (7 + k * 2));
      const o = (s * 0.11 + bp.run(rnd() * 2 - 1) * Math.exp(-t * 16) * 0.5) * Math.min(1, t / 0.003) * vel * 0.8;
      return [o * 0.85, o * 1.15];
    });
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
  const run = (x: number, ch: ReturnType<typeof mk>): number => {
    let y = 0;
    for (const c of ch.c) {
      const o = c.b[c.i]!;
      c.d = o * (1 - c.damp) + c.d * c.damp;
      c.b[c.i] = x * 0.03 + c.d * c.fb;
      c.i = (c.i + 1) % c.b.length;
      y += o;
    }
    for (const a of ch.a) {
      const o = a.b[a.i]!, inp = y;
      a.b[a.i] = inp + o * 0.5;
      a.i = (a.i + 1) % a.b.length;
      y = o - inp;
    }
    return y;
  };
  const chL = mk(0), chR = mk(23);
  for (let i = 0; i < L.length; i++) {
    if ((i & 16383) === 0) yield i / L.length;
    const m = (sL[i]! + sR[i]!) * 0.5;
    L[i]! += run(m, chL) * wet; R[i]! += run(m, chR) * wet;
  }
}

export function reverb(send: Bus, out: Bus, wet: number, size = 0.8): void {
  for (const _ of reverbSteps(send, out, wet, size)) void _;
}
