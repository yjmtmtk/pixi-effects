/**
 * Drum kits for `music` (1.2): the same ten drum names, other sounds. `classic` is the kit music has always had (instruments.ts,
 * untouched); `808` the drum machine of hip-hop and trap; `acoustic` a real kit (rock, pop, jazz); `lofi` the classic kit through a
 * dusty sampler; `chip` a game console's noise channel. Seeded noise only: the same score gives the same samples.
 */

import { hitDrum, type DrumName } from './instruments';
import { Biquad, SR, TAU, type Bus, type Rand } from './synth';

export const KITS = ['classic', '808', 'acoustic', 'lofi', 'chip'] as const;
export type KitName = (typeof KITS)[number];

type Mono = (n: number, f: (t: number) => number, gl?: number, gr?: number) => void;
const len = (s: number): number => Math.floor(s * SR);

/** One drum hit of a kit into the bus at `start`. */
export function hitKit(kit: KitName, kind: DrumName, vel: number, out: Bus, start: number, rnd: Rand): void {
  if (kit === 'classic') { hitDrum(kind, vel, out, start, rnd); return; }
  if (kit === 'lofi') { lofi(kind, vel, out, start, rnd); return; }
  const mono: Mono = (n, f, gl = 1, gr = 1) => {
    const lim = Math.min(n, out.L.length - start), L = out.L, R = out.R;
    for (let i = 0; i < n; i++) { const o = f(i / SR); if (i < lim) { L[start + i]! += o * gl; R[start + i]! += o * gr; } }
  };
  if (kit === '808') tr808(kind, vel, mono, rnd);
  else if (kit === 'acoustic') acoustic(kind, vel, mono, rnd, out, start);
  else chip(kind, vel, mono, rnd, out, start);
}

/** The six detuned square oscillators of the 808's cymbals, summed (metallic, not a pitch). */
function metal(): (t: number) => number {
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * 1.6);
  return t => { let s = 0; for (const f of fs) s += (f * t) % 1 < 0.5 ? 1 : -1; return s / 6; };
}

function tr808(kind: DrumName, vel: number, mono: Mono, rnd: Rand): void {
  if (kind === 'kick') {
    let ph = 0;
    mono(len(1.4), t => { ph += (TAU * (48 + 92 * Math.exp(-t * 22))) / SR; return (Math.tanh(1.4 * Math.sin(ph)) * Math.exp(-t * 2.4) * 0.9 + (t < 0.003 ? (rnd() - 0.5) * 0.3 : 0)) * vel; });
  } else if (kind === 'snare') {
    const hp = new Biquad('hp', 1500, 0.7);
    let a = 0, b = 0;
    mono(len(0.45), t => { a += (TAU * 180) / SR; b += (TAU * 330) / SR; const tone = (Math.sin(a) + Math.sin(b) * 0.6) * Math.exp(-t * 20) * 0.45; return (tone + hp.run(rnd() * 2 - 1) * Math.exp(-t * 13) * 0.6) * 0.8 * vel; }, 0.97, 1.03);
  } else if (kind === 'clap') {
    const bp = new Biquad('bp', 1100, 1.5);
    mono(len(0.6), t => {
      let env = Math.exp(-Math.max(0, t - 0.033) * 14) * (t >= 0.033 ? 1 : 0);
      for (const ti of [0, 0.011, 0.022, 0.033]) if (t >= ti && t < ti + 0.011) env = Math.max(env, Math.exp(-(t - ti) * 220));
      return bp.run(rnd() * 2 - 1) * env * 1.6 * vel;
    }, 1, 0.92);
  } else if (kind === 'hat' || kind === 'openhat' || kind === 'crash') {
    const m = metal(), hp = new Biquad('hp', 7000, 0.7), bp = new Biquad('bp', 10000, 0.9), hp2 = new Biquad('hp', 4000, 0.7);
    const dec = kind === 'hat' ? 48 : kind === 'openhat' ? 7 : 1.8, n = len(kind === 'hat' ? 0.15 : kind === 'openhat' ? 0.75 : 2.2);
    mono(n, t => { const x = kind === 'crash' ? m(t) * 0.6 + (rnd() * 2 - 1) * 0.4 : m(t); return (kind === 'crash' ? hp2.run(x) : bp.run(hp.run(x))) * Math.exp(-t * dec) * (kind === 'crash' ? 0.5 : 0.9) * vel; }, 0.85, 1.15);
  } else if (kind === 'rim') {
    let a = 0, b = 0;
    mono(len(0.08), t => { a += (TAU * 1700) / SR; b += (TAU * 480) / SR; return (Math.sin(a) * 0.6 + Math.sin(b) * 0.5) * Math.exp(-t * 90) * 0.7 * vel; });
  } else if (kind === 'tom') {
    let ph = 0;
    mono(len(0.8), t => { ph += (TAU * 140 * (1 + 0.3 * Math.exp(-t * 8))) / SR; return Math.sin(ph) * Math.exp(-t * 4.5) * 0.75 * vel; });
  } else {
    // shaker and sleigh: the 808 had neither; the classic ones sit well with it
    const bp = new Biquad('bp', 6000, 1.3);
    mono(len(0.14), t => bp.run(rnd() * 2 - 1) * (t < 0.012 ? t / 0.012 : 1) * Math.exp(-t * 30) * (kind === 'sleigh' ? 0.6 : 0.45) * vel, 0.85, 1.15);
  }
}

