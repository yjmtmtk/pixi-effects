import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderSfx, resolveSfx, sfxKey, sfxDefaultLength, SFX_PRESETS, SFX_PEAK, CUSTOM_LENGTH, type ResolvedSfx } from '../../src/audio/sfx';
import { PRESETS } from '../../src/audio/presets';
import { spectralCentroid } from '../../src/core/spectrum';

const SR = 48000;
const S = (preset: NonNullable<ResolvedSfx['preset']>, o: Partial<ResolvedSfx> = {}): ResolvedSfx =>
  ({ preset, pitch: 0, brightness: 0, seed: 0, length: sfxDefaultLength(preset), ...o });
const mono = ([l, r]: [Float32Array, Float32Array]) => l.map((x, i) => (x + r[i]!) / 2);
const rms = (a: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};
const fifth = (a: Float32Array, k: number) => rms(a, Math.floor((k * a.length) / 5), Math.floor(((k + 1) * a.length) / 5));
const zeroCrossings = (a: Float32Array) => {
  let n = 0;
  for (let i = 1; i < a.length; i++) if ((a[i - 1]! < 0) !== (a[i]! < 0)) n++;
  return n;
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('renderSfx — every preset', () => {
  for (const preset of SFX_PRESETS) {
    it(`${preset}: stereo, right length, finite, peak = SFX_PEAK × level, silent first and last sample`, () => {
      for (const sr of [22050, 44100, 48000]) {
        for (const pitch of [-24, 0, 24]) {
          const [l, r] = renderSfx(S(preset, { pitch }), sr);
          expect(l.length).toBe(Math.round(sfxDefaultLength(preset) * sr));
          expect(r.length).toBe(l.length);
          let peak = 0;
          let bad = 0;
          for (let i = 0; i < l.length; i++) {
            if (!Number.isFinite(l[i]!) || !Number.isFinite(r[i]!)) bad++;
            peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
          }
          expect(bad).toBe(0);
          expect(peak).toBeCloseTo(SFX_PEAK * PRESETS[preset].level, 5);
          for (const ch of [l, r]) {
            expect(Math.abs(ch[0]!)).toBeLessThan(1e-9);
            expect(Math.abs(ch[ch.length - 1]!)).toBeLessThan(1e-9);
          }
        }
      }
    });
  }

  it('is deterministic: the same sound renders the same samples', () => {
    for (const preset of SFX_PRESETS) expect(renderSfx(S(preset, { seed: 7 }), SR)).toEqual(renderSfx(S(preset, { seed: 7 }), SR));
  });

  it('seed changes the random parts (noise, glitch pattern, typewriter key)', () => {
    for (const preset of ['swoosh', 'glitch', 'typewriter'] as const) {
      expect(renderSfx(S(preset, { seed: 1 }), SR)).not.toEqual(renderSfx(S(preset, { seed: 2 }), SR));
    }
  });

  it('length stretches the sound (the layer duration is the sound length)', () => {
    expect(renderSfx(S('riser', { length: 0.5 }), SR)[0].length).toBe(24000);
    expect(renderSfx(S('pop', { length: 1 }), SR)[0].length).toBe(48000);
  });

  it('pitch +12 doubles the frequency (zero crossings of the beep)', () => {
    const base = zeroCrossings(mono(renderSfx(S('beep'), SR)));
    const up = zeroCrossings(mono(renderSfx(S('beep', { pitch: 12 }), SR)));
    expect(up / base).toBeGreaterThan(1.9);
    expect(up / base).toBeLessThan(2.1);
  });

  it('shapes: percussive presets decay, the riser builds, the swoosh peaks early and moves left → right', () => {
    for (const preset of ['click', 'pop', 'swipe', 'hit', 'chime', 'typewriter'] as const) {
      const m = mono(renderSfx(S(preset), SR));
      expect(fifth(m, 0), preset).toBeGreaterThan(fifth(m, 4) * 2);
    }
    const riser = mono(renderSfx(S('riser'), SR));
    expect(fifth(riser, 4)).toBeGreaterThan(fifth(riser, 0) * 3);
    const [l, r] = renderSfx(S('swoosh'), SR);
    const m = mono([l, r]);
    expect(fifth(m, 1)).toBeGreaterThan(fifth(m, 0));
    expect(fifth(m, 1)).toBeGreaterThan(fifth(m, 4));
    expect(fifth(l, 0)).toBeGreaterThan(fifth(r, 0));     // starts on the left
    expect(fifth(r, 3)).toBeGreaterThan(fifth(l, 3));     // ends on the right
  });

  it('brightness moves the spectral centroid: −1 darker, +1 brighter, and keeps the ends silent', () => {
    const c = (b: number) => spectralCentroid(mono(renderSfx(S('swoosh', { brightness: b }), SR)), SR);
    expect(c(1)).toBeGreaterThan(c(0) * 1.15);
    expect(c(-1)).toBeLessThan(c(0) * 0.85);
    const [l] = renderSfx(S('hit', { brightness: 1 }), SR);
    expect(Math.abs(l[l.length - 1]!)).toBeLessThan(1e-9);
  });

  it('swoosh IS the approved "air" candidate: sample-for-sample equal to scripts/sfx/swoosh-candidates.mjs at 44.1 kHz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swoosh-'));
    execFileSync('node', [resolve(__dirname, '../../scripts/sfx/swoosh-candidates.mjs'), dir]);
    const wav = readFileSync(join(dir, 'swoosh-air.wav'));
    const frames = (wav.length - 44) / 4;
    const [l, r] = renderSfx(S('swoosh'), 44100);
    expect(l.length).toBe(frames);
    // the script normalises to 0.708 and writes 16-bit; do the same to ours and compare
    let peak = 0;
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
    const q = (x: number) => Math.round(Math.max(-1, Math.min(1, (x * 0.708) / peak)) * 32767);
    let worst = 0;
    for (let i = 0; i < frames; i++) {
      worst = Math.max(worst, Math.abs(q(l[i]!) - wav.readInt16LE(44 + i * 4)), Math.abs(q(r[i]!) - wav.readInt16LE(46 + i * 4)));
    }
    expect(worst).toBeLessThanOrEqual(1);   // at most one LSB of rounding
  });
});

