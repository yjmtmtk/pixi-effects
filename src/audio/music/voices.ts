/**
 * The second set of `music` voices (1.2): the sounds a genre needs and the first eight could only approximate. Same contract as the
 * first ones (instruments.ts): one note into a stereo bus, seeded noise only, so the same score always gives the same samples.
 */

import { Biquad, SR, TAU, adsr, glideOf, mtof, polyblep, saw, type Bus, type Voice } from './synth';

export const NEW_INSTRUMENTS = ['piano', 'organ', 'strings', 'brass', 'choir', 'flute', 'guitar', 'saw', 'supersaw', 'square', '808', 'marimba'] as const;
export type NewInstrumentName = (typeof NEW_INSTRUMENTS)[number];

/** A sine made by turning a vector (two multiplies a sample instead of Math.sin); renormalised now and then so it does not drift. */
class Rotor {
  x = 1; y = 0; c: number; s: number; n = 0;
  constructor(freq: number) { const w = (TAU * freq) / SR; this.c = Math.cos(w); this.s = Math.sin(w); }
  next(): number {
    const x = this.x * this.c - this.y * this.s, y = this.x * this.s + this.y * this.c;
    this.x = x; this.y = y;
    if (++this.n === 4096) { this.n = 0; const k = 1 / Math.sqrt(x * x + y * y); this.x *= k; this.y *= k; }
    return y;
  }
}

const write = (out: Bus, at: number, l: number, r: number): void => { out.L[at]! += l; out.R[at]! += r; };
const limit = (out: Bus, start: number, n: number): number => Math.max(0, Math.min(n, out.L.length - start));
const cents = (c: number): number => 2 ** (c / 1200);

