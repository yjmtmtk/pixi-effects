import { describe, it, expect, vi } from 'vitest';
import { react } from '../../src/presets/react';
import { bpmEnvelope, type AudioEnvelope } from '../../src/audio/envelope';

const tweens = (k: any[]) => k.slice(1);
/** A hand-made envelope: `level` is whatever you give it, one value per frame at 10 fps. */
function made(level: number[], extra: Partial<AudioEnvelope> = {}): AudioEnvelope {
  const s = Float32Array.from(level);
  return {
    frameRate: 10, duration: (level.length - 1) / 10, frames: level.length, series: { level: s, bass: Float32Array.from(level.map(v => v * 0.5)) }, beats: [], bpm: null,
    at(t, name = 'level') { const a = this.series[name]!; const x = Math.min(Math.max(t * 10, 0), a.length - 1); const i = Math.floor(x); return i + 1 < a.length ? a[i]! + (a[i + 1]! - a[i]!) * (x - i) : a[i]!; },
    ...extra,
  };
}

describe('react(): keyframes that follow the sound', () => {
  it('starts with a set at the first frame, then one linear step per frame; each value is base + amount × the level', () => {
    const env = made([0, 0.5, 1, 0.5, 0]);
    const k = react(env, { duration: 0.4, props: { scale: { base: 1, amount: 0.3 } } }) as any[];
    expect(k[0]).toMatchObject({ at: 0, set: { scale: 1 } });
    expect(tweens(k)).toHaveLength(4);
    expect(tweens(k).map(t => t.to.scale)).toEqual([1.15, 1.3, 1.15, 1]);
    expect(tweens(k)[0]).toMatchObject({ at: 0, duration: 0.1, ease: 'none' });
  });

  it('`at` offsets the run; a band is named; several properties move together, each its own way', () => {
    const env = made([0, 1, 0, 1, 0]);
    const k = react(env, { at: 2, duration: 0.4, props: { scale: { base: 1, amount: 1 }, alpha: { base: 0.2, amount: 0.8, band: 'bass' } } }) as any[];
    expect(k[0]).toMatchObject({ at: 2, set: { scale: 1, alpha: 0.2 } });
    expect(tweens(k)[0].at).toBe(2);
    expect(tweens(k)[0].to).toEqual({ scale: 2, alpha: 0.6 });                       // level 1: scale 1 + 1; bass 0.5: alpha 0.2 + 0.8 × 0.5
  });

  it('the base is the value it rests at (default 0) and `invert` / `curve` reshape the level', () => {
    const env = made([0, 0.5, 1]);
    const inv = react(env, { duration: 0.2, props: { y: { amount: 10, invert: true } } }) as any[];
    expect([inv[0].set.y, ...tweens(inv).map(t => t.to.y)]).toEqual([10, 5, 0]);
    const sq = react(env, { duration: 0.2, props: { y: { amount: 10, curve: 2 } } }) as any[];
    expect(tweens(sq).map(t => t.to.y)).toEqual([2.5, 10]);                          // 0.5² × 10, then 10
  });

  it('smoothing: a fast rise and a slow fall (attack / release in seconds), like a level meter', () => {
    const env = made([0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    const raw = react(env, { duration: 1, props: { v: { amount: 1 } } }) as any[];
    const smooth = react(env, { duration: 1, props: { v: { amount: 1, attack: 0.02, release: 0.3 } } }) as any[];
    const r = [raw[0].set.v, ...tweens(raw).map(t => t.to.v)], s = [smooth[0].set.v, ...tweens(smooth).map(t => t.to.v)];
    expect(r[5]).toBe(0);                                                            // raw drops at once
    expect(s[5]).toBeGreaterThan(0.5);                                               // smoothed: it hangs on
    expect(s[10]).toBeLessThan(s[5]!); expect(s[10]).toBeGreaterThan(0);
    expect(s[2]).toBeGreaterThan(0.9);                                               // and it rises quickly
  });

  it('beats: a pulse that jumps to full on each beat and decays after it', () => {
    const env = bpmEnvelope(60, { duration: 3, frameRate: 10 });                       // a beat every second
    const k = react(env, { duration: 2, props: { scale: { base: 1, amount: 0.5, beats: true, decay: 0.3 } } }) as any[];
    const v = [k[0].set.scale, ...tweens(k).map(t => t.to.scale)];
    expect(v[0]).toBeCloseTo(1.5, 6);                                                // on the beat
    expect(v[3]).toBeCloseTo(1 + 0.5 * Math.exp(-0.3 / 0.3), 3);                      // 0.3 s later
    expect(v[9]).toBeLessThan(1.05);                                                 // nearly at rest
    expect(v[10]).toBeCloseTo(1.5, 6);                                               // the next beat
  });

  it('audioOffset says where the layer starts inside the sound; loop repeats the sound, otherwise the end is held', () => {
    const env = made([0, 0.2, 0.4, 0.6, 0.8, 1]);                                      // 0.5 s of sound
    const shifted = react(env, { duration: 0.2, audioOffset: 0.3, props: { v: { amount: 1 } } }) as any[];
    expect(shifted[0].set.v).toBeCloseTo(0.6, 6);
    const held = react(env, { duration: 1, props: { v: { amount: 1 } } }) as any[];
    expect(tweens(held).at(-1).to.v).toBe(1);
    const looped = react(env, { duration: 1, loop: true, props: { v: { amount: 1 } } }) as any[];
    expect(tweens(looped)[4]!.to.v).toBeCloseTo(0, 5);                               // t = 0.5: the sound has just started again
    expect(tweens(looped)[5]!.to.v).toBeCloseTo(0.2, 5);                             // t = 0.6: 0.1 s into the second round
  });

  it('frameRate samples less often than the envelope (and the steps are longer)', () => {
    const env = made([0, 0.25, 0.5, 0.75, 1, 1, 1, 1, 1, 1, 1]);
    const k = react(env, { duration: 1, frameRate: 5, props: { v: { amount: 1 } } }) as any[];
    expect(tweens(k)).toHaveLength(5);
    expect(tweens(k)[0].duration).toBe(0.2);
  });

  it('rejects what cannot work and names the options: no props, a missing band, too many keyframes', () => {
    const env = made([0, 1]);
    expect(() => react(env, { duration: 1, props: {} })).toThrow(/props/);
    expect(() => react(env, { duration: 0, props: { v: { amount: 1 } } })).toThrow(/duration/);
    expect(() => react(env, { duration: 1, props: { v: { amount: 1, band: 'sub' } } })).toThrow(/band "sub".*level.*bass/s);
    expect(() => react(env, { duration: 1, props: { v: { amount: NaN } } })).toThrow(/amount/);
    expect(() => react(env, { duration: 1, props: { v: { amount: 1, beats: true, decay: 0 } } })).toThrow(/decay/);
    expect(() => react(env, { duration: 1000, props: { v: { amount: 1 } } })).toThrow(/too many keyframes.*frameRate/s);
  });

  it('warns about a misspelt option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    react(made([0, 1]), { duration: 0.1, audioOffst: 1, props: { v: { amount: 1 } } } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/audioOffst.*audioOffset/s));
    warn.mockRestore();
  });
});
