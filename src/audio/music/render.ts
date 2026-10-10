import { Biquad, hitDrum, reverbSteps, setSampleRate, VOICES, type Bus } from './instruments';
import { TempoMap } from './notation';
import type { ResolvedMusic, ResolvedTrack } from './resolve';

/** The loudest sample of music at `volume: 1` (−6 dBFS), so it sits under speech and sound effects (sfx peak at −12 dBFS). */
export const MUSIC_PEAK = 0.5;
const RMS_CAP = 0.12;

/** Seeded random numbers (mulberry32): the same seed always gives the same music. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How long the music plays, in seconds: its notes plus the tail of the reverb. */
export function musicLength(m: ResolvedMusic): number {
  return m.seconds + m.tail;
}

/** The beats of a score as times in seconds (the kick hits when there are drums with a kick, otherwise every beat): what `react()` pulses on. */
export function musicBeatTimes(m: ResolvedMusic, until = m.seconds): number[] {
  const map = new TempoMap(m.tempo);
  const times: number[] = [];
  if (m.drums.some(s => s.drums.some(d => d.kind === 'kick'))) {
    for (const s of m.drums) {
      const kick = s.drums.find(d => d.kind === 'kick');
      if (!kick) continue;
      const end = Math.min(s.to, m.beats);
      for (let rep = 0; s.from + rep * s.repeat < end; rep++) for (const h of kick.hits) {
        const b = s.from + rep * s.repeat + h.i / m.grid;
        if (b < end) times.push(map.seconds(b));
      }
    }
    times.sort((a, b) => a - b);
  } else {
    for (let b = 0; b < m.beats; b++) times.push(map.seconds(b));
  }
  return times.filter(t => t < until);
}