export const NEW_VOICES: Record<NewInstrumentName, Voice> = {
  // acoustic piano: inharmonic partials struck by a hammer (brighter when harder), a two-stage decay, a damper after the written length
  piano(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.3, n = Math.floor(Math.min(dur + rel + 0.25, 8) * SR), lim = limit(out, start, n);
    const B = 0.00032, parts: Array<{ r: Rotor; r2: Rotor | null; a: number; k1: number; k2: number; e1: number; e2: number }> = [];
    for (let k = 1; k <= 10; k++) {
      const fk = f * k * Math.sqrt(1 + B * k * k);
      if (fk > SR * 0.45) break;
      const a = (1 / k ** 1.15) * Math.exp(-(k - 1) * (0.42 - 0.26 * vel));
      const d = 0.55 + 0.32 * k + f / 650;
      // the two decays as a factor a sample (exp(-d t) one multiply at a time)
      parts.push({ r: new Rotor(fk), r2: k <= 3 ? new Rotor(fk * cents(k === 1 ? 0.9 : 0.6)) : null, a, k1: Math.exp(-d / SR), k2: Math.exp((-d * 0.22) / SR), e1: 0.72, e2: 0.28 });
    }
    const hammer = new Biquad('lp', 1800 + 2500 * vel, 0.7), pan = Math.max(-0.6, Math.min(0.6, (m - 60) / 50));
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k]!;
        s += (p.r2 ? (p.r.next() + p.r2.next()) * 0.5 : p.r.next()) * p.a * (p.e1 + p.e2);
        p.e1 *= p.k1; p.e2 *= p.k2;
      }
      if (t < 0.012) s += hammer.run(rnd() * 2 - 1) * 0.18 * vel * (1 - t / 0.012);
      const damp = t < dur ? 1 : Math.exp(-(t - dur) * (5 / rel));
      const y = s * damp * 0.24 * vel * Math.min(1, t / 0.0015);
      write(out, start + i, y * (1 - pan * 0.5), y * (1 + pan * 0.5));
    }
  },
  // tonewheel organ: drawbar partials, a key click, a rotating speaker shared by every note (its phase follows the bus, not the note)
  organ(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), rel = o.release ?? 0.06, A = o.attack ?? 0.006, n = Math.floor((dur + rel) * SR), lim = limit(out, start, n);
    const ratios = [1, 2, 3, 4, 6, 8], amps = [1, 0.7, 0.45, 0.35, 0.2, 0.12];   // drawbars 8' 4' 2 2/3' 2' 1 1/3' 1': the note's own pitch at the bottom
    const wheels = ratios.map((r, k) => (f * r < SR * 0.45 ? { r: new Rotor(f * r), a: amps[k]! } : null)).filter((w): w is { r: Rotor; a: number } => !!w);
    const click = new Biquad('bp', 2400, 0.8), g = 0.1 * (0.75 + 0.25 * vel);
    // the rotating speaker turns at 6.1 Hz for every note alike: its phase follows the bus position, as one rotor started at sample 0
    const spin = new Rotor(6.1), w0 = (TAU * 6.1 * start) / SR;
    spin.x = Math.cos(w0); spin.y = Math.sin(w0);
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      const lfo = spin.next(), lfo2 = spin.x;
      let s = 0;
      for (const w of wheels) s += w.r.next() * w.a;
      if (t < 0.004) s += click.run(rnd() * 2 - 1) * 0.6;
      const env = t < dur ? Math.min(1, t / A) : Math.max(0, 1 - (t - dur) / rel);
      const y = s * env * g;
      write(out, start + i, y * (1 + 0.22 * lfo), y * (1 + 0.22 * lfo2));
    }
  },
  // string ensemble: three detuned saws with a vibrato that arrives late, through a gentle 24 dB low-pass
  strings(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.18, R = o.release ?? 0.5, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    const det = [cents(-9), 1, cents(8)], ph = det.map(() => rnd()), vph = rnd() * TAU;
    const cut = Math.min(5200, 900 + f * 3 + 1200 * vel);
    const l1 = new Biquad('lp', cut, 0.55), l2 = new Biquad('lp', cut, 0.55), r1 = new Biquad('lp', cut, 0.55), r2 = new Biquad('lp', cut, 0.55);
    const dts = [0, 0, 0], v = [0, 0, 0];
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      if (i % 32 === 0) { const vib = 1 + 0.0042 * Math.sin(TAU * 5.2 * t + vph) * Math.min(1, Math.max(0, (t - 0.15) / 0.45)); for (let k = 0; k < 3; k++) dts[k] = (f * det[k]! * vib) / SR; }
      for (let k = 0; k < 3; k++) { ph[k] = (ph[k]! + dts[k]!) % 1; v[k] = saw(ph[k]!, dts[k]!); }
      const env = t < dur ? Math.min(1, t / A) : Math.max(0, Math.min(1, dur / A) * (1 - (t - dur) / R));
      const g = env * 0.17 * vel;
      write(out, start + i, l2.run(l1.run(v[0]! + v[1]! * 0.7)) * g, r2.run(r1.run(v[2]! + v[1]! * 0.7)) * g);
    }
  },
  // brass section: two saws, a pitch scoop into the note, a filter that opens on the attack (the blare) and settles
  brass(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.03, R = o.release ?? 0.16, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    let p1 = rnd(), p2 = rnd();
    const lp = new Biquad('lp', 800, 1.2), lp2 = new Biquad('lp', 800, 0.7);
    for (let i = 0; i < lim; i++) {
      const t = i / SR, scoop = 2 ** ((-0.55 * Math.max(0, 1 - t / 0.06)) / 12);
      const d1 = (f * scoop) / SR, d2 = (f * scoop * 1.004) / SR;
      p1 = (p1 + d1) % 1; p2 = (p2 + d2) % 1;
      if (i % 32 === 0) {
        const open = t < 0.05 ? t / 0.05 : 0.6 + 0.4 * Math.exp(-(t - 0.05) * 5);
        const fc = Math.min(SR * 0.4, f * 1.5 + (f * 4 + 2200 * vel) * open);
        lp.set('lp', fc, 1.2); lp2.set('lp', fc * 1.4, 0.7);
      }
      const y = lp2.run(lp.run(saw(p1, d1) + saw(p2, d2) * 0.8)) * adsr(t, dur, A, 0.12, 0.82, R) * 0.2 * vel;
      write(out, start + i, y * 0.95, y * 1.05);
    }
  },
  // a choir singing "aah": detuned saws with their own slow vibratos, shaped by three vowel formants
  choir(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.35, R = o.release ?? 0.7, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    const det = [cents(-13), cents(-4), cents(5), cents(12)], ph = det.map(() => rnd()), vp = det.map(() => rnd() * TAU), vr = det.map((_, k) => 4.6 + k * 0.37);
    const formants = (): Biquad[] => [new Biquad('bp', 800, 8), new Biquad('bp', 1150, 11), new Biquad('bp', 2900, 20)];
    const fl = formants(), fr = formants(), bodyL = new Biquad('lp', f * 2.2, 0.7), bodyR = new Biquad('lp', f * 2.2, 0.7);
    const dts = [0, 0, 0, 0], v = [0, 0, 0, 0];
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      if (i % 32 === 0) { const deep = Math.min(1, t / 0.5); for (let k = 0; k < 4; k++) dts[k] = (f * det[k]! * (1 + 0.005 * deep * Math.sin(TAU * vr[k]! * t + vp[k]!))) / SR; }
      for (let k = 0; k < 4; k++) { ph[k] = (ph[k]! + dts[k]!) % 1; v[k] = saw(ph[k]!, dts[k]!); }
      const sl = v[0]! + v[1]!, sr = v[2]! + v[3]!;
      const vl = fl[0]!.run(sl) + fl[1]!.run(sl) * 0.55 + fl[2]!.run(sl) * 0.28 + bodyL.run(sl) * 0.35;
      const vr2 = fr[0]!.run(sr) + fr[1]!.run(sr) * 0.55 + fr[2]!.run(sr) * 0.28 + bodyR.run(sr) * 0.35;
      const env = t < dur ? Math.min(1, t / A) : Math.max(0, Math.min(1, dur / A) * (1 - (t - dur) / R));
      const g = env * 0.3 * vel;
      write(out, start + i, vl * g, vr2 * g);
    }
  },
  // flute: a nearly pure tone, a breathy chiff at the start, breath under the note, a late vibrato
  flute(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.06, R = o.release ?? 0.12, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    const breath = new Biquad('bp', Math.min(SR * 0.4, f * 2), 1.6), gl = glideOf(o);
    let ph = rnd();
    for (let i = 0; i < lim; i++) {
      const t = i / SR, vib = 1 + 0.0045 * Math.sin(TAU * 5 * t) * Math.min(1, Math.max(0, (t - 0.25) / 0.4));
      ph = (ph + ((gl ? f * gl(t) : f) * vib) / SR) % 1;
      const s1 = Math.sin(TAU * ph), c1 = Math.cos(TAU * ph);
      const tone = s1 + 0.22 * (2 * s1 * c1) + 0.06 * (s1 * (3 - 4 * s1 * s1));
      const air = breath.run(rnd() * 2 - 1) * (0.05 + 0.4 * Math.exp(-t * 30));
      const y = (tone + air) * adsr(t, dur, A, 0.1, 0.85, R) * 0.26 * vel;
      write(out, start + i, y, y);
    }
  },
  // electric guitar: a long-sustaining plucked string (fractional delay, so it is in tune), picked near the bridge; muted after the
  // written length. Clean by itself: `drive` makes it a rock guitar.
  guitar(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), R = o.release ?? 0.1, n = Math.floor(Math.min(dur + R + 0.05, 8) * SR), lim = limit(out, start, n);
    const D = Math.max(2, SR / f - 0.5), size = 2 ** Math.ceil(Math.log2(D + 4)), mask = size - 1, buf = new Float32Array(size);
    const pick = new Biquad('lp', 2200 + 4200 * vel, 0.6), L0 = Math.ceil(D), pos = Math.max(1, Math.round(D * 0.18));
    const exc = new Float32Array(L0);
    for (let i = 0; i < L0; i++) exc[i] = pick.run(rnd() * 2 - 1);
    for (let i = 0; i < L0; i++) buf[i] = exc[i]! - (i >= pos ? exc[i - pos]! : 0) * 0.85;
    const sustain = 0.99945 - 0.25 / (f + 300), muted = 0.965;
    const body = new Biquad('hp', 90, 0.7), pan = (rnd() - 0.5) * 0.25;
    let w = L0;
    const read = (back: number): number => { const p = w - back, i0 = Math.floor(p), fr = p - i0; return buf[i0 & mask]! * (1 - fr) + buf[(i0 - 1) & mask]! * fr; };
    for (let i = 0; i < lim; i++) {
      const t = i / SR, loss = t < dur ? sustain : muted;
      const y0 = loss * 0.5 * (read(D) + read(D + 1));
      buf[w & mask] = y0; w++;
      const y = body.run(y0) * 0.5 * vel * Math.min(1, t / 0.001);
      write(out, start + i, y * (1 - pan), y * (1 + pan));
    }
  },
  // a synth saw: two saws a hair apart through a low-pass that closes after the attack (leads, basses, stabs)
  saw(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.004, R = o.release ?? 0.12, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    let p1 = rnd(), p2 = rnd();
    const lp = new Biquad('lp', 2000, 0.9), gl = glideOf(o);
    for (let i = 0; i < lim; i++) {
      const t = i / SR, fn = gl ? f * gl(t) : f, d1 = fn / SR, d2 = (fn * 1.0035) / SR;
      p1 = (p1 + d1) % 1; p2 = (p2 + d2) % 1;
      if (i % 32 === 0) lp.set('lp', Math.min(SR * 0.42, f * 2 + (1200 + 5200 * vel) * (0.35 + 0.65 * Math.exp(-t * 6))), 0.9);
      const y = lp.run(saw(p1, d1) + saw(p2, d2) * 0.7) * adsr(t, dur, A, 0.2, 0.75, R) * 0.2 * vel;
      write(out, start + i, y * 0.92, y * 1.08);
    }
  },
  // the trance / EDM chord: seven saws spread in pitch and across the stereo field, thinned below
  supersaw(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.01, R = o.release ?? 0.35, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    const cs = [-28, -17, -7, 0, 7, 17, 28], amp = [0.7, 0.75, 0.85, 1, 0.85, 0.75, 0.7], pan = [-0.85, -0.55, -0.25, 0, 0.25, 0.55, 0.85];
    const dt = cs.map(c => (f * cents(c)) / SR), ph = cs.map(() => rnd());
    const hl = new Biquad('hp', 140, 0.7), hr = new Biquad('hp', 140, 0.7), ll = new Biquad('lp', 9000, 0.7), lr = new Biquad('lp', 9000, 0.7);
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      let l = 0, r = 0;
      for (let k = 0; k < 7; k++) { ph[k] = (ph[k]! + dt[k]!) % 1; const s = saw(ph[k]!, dt[k]!) * amp[k]!; l += s * (1 - pan[k]!); r += s * (1 + pan[k]!); }
      const g = adsr(t, dur, A, 0.3, 0.85, R) * 0.085 * vel;
      write(out, start + i, ll.run(hl.run(l)) * g, lr.run(hr.run(r)) * g);
    }
  },
  // the chip-tune pulse: a band-limited square (or a thinner pulse with `width`), switched on and off like a game console's
  square(m, dur, vel, out, start, _rnd, o) {
    const f = mtof(m), A = o.attack ?? 0.002, R = o.release ?? 0.02, n = Math.floor((dur + R) * SR), lim = limit(out, start, n);
    const w = Math.min(0.5, Math.max(0.05, o.width ?? 0.5)), gl = glideOf(o), dc = 2 * w - 1;
    let ph = 0;
    for (let i = 0; i < lim; i++) {
      const t = i / SR, dt = (gl ? f * gl(t) : f) / SR;
      ph += dt; if (ph >= 1) ph -= 1;
      let s = ph < w ? 1 : -1;
      s += polyblep(ph, dt);
      let q = ph - w; if (q < 0) q += 1;
      s -= polyblep(q, dt);
      const env = t < dur ? Math.min(1, t / A) * (0.85 + 0.15 * Math.exp(-t * 8)) : Math.max(0, 1 - (t - dur) / R) * 0.85;
      const y = (s - dc) * env * 0.15 * vel;
      write(out, start + i, y, y);
    }
  },
  // the 808 bass: a sine that drops into its pitch, decays slowly, and is saturated so a phone speaker still hears it
  '808'(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), R = o.release ?? 0.25, n = Math.floor((dur + R) * SR), lim = limit(out, start, n), gl = glideOf(o);
    const k = 1.7, norm = 1 / Math.tanh(k);
    let ph = 0;
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      ph += (TAU * (gl ? f * gl(t) : f) * (1 + 1.1 * Math.exp(-t * 30))) / SR;
      const body = Math.tanh(k * Math.sin(ph)) * norm;
      const env = (t < dur ? Math.exp(-t * 0.9) : Math.exp(-dur * 0.9) * Math.max(0, 1 - (t - dur) / R)) * Math.min(1, t / 0.002);
      const y = (body + (t < 0.002 ? (rnd() - 0.5) * 0.4 : 0)) * env * 0.5 * vel;
      write(out, start + i, y, y);
    }
  },
  // marimba: a struck wooden bar (the bar's modes at 1, 3.93 and 9.2 times the pitch) with a soft mallet; `ring` sets how long
  marimba(m, dur, vel, out, start, rnd, o) {
    const f = mtof(m), ring = o.ring ?? 1.1, base = (3 / ring) * (1 + f / 1500), n = Math.floor(Math.min(9 / base + 0.02, 5) * SR), lim = limit(out, start, n);
    const ratios = [1, 3.93, 9.2], amps = [1, 0.32 * (0.5 + vel), 0.1 * (0.4 + vel)], rates = [1, 4, 11];
    const modes = ratios.map(r => (f * r < SR * 0.45 ? new Rotor(f * r) : null));
    const mallet = new Biquad('bp', Math.min(SR * 0.4, f * 3), 1.2), pan = Math.max(-0.5, Math.min(0.5, (m - 66) / 40));
    void dur;
    for (let i = 0; i < lim; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < 3; k++) { const md = modes[k]; if (md) s += md.next() * amps[k]! * Math.exp(-base * rates[k]! * t); }
      if (t < 0.004) s += mallet.run(rnd() * 2 - 1) * 0.25 * vel;
      const y = s * Math.min(1, t / 0.001) * 0.32 * vel;
      write(out, start + i, y * (1 - pan), y * (1 + pan));
    }
  },
};