describe('resolveSfx', () => {
  it('accepts a preset name or { preset, pitch, seed }; length defaults to the preset, duration overrides it', () => {
    const warn = vi.fn();
    expect(resolveSfx('pop', undefined, 'layer "a"', warn)).toEqual({ preset: 'pop', pitch: 0, brightness: 0, seed: 0, length: sfxDefaultLength('pop') });
    expect(resolveSfx({ preset: 'riser', pitch: -5, brightness: 0.5, seed: 3 }, 1.5, 'layer "a"', warn)).toEqual({ preset: 'riser', pitch: -5, brightness: 0.5, seed: 3, length: 1.5 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('an unknown preset warns with the likely name and makes the layer silent', () => {
    const warn = vi.fn();
    expect(resolveSfx('whoosh', undefined, 'layer "a"', warn)).toBeNull();
    expect(resolveSfx({ preset: 'chmie' }, undefined, 'layer "b"', warn)).toBeNull();
    expect(String(warn.mock.calls[0]![0])).toContain('did you mean "swoosh"');
    expect(String(warn.mock.calls[1]![0])).toContain('did you mean "chime"');
    expect(String(warn.mock.calls[1]![0])).toContain('presets: click, pop, swoosh, swipe');
  });

  it('layer fields inside sfx say where they belong; other unknown options get a suggestion', () => {
    const warn = vi.fn();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveSfx({ preset: 'pop', duration: 0.3, volume: 0.5, pich: 3 }, undefined, 'layer "a"', warn);
    expect(r).toEqual({ preset: 'pop', pitch: 0, brightness: 0, seed: 0, length: sfxDefaultLength('pop') });
    expect(warn.mock.calls.map(c => String(c[0]))).toEqual([
      'pixi-effects: layer "a": "duration" goes on the audio layer, not inside sfx (the sound\'s length is the layer\'s duration)',
      'pixi-effects: layer "a": "volume" goes on the audio layer, not inside sfx (the sound\'s length is the layer\'s duration)',
    ]);
    expect(String(consoleWarn.mock.calls[0]![0])).toContain('unknown option "pich" — did you mean "pitch"?');
  });

  it('clamps pitch, brightness and length with a warning', () => {
    const warn = vi.fn();
    expect(resolveSfx({ preset: 'beep', pitch: 40, brightness: -3 }, 30, 'layer "a"', warn)).toEqual({ preset: 'beep', pitch: 24, brightness: -1, seed: 0, length: 10 });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('custom voices: a usable sound from a short list; length defaults to 0.5 s', () => {
    const warn = vi.fn();
    const r = resolveSfx({ voices: [{ wave: 'noise', filter: { type: 'bandpass', freq: [500, 5000] }, envelope: 'bell', pan: [-0.5, 0.5] }] }, undefined, 'layer "a"', warn)!;
    expect(warn).not.toHaveBeenCalled();
    expect(r.preset).toBeNull();
    expect(r.length).toBe(CUSTOM_LENGTH);
    const [l, rr] = renderSfx(r, SR);
    expect(l.length).toBe(CUSTOM_LENGTH * SR);
    let peak = 0;
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(rr[i]!));
    expect(peak).toBeCloseTo(SFX_PEAK, 5);
    expect(renderSfx(r, SR)).toEqual(renderSfx(r, SR));
    expect(sfxKey(r)).not.toBe(sfxKey({ ...r, voices: [{ ...r.voices![0]!, gain: 0.5 }] }));
  });

  it('custom voices: every likely mistake is named with the right word; a voice with no usable wave is skipped', () => {
    const warn = vi.fn();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveSfx({ voices: [
      { wave: 'sawtooth' },
      { wave: 'noise', filter: { type: 'lp', freq: 800 }, envelope: 'decay', frequency: 3 },
    ] }, 0.3, 'layer "a"', warn)!;
    const msgs = warn.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => m.includes('voices[0]') && m.includes('did you mean "saw"'))).toBe(true);
    expect(msgs.some(m => m.includes('voices[1].filter') && m.includes('did you mean "lowpass"'))).toBe(true);
    expect(msgs.some(m => m.includes('voices[1]') && m.includes('did you mean "fall"'))).toBe(true);
    expect(String(consoleWarn.mock.calls[0]![0])).toContain('unknown option "frequency" — did you mean "freq"?');
    expect(r.voices).toHaveLength(1);
    expect(resolveSfx({ voices: [] }, undefined, 'layer "b"', warn)).toBeNull();
  });

  it('a duration that is not a number (a string, NaN, 0, negative) falls back to the preset length with a warning', () => {
    const warn = vi.fn();
    for (const bad of ['0.3', Number.NaN, 0, -1, null, {}]) {
      const r = resolveSfx('pop', bad as never, 'layer "a"', warn)!;
      expect(typeof r.length).toBe('number');
      expect(Number.isFinite(r.length)).toBe(true);
    }
    expect(resolveSfx('pop', '0.3' as never, 'layer "a"', warn)!.length).toBe(sfxDefaultLength('pop'));
    expect(warn.mock.calls.some(c => /duration/.test(String(c[0])))).toBe(true);
  });

  it('a voice that can never be heard (from >= to, gain 0) warns and is skipped; a non-numeric seed warns', () => {
    const warn = vi.fn();
    expect(resolveSfx({ voices: [{ wave: 'sine', from: 0.8, to: 0.2 }] }, undefined, 'layer "a"', warn)).toBeNull();
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('voices[0]') && /from.*less than.*to/.test(m))).toBe(true);
    const w2 = vi.fn();
    expect(resolveSfx({ voices: [{ wave: 'sine', gain: 0 }, { wave: 'noise' }] }, undefined, 'layer "b"', w2)!.voices).toHaveLength(1);
    expect(w2.mock.calls.map(c => String(c[0])).some(m => m.includes('voices[0]') && /gain/.test(m))).toBe(true);
    const w3 = vi.fn();
    expect(resolveSfx({ preset: 'pop', seed: Number.NaN }, undefined, 'layer "c"', w3)!.seed).toBe(0);
    expect(resolveSfx({ preset: 'pop', seed: 'abc' as never }, undefined, 'layer "c"', w3)!.seed).toBe(0);
    expect(w3.mock.calls.filter(c => /seed/.test(String(c[0])))).toHaveLength(2);
  });

  it('sfxKey is equal exactly when the sounds are equal', () => {
    expect(sfxKey(S('pop'))).toBe(sfxKey(S('pop')));
    expect(sfxKey(S('pop'))).not.toBe(sfxKey(S('pop', { seed: 1 })));
    expect(sfxKey(S('pop'))).not.toBe(sfxKey(S('pop', { length: 0.2 })));
  });
});