function acoustic(kind: DrumName, vel: number, mono: Mono, rnd: Rand, out: Bus, start: number): void {
  if (kind === 'kick') {
    const click = new Biquad('hp', 3000, 0.7), skin = new Biquad('lp', 400, 0.7);
    let ph = 0;
    mono(len(0.6), t => { ph += (TAU * (55 + 48 * Math.exp(-t * 35))) / SR; const nz = rnd() * 2 - 1; return (Math.sin(ph) * Math.exp(-t * 9) + click.run(nz) * Math.exp(-t * 130) * 0.4 + skin.run(nz) * Math.exp(-t * 30) * 0.25) * 0.9 * vel; });
  } else if (kind === 'snare') {
    const wires = new Biquad('bp', 5000, 0.7), air = new Biquad('lp', 9000, 0.7);
    let a = 0, b = 0;
    mono(len(0.6), t => { a += (TAU * 190) / SR; b += (TAU * 340) / SR; const nz = rnd() * 2 - 1; const body = (Math.sin(a) + 0.5 * Math.sin(b)) * Math.exp(-t * 22) * 0.45; return (body + wires.run(nz) * Math.exp(-t * 9) * 0.9 + air.run(nz) * Math.exp(-t * 16) * 0.3) * 0.7 * vel; }, 0.96, 1.04);
  } else if (kind === 'hat' || kind === 'openhat') {
    const hp = new Biquad('hp', 8000, 0.7), ps = [4300, 6100, 7900, 9400].map(f => Math.min(f, SR * 0.45));
    const dec = kind === 'hat' ? 35 : 4.5;
    mono(len(kind === 'hat' ? 0.2 : 1), t => { let m = 0; for (const f of ps) m += Math.sin(TAU * f * t); return (hp.run(rnd() * 2 - 1) * 0.8 + m * 0.06) * Math.exp(-t * dec) * 0.5 * vel; }, 0.8, 1.2);
  } else if (kind === 'rim') {
    const bp = new Biquad('bp', 1800, 3);
    let ph = 0;
    mono(len(0.12), t => { ph += (TAU * 900) / SR; return (bp.run(rnd() * 2 - 1) * 1.2 + Math.sin(ph) * 0.4) * Math.exp(-t * 60) * 0.6 * vel; });
  } else if (kind === 'tom') {
    const hit = new Biquad('lp', 1200, 0.7);
    let ph = 0;
    mono(len(0.9), t => { ph += (TAU * 100 * (1 + 0.25 * Math.exp(-t * 10))) / SR; return (Math.sin(ph) * Math.exp(-t * 5) + hit.run(rnd() * 2 - 1) * Math.exp(-t * 40) * 0.3) * 0.75 * vel; });
  } else if (kind === 'crash') {
    const hp = new Biquad('hp', 4000, 0.7), bp = new Biquad('bp', 7000, 0.6), ps = [3100, 4700, 5800, 7300, 8900].map(f => Math.min(f, SR * 0.45));
    mono(len(2.6), t => { const nz = rnd() * 2 - 1; let m = 0; for (const f of ps) m += Math.sin(TAU * f * t * (1 + 0.002 * Math.sin(TAU * 3 * t))); return (hp.run(nz) * 0.6 + bp.run(nz) * 0.4 + m * 0.05) * (0.6 * Math.exp(-t * 1.6) + 0.4 * Math.exp(-t * 8)) * 0.5 * vel; }, 0.9, 1.1);
  } else {
    hitDrum(kind, vel, out, start, rnd);              // clap, shaker, sleigh: a player adds them by hand; the classic ones fit
  }
}