/** The music as a sequence of slices: each `yield` is how much is done (0..1); the return value is the samples. */
function* renderMusicSteps(m: ResolvedMusic, sampleRate: number, length: number, loop: boolean): Generator<number, [Float32Array, Float32Array], void> {
  setSampleRate(sampleRate);
  // work is counted in units (a track, the drums, the reverb, the last pass): a yield says how many are done, as 0..1
  const units = m.tracks.length + (m.drums.length ? 1 : 0) + 2;
  let unit = 0;
  const total = Math.max(2, Math.round(length * sampleRate));
  const rnd = rng(m.seed);
  const map = new TempoMap(m.tempo);
  const loopSec = map.seconds(m.beats);
  const repeats = loop ? Math.max(1, Math.ceil(length / Math.max(0.1, loopSec))) : 1;
  const bus = (): Bus => ({ L: new Float32Array(total), R: new Float32Array(total) });
  const out = bus(), send = bus(), scratch = bus();
  const swingShift = (beat: number): number => {
    const frac = beat - Math.floor(beat);
    return beat + (Math.abs(frac - 0.5) < 1e-6 ? m.swing * 0.5 : Math.abs(frac - 0.75) < 1e-6 ? m.swing * 0.25 : 0);
  };

  const levelAt = (vol: ResolvedTrack['vol']): ((sec: number) => number) => {
    if (typeof vol === 'number') return () => vol;
    const pts = vol.map(([b, v]) => [map.seconds(b), v] as const);
    return sec => {
      const t = loop && loopSec > 0 ? sec % loopSec : sec;
      if (t <= pts[0]![0]) return pts[0]![1];
      for (let i = 1; i < pts.length; i++) {
        if (t < pts[i]![0]) return pts[i - 1]![1] + ((pts[i]![1] - pts[i - 1]![1]) * (t - pts[i - 1]![0])) / (pts[i]![0] - pts[i - 1]![0]);
      }
      return pts[pts.length - 1]![1];
    };
  };

  for (const tr of m.tracks) {
    const inst = VOICES[tr.inst];
    scratch.L.fill(0); scratch.R.fill(0);
    for (let r = 0; r < repeats; r++) {
      const offset = r * loopSec;
      for (let ei = 0; ei < tr.events.length; ei++) {
        const e = tr.events[ei]!;
        yield (unit + ei / tr.events.length) / units;
        const strum = e.midi.length > 1 ? tr.strum : 0;
        const startBeat = swingShift(e.t);
        const lenSec = Math.max(0.05, (map.seconds(e.t + e.dur) - map.seconds(e.t)) * tr.legato);
        e.midi.forEach((midi, k) => {
          const t0 = offset + map.seconds(startBeat) + (rnd() - 0.5) * m.humanize + k * strum;
          const vel = Math.min(1, e.vel * (0.93 + rnd() * 0.14));
          if (t0 * sampleRate >= total) return;
          inst(midi + tr.transpose, lenSec, vel, scratch, Math.max(0, Math.round(t0 * sampleRate)), rnd, tr.voice);
        });
      }
    }
    if (tr.tone < 1) {
      const fc = 400 * 50 ** tr.tone;
      const a = [new Biquad('lp', fc, 0.7), new Biquad('lp', fc, 0.7)], b = [new Biquad('lp', fc, 0.7), new Biquad('lp', fc, 0.7)];
      for (let i = 0; i < total; i++) {
        if ((i & 65535) === 0) yield (unit + 0.9) / units;
        scratch.L[i] = a[1]!.run(a[0]!.run(scratch.L[i]!));
        scratch.R[i] = b[1]!.run(b[0]!.run(scratch.R[i]!));
      }
    }
    const level = levelAt(tr.vol), pan = Math.max(-1, Math.min(1, tr.pan));
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * 1.3, gr = Math.sin(((pan + 1) * Math.PI) / 4) * 1.3;
    const constant = typeof tr.vol === 'number';
    let g = constant ? level(0) : 0;
    for (let i = 0; i < total; i++) {
      if ((i & 65535) === 0) yield (unit + 0.95) / units;
      if (!constant) g = level(i / sampleRate);
      const l = scratch.L[i]! * g * gl, r = scratch.R[i]! * g * gr;
      out.L[i]! += l; out.R[i]! += r;
      send.L[i]! += l * tr.reverb; send.R[i]! += r * tr.reverb;
    }
    unit++;
  }

  if (m.drums.length) {
    scratch.L.fill(0); scratch.R.fill(0);
    for (let r = 0; r < repeats; r++) {
      const offset = r * loopSec;
      for (const s of m.drums) {
        yield unit / units;
        const end = Math.min(s.to, m.beats);
        for (let rep = 0; s.from + rep * s.repeat < end - 1e-6; rep++) for (const d of s.drums) for (const h of d.hits) {
          const beat = s.from + rep * s.repeat + h.i / m.grid;
          if (beat >= end) continue;
          const vel = h.vel * (0.9 + rnd() * 0.2);
          const t0 = offset + map.seconds(swingShift(beat)) + (rnd() - 0.5) * m.humanize * 0.5;
          if (t0 * sampleRate >= total) continue;
          hitDrum(d.kind, vel, scratch, Math.max(0, Math.round(t0 * sampleRate)), rnd);
        }
      }
    }
    for (let i = 0; i < total; i++) {
      const l = scratch.L[i]! * m.drumVol, r = scratch.R[i]! * m.drumVol;
      out.L[i]! += l; out.R[i]! += r; send.L[i]! += l; send.R[i]! += r;
    }
    unit++;
  }

  for (const f of reverbSteps(send, out, m.reverb, 0.8)) yield (unit + f) / units;
  unit++;
  let peak = 0, sum = 0;
  for (let i = 0; i < total; i++) {
    if ((i & 65535) === 0) yield (unit + (0.5 * i) / total) / units;
    const l = (out.L[i] = Math.tanh(out.L[i]! * 0.9)), r = (out.R[i] = Math.tanh(out.R[i]! * 0.9));
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l * l + r * r;
  }
  const rms = Math.sqrt(sum / (2 * total));
  const gain = peak > 0 ? Math.min(MUSIC_PEAK / peak, RMS_CAP / Math.max(rms, 1e-9)) : 0;
  const fade = Math.min(Math.floor(0.4 * sampleRate), total >> 2);
  for (let i = 0; i < total; i++) {
    const f = i >= total - fade ? (total - 1 - i) / fade : 1;
    out.L[i]! *= gain * f; out.R[i]! *= gain * f;
  }
  return [out.L, out.R];
}

/**
 * Stereo samples `[left, right]` of the music at `sampleRate`, `length` seconds long: cut (with a short fade) if shorter than the music,
 * silent after it if longer, or repeated from the start with `loop`. Same music, same samples.
 */
export function renderMusic(m: ResolvedMusic, sampleRate: number, length: number, loop = false): [Float32Array, Float32Array] {
  const it = renderMusicSteps(m, sampleRate, length, loop);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** The same samples, made in slices: `pace(done)` (0..1) runs between them and may wait, so the page can paint while a long piece is made. */
export async function renderMusicAsync(
  m: ResolvedMusic, sampleRate: number, length: number, loop = false, pace?: (done: number) => Promise<void> | void,
): Promise<[Float32Array, Float32Array]> {
  const it = renderMusicSteps(m, sampleRate, length, loop);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (pace) await pace(r.value);
  }
}

