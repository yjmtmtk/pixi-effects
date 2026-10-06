import type { Voice } from './dsp';
import type { SfxPreset } from '../types';

export interface PresetContext {
  /** Pitch ratio, `2 ** (pitch / 12)`. Multiply every frequency and cutoff by it. */
  p: number;
  /** Seeded random numbers in [0, 1) for the preset's own structure (glitch pattern, key jitter). */
  rand: () => number;
}

export interface PresetDef {
  /** Length in seconds when the layer gives no `duration`. */
  length: number;
  /** Where the sound is loudest, as a fraction of its length — what to line up with the picture. */
  peak: number;
  /** Peak level relative to SFX_PEAK. Tuned by ear so the presets sound about equally loud. */
  level: number;
  /** Base noise seed (the take that was approved by ear); the layer's `seed` offsets it. */
  seed: number;
  voices(c: PresetContext): Voice[];
}

const fall = (attack: number, power: number) => ({ shape: 'fall' as const, attack, power });
const hold = { shape: 'hold' as const };

export const PRESETS: Record<SfxPreset, PresetDef> = {
  // UI click / tick: a bright noise snap with a short tonal tick
  click: { length: 0.04, peak: 0.05, level: 0.8, seed: 101, voices: ({ p }) => [
    { wave: 'noise', filter: { type: 'highpass', freq: 2500 * p, q: 0.7 }, env: fall(0.05, 4), gain: 1 },
    { wave: 'sine', freq: 1800 * p, to: 0.6, env: fall(0.05, 4), gain: 0.6 },
  ] },
  // an element popping in: a fast upward sine blip
  pop: { length: 0.12, peak: 0.05, level: 1, seed: 202, voices: ({ p }) => [
    { wave: 'sine', freq: [300 * p, 1100 * p], env: fall(0.02, 3), gain: 1 },
    { wave: 'noise', filter: { type: 'bandpass', freq: 2000 * p, q: 1 }, to: 0.15, env: fall(0.1, 2), gain: 0.25 },
  ] },
  // APPROVED by the owner ("air"): band-passed noise sweeping 500 → 5200 Hz, bell envelope, moving left → right
  swoosh: { length: 0.5, peak: 0.32, level: 1, seed: 6839, voices: ({ p }) => [
    { wave: 'noise', filter: { type: 'bandpass', freq: [500 * p, 5200 * p], q: 1.3 }, env: { shape: 'bell', attack: 0.32 }, pan: [-0.6, 0.6], gain: 3.2 },
  ] },
  // quick UI swipe (candidate "swipe"): short, bright, hard front
  swipe: { length: 0.22, peak: 0.04, level: 0.8, seed: 7816, voices: ({ p }) => [
    { wave: 'noise', filter: { type: 'highpass', freq: [2200 * p, 9000 * p], q: 0.9 }, env: fall(0.04, 3), pan: [-0.3, 0.3], gain: 1.6 },
  ] },
  // impact / thud for a slam: a falling low sine plus a burst of dark noise
  hit: { length: 0.7, peak: 0.01, level: 1, seed: 303, voices: ({ p }) => [
    { wave: 'sine', freq: [140 * p, 42 * p], env: fall(0.005, 4), gain: 1 },
    { wave: 'noise', filter: { type: 'lowpass', freq: [4000 * p, 200 * p], q: 0.7 }, to: 0.3, env: fall(0.02, 2), gain: 0.6 },
  ] },
  // tension build cut at its top (candidate "riser", reverse-cymbal style): a hit should follow it
  riser: { length: 1, peak: 0.97, level: 0.9, seed: 8793, voices: ({ p }) => [
    { wave: 'noise', filter: { type: 'bandpass', freq: [300 * p, 6500 * p], q: 0.8 }, env: { shape: 'swell', power: 2.2 }, gain: 3 },
  ] },
  // success / ding: a bell (inharmonic partials, the higher ones die sooner)
  chime: { length: 1.4, peak: 0, level: 0.8, seed: 404, voices: ({ p }) => [
    [1, 1, 1], [2.76, 0.45, 0.7], [5.4, 0.25, 0.45], [8.93, 0.12, 0.3],
  ].map(([ratio, gain, to]) => ({ wave: 'sine' as const, freq: 1046.5 * p * ratio!, to, env: fall(0.002, 3), gain: gain! })) },
  // countdown / alert beep: a steady soft square tone
  beep: { length: 0.16, peak: 0.5, level: 0.5, seed: 505, voices: ({ p }) => [
    { wave: 'square', freq: 880 * p, filter: { type: 'lowpass', freq: 3000 * p, q: 0.7 }, env: hold, gain: 1 },
  ] },
  // collect / reward: two quick square notes (B5 → E6)
  coin: { length: 0.4, peak: 0.2, level: 0.6, seed: 606, voices: ({ p }) => [
    { wave: 'square', freq: 987.77 * p, to: 0.18, env: hold, gain: 0.8 },
    { wave: 'square', freq: 1318.51 * p, from: 0.18, env: fall(0.01, 2), gain: 1 },
  ] },
  // digital glitch: a seeded run of short square / noise bursts at random pitches
  glitch: { length: 0.35, peak: 0, level: 0.5, seed: 707, voices: ({ p, rand }) => {
    const out: Voice[] = [];
    for (let t = 0; t < 0.95;) {
      const to = Math.min(1, t + 0.04 + rand() * 0.12);
      out.push({ wave: rand() < 0.3 ? 'noise' : 'square', freq: (80 + rand() * 1600) * p, from: t, to,
        env: hold, pan: rand() * 1.2 - 0.6, gain: 0.5 + rand() * 0.5 });
      t = to + rand() * 0.05;
    }
    return out;
  } },
  // one typewriter key: a resonant noise click plus a low thump; `seed` changes the key
  typewriter: { length: 0.06, peak: 0.03, level: 0.8, seed: 808, voices: ({ p, rand }) => [
    { wave: 'noise', filter: { type: 'bandpass', freq: (2200 + rand() * 1600) * p, q: 2.5 }, env: fall(0.03, 4), gain: 1 },
    { wave: 'sine', freq: (150 + rand() * 40) * p, env: fall(0.03, 4), gain: 0.5 },
  ] },
};

/** Every preset name, in the order of the docs. (`PRESETS` is a `Record<SfxPreset, …>`, so a missing name is a type error.) */
export const SFX_PRESETS = Object.keys(PRESETS) as SfxPreset[];
