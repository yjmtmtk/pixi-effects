import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { hash32, grainValue, GrainFilter } from '../../src/filters/Grain';
import { createFilter } from '../../src/filters';
import { collectTimeFilters } from '../../src/core/timeFilters';
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';

beforeEach(() => { vi.restoreAllMocks(); });
const stats = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length; return { m, sd: Math.sqrt(v) }; };
const corr = (a: number[], b: number[]) => { const A = stats(a), B = stats(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i]! - A.m) * (b[i]! - B.m); return s / a.length / (A.sd * B.sd); };
const field = (frame: number, seed: number) => Array.from({ length: 10000 }, (_, i) => grainValue(i % 100, Math.floor(i / 100), frame, seed));

describe('the integer hash behind the grain (the same maths as the shader)', () => {
  it('hash32 is deterministic, an unsigned 32-bit integer, and spreads neighbours', () => {
    expect(hash32(1)).toBe(hash32(1));
    for (const x of [0, 1, 2, 0xffffffff, -1]) { const h = hash32(x); expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true); }
    expect(new Set(Array.from({ length: 5000 }, (_, i) => hash32(i))).size).toBe(5000);       // no collisions among the first 5000
    expect(hash32(0) ^ hash32(1)).toBeGreaterThan(0xffff);                                    // neighbouring inputs are far apart
  });
  it('grainValue has mean 0 and standard deviation 1 (so amount is the standard deviation at mid-grey), whatever the seed or frame', () => {
    for (const [f, s] of [[0, 0], [7, 0], [7, 3]] as const) {
      const { m, sd } = stats(field(f, s));
      expect(Math.abs(m)).toBeLessThan(0.05);
      expect(sd).toBeGreaterThan(0.95); expect(sd).toBeLessThan(1.05);
    }
  });
  it('another seed or another frame is another pattern (no correlation); the same seed and frame is the same pattern', () => {
    expect(field(5, 0)).toEqual(field(5, 0));
    expect(Math.abs(corr(field(5, 0), field(5, 1)))).toBeLessThan(0.05);
    expect(Math.abs(corr(field(5, 0), field(6, 0)))).toBeLessThan(0.05);
  });
});

describe('the grain filter', () => {
  it("{ type: 'grain' } is made by createFilter, with the defaults, and its numbers are readable and writable (so keyframes can move them)", () => {
    const f = createFilter({ type: 'grain', name: 'g' }) as unknown as GrainFilter;
    expect(f).toBeInstanceOf(GrainFilter);
    expect([f.amount, f.size, f.seed, f.fps, f.color]).toEqual([0.08, 1.5, 0, 24, 0]);
    f.amount = 0.2; f.size = 3; f.seed = 7.9; f.color = 0.5; f.fps = 12;
    expect([f.amount, f.size, f.seed, f.fps, f.color]).toEqual([0.2, 3, 7, 12, 0.5]);
    f.size = 0; expect(f.size).toBeGreaterThan(0);                                            // a size of 0 would divide by 0
  });
  it('setTime turns seconds into the grain frame: new grain every 1/fps s, a still pattern at fps 0', () => {
    const f = new GrainFilter({ fps: 24 }) as unknown as GrainFilter & { resources: { grainUniforms: { uniforms: Record<string, number> } } };
    const frame = () => f.resources.grainUniforms.uniforms.uFrame;
    f.setTime(0); expect(frame()).toBe(0);
    f.setTime(1 / 30); expect(frame()).toBe(0);                      // the second frame of 30 fps is still inside the first grain frame
    f.setTime(2 / 30); expect(frame()).toBe(1);
    f.setTime(1); expect(frame()).toBe(24);
    f.fps = 0; f.setTime(5); expect(frame()).toBe(0);
  });
  it('a time a hair under a frame boundary is that frame (a remapped clock carries ~1e-7 s of float noise), and a time well inside a frame is not moved', () => {
    const f = new GrainFilter({ fps: 30 }) as unknown as GrainFilter & { resources: { grainUniforms: { uniforms: Record<string, number> } } };
    const frame = () => f.resources.grainUniforms.uniforms.uFrame;
    for (let k = 1; k <= 120; k++) { f.setTime(k / 30 - 1e-7); expect(frame(), `frame ${k}`).toBe(k); }
    for (let k = 0; k < 120; k++) { f.setTime((k + 0.4) / 30); expect(frame(), `inside frame ${k}`).toBe(k); }
  });
  it('a mistyped option says which one was meant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new GrainFilter({ amout: 0.1 } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/grain.*unknown option "amout".*did you mean "amount"/s));
  });
});

describe('the movie feeds time to the filters that want it', () => {
  const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
  it('collectTimeFilters finds a filter with setTime on a layer and on the root, and nothing else', async () => {
    const layer = new ShapeSequence({ type: 'shape', shape: 'rect', width: 10, height: 10, filters: [{ type: 'grain' }, { type: 'custom', filter: { apply() {} } }] } as unknown as SequenceSpec, comp, comp);
    await layer.build();
    const found = collectTimeFilters(layer);
    expect(found).toHaveLength(1);
    expect(typeof found[0]!.setTime).toBe('function');
    const plain = new ShapeSequence({ type: 'shape', shape: 'rect', width: 10, height: 10 } as unknown as SequenceSpec, comp, comp);
    await plain.build();
    expect(collectTimeFilters(plain)).toEqual([]);
  });
});