/** The classic kit through a dusty sampler: 8 bits, a third of the rate, a duller top, a little saturation. */
function lofi(kind: DrumName, vel: number, out: Bus, start: number, rnd: Rand): void {
  const n = Math.min(len(2.4), out.L.length - start);
  if (n <= 0) { hitDrum(kind, vel, { L: new Float32Array(0), R: new Float32Array(0) }, 0, rnd); return; }
  const tmp: Bus = { L: new Float32Array(n), R: new Float32Array(n) };
  hitDrum(kind, vel, tmp, 0, rnd);
  const hold = Math.max(1, Math.round(SR / 11025)), q = 128, sat = 1 / Math.tanh(1.3);
  const ll = new Biquad('lp', 3800, 0.7), lr = new Biquad('lp', 3800, 0.7);
  let hl = 0, hr = 0;
  for (let i = 0; i < n; i++) {
    if (i % hold === 0) { hl = Math.round(tmp.L[i]! * q) / q; hr = Math.round(tmp.R[i]! * q) / q; }
    out.L[start + i]! += Math.tanh(1.3 * ll.run(hl)) * sat * 0.9;
    out.R[start + i]! += Math.tanh(1.3 * lr.run(hr)) * sat * 0.9;
  }
}

/** Noise held for `hold` seconds a value: the coarse, pitched hiss of a console's noise channel. */
function heldNoise(rnd: Rand, rate: number): (i: number) => number {
  const hold = Math.max(1, Math.round(SR / rate));
  let v = 0;
  return i => { if (i % hold === 0) v = rnd() < 0.5 ? -1 : 1; return v; };
}

function chip(kind: DrumName, vel: number, mono: Mono, rnd: Rand, out: Bus, start: number): void {
  let i = 0;
  if (kind === 'kick') {
    let ph = 0;
    mono(len(0.25), t => { ph = (ph + (45 + 135 * Math.exp(-t * 30)) / SR) % 1; return (ph < 0.5 ? 1 : -1) * Math.exp(-t * 12) * 0.5 * vel; });
  } else if (kind === 'snare') {
    const nz = heldNoise(rnd, 7000);
    let ph = 0;
    mono(len(0.25), t => { ph = (ph + 220 / SR) % 1; return (nz(i++) * 0.8 * Math.exp(-t * 16) + (ph < 0.5 ? 1 : -1) * 0.3 * Math.exp(-t * 40)) * 0.4 * vel; });
  } else if (kind === 'hat' || kind === 'openhat') {
    const nz = heldNoise(rnd, 16000), dec = kind === 'hat' ? 60 : 10;
    mono(len(kind === 'hat' ? 0.08 : 0.35), t => nz(i++) * Math.exp(-t * dec) * 0.22 * vel, 0.9, 1.1);
  } else if (kind === 'clap' || kind === 'shaker') {
    const nz = heldNoise(rnd, kind === 'clap' ? 4000 : 12000);
    mono(len(kind === 'clap' ? 0.2 : 0.1), t => nz(i++) * Math.exp(-t * (kind === 'clap' ? 18 : 35)) * 0.3 * vel);
  } else if (kind === 'rim') {
    let ph = 0;
    mono(len(0.03), t => { ph = (ph + 1200 / SR) % 1; return (ph < 0.5 ? 1 : -1) * Math.exp(-t * 80) * 0.35 * vel; });
  } else if (kind === 'tom') {
    let ph = 0;
    mono(len(0.4), t => { ph = (ph + (110 + 110 * Math.exp(-t * 9)) / SR) % 1; return (4 * Math.abs(ph - 0.5) - 1) * Math.exp(-t * 8) * 0.6 * vel; });
  } else if (kind === 'crash') {
    const nz = heldNoise(rnd, 12000);
    mono(len(1.2), t => nz(i++) * Math.exp(-t * 2.5) * 0.25 * vel, 0.9, 1.1);
  } else {
    hitDrum(kind, vel, out, start, rnd);
  }
}
