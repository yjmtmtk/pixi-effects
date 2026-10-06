import { describe, it, expect, vi } from 'vitest';
import { stagger } from '../../src/presets/stagger';

const close = (a: number[], b: number[]) => { expect(a).toHaveLength(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6)); };

describe('stagger(count, options): delays in seconds', () => {
  it('`each` is the gap between neighbours, from the start by default', () => {
    close(stagger(5, { each: 0.1 }), [0, 0.1, 0.2, 0.3, 0.4]);
  });

  it('with no options the gap is 0.1 s', () => {
    close(stagger(3), [0, 0.1, 0.2]);
  });

  it('`amount` is the total spread from the first to the last, whatever the count', () => {
    close(stagger(5, { amount: 1 }), [0, 0.25, 0.5, 0.75, 1]);
    close(stagger(3, { amount: 1 }), [0, 0.5, 1]);
  });

  it('from: end, center, edges and an index', () => {
    close(stagger(5, { each: 0.1, from: 'end' }), [0.4, 0.3, 0.2, 0.1, 0]);
    close(stagger(5, { each: 0.1, from: 'center' }), [0.2, 0.1, 0, 0.1, 0.2]);
    close(stagger(5, { each: 0.1, from: 'edges' }), [0, 0.1, 0.2, 0.1, 0]);
    close(stagger(5, { each: 0.1, from: 1 }), [0.1, 0, 0.1, 0.2, 0.3]);
  });

  it('from: center with `each` keeps the neighbour gap (the spread is each × the farthest distance)', () => {
    close(stagger(4, { each: 0.2, from: 'center' }), [0.3, 0.1, 0.1, 0.3]);
  });

  it('ease reshapes the spread but keeps the first at 0 and the last at the full spread', () => {
    const d = stagger(5, { amount: 1, ease: 'power2.in' });
    expect(d[0]).toBeCloseTo(0, 9);
    expect(d[4]).toBeCloseTo(1, 9);
    expect(d[1]).toBeLessThan(0.25);           // slow start: the early ones are bunched
    expect(d[1]).toBeGreaterThan(0);
  });

  it('from: random is a seeded shuffle of the same delays: same seed same order, another seed another', () => {
    const a = stagger(8, { each: 0.1, from: 'random', seed: 3 });
    const b = stagger(8, { each: 0.1, from: 'random', seed: 3 });
    const c = stagger(8, { each: 0.1, from: 'random', seed: 4 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    close([...a].sort((x, y) => x - y), stagger(8, { each: 0.1 }));   // nobody is dropped or doubled
  });

  it('a grid measures straight-line distance across rows and columns', () => {
    // 3 columns x 2 rows, from the top-left cell: distances 0 1 2 / 1 √2 √5; max √5
    const d = stagger(6, { each: 1, grid: [3, 2] });
    close(d, [0, 1, 2, 1, Math.SQRT2, Math.sqrt(5)]);
    // from the centre of a 3x3 grid the four corners are the last
    const g = stagger(9, { each: 0.1, grid: [3, 3], from: 'center' });
    expect(g[4]).toBeCloseTo(0, 9);
    for (const corner of [0, 2, 6, 8]) expect(g[corner]).toBeCloseTo(0.1 * Math.SQRT2, 5);
    expect(g[1]).toBeCloseTo(0.1, 5);
  });

  it('a grid from an index, and from the end', () => {
    const g = stagger(4, { each: 1, grid: [2, 2], from: 3 });
    close(g, [Math.SQRT2, 1, 1, 0]);
    close(stagger(4, { each: 1, grid: [2, 2], from: 'end' }), [Math.SQRT2, 1, 1, 0]);
  });

  it('edge cases: none, one, and a spread that is all the same distance', () => {
    expect(stagger(0, { each: 0.1 })).toEqual([]);
    expect(stagger(1, { each: 0.1 })).toEqual([0]);
    expect(stagger(2, { each: 0 })).toEqual([0, 0]);
  });

  it('rejects options that cannot work, naming them', () => {
    expect(() => stagger(3, { each: 0.1, amount: 1 })).toThrow(/each.*amount/s);
    expect(() => stagger(3, { each: -1 })).toThrow(/each/);
    expect(() => stagger(3, { amount: NaN })).toThrow(/amount/);
    expect(() => stagger(-1)).toThrow(/count/);
    expect(() => stagger(3, { from: 'middle' as never })).toThrow(/from.*"middle"/s);
    expect(() => stagger(3, { from: 7 })).toThrow(/from/);
    expect(() => stagger(5, { grid: [2, 2] })).toThrow(/grid/);
  });

  it('warns about a misspelt option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stagger(3, { eech: 0.1 } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/eech/));
    warn.mockRestore();
  });
});

describe('stagger(layers, options): the same, applied to their `at`', () => {
  it('returns new layers with `at` shifted; the originals are untouched', () => {
    const layers = [{ type: 'text', text: 'a', at: 1 }, { type: 'text', text: 'b' }, { type: 'text', text: 'c', at: 0.5 }] as any[];
    const out = stagger(layers, { each: 0.2 });
    close(out.map(l => l.at), [1, 0.2, 0.9]);
    expect(out[0]).not.toBe(layers[0]);
    expect(layers[1].at).toBeUndefined();
    expect(out.map(l => l.text)).toEqual(['a', 'b', 'c']);
  });

  it('works with grid and from like the count form', () => {
    const out = stagger([{ type: 'shape' }, { type: 'shape' }, { type: 'shape' }] as any[], { each: 0.1, from: 'center' });
    close(out.map(l => l.at), [0.1, 0, 0.1]);
  });
});
