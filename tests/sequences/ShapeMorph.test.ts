import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  // a tiny SVG reader for the tests: M / L / Z with absolute numbers
  m.GraphicsPath = class {
    shapePath = { shapePrimitives: [] as Array<{ shape: { points: number[]; closePath: boolean } }> };
    constructor(public svgD: string) {
      const toks = svgD.match(/[MLZ]|-?\d+(\.\d+)?/g) ?? [];
      let cur: number[] = [];
      const flush = (closed: boolean) => { if (cur.length >= 4) this.shapePath.shapePrimitives.push({ shape: { points: cur, closePath: closed } }); cur = []; };
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i]!;
        if (t === 'M') { flush(false); cur.push(Number(toks[++i]), Number(toks[++i])); }
        else if (t === 'L') cur.push(Number(toks[++i]), Number(toks[++i]));
        else if (t === 'Z') { const pts = cur; this.shapePath.shapePrimitives.push({ shape: { points: pts, closePath: true } }); cur = []; }
      }
      flush(false);
    }
  } as never;
  return m;
});
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
type Call = [string, ...unknown[]];
const SQUARE = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
const BIG = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

async function shape(spec: Record<string, unknown>) {
  const seq = new ShapeSequence({ type: 'shape', ...spec } as unknown as SequenceSpec, comp, comp);
  await seq.build();
  const g = seq.target as unknown as Record<string, (...a: unknown[]) => unknown> & { onRender: () => void };
  const calls: Call[] = [];
  for (const m of ['clear', 'beginPath', 'moveTo', 'lineTo', 'poly', 'path', 'closePath', 'fill', 'stroke']) {
    g[m] = (...a: unknown[]) => { calls.push([m, ...a]); return g; };
  }
  const tl = gsap.timeline({ paused: true });
  seq.bindTimeline(tl, 0);
  const draw = (): Call[] => { calls.length = 0; g.onRender(); return calls.filter(c => c[0] !== 'clear'); };
  return { seq, tl, draw };
}
const FILL = { fillColor: '#ffffff' };
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('path morph: morphTo + morph (0 → 1)', () => {
  it('at 0 the layer is drawn exactly as the path, at 1 exactly as the other one', async () => {
    const { seq, draw, tl } = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, initial: FILL, keyframes: [{ at: 0, to: { morph: 1 }, duration: 2, ease: 'none' }] });
    const start = draw().find(c => c[0] === 'path')!;
    expect((start[1] as { svgD: string }).svgD).toBe(SQUARE);
    tl.time(2);
    const end = draw().find(c => c[0] === 'path')!;
    expect((end[1] as { svgD: string }).svgD).toBe(BIG);
    expect(seq).toBeTruthy();
  });

  it('in between it is a polygon of points half way from one outline to the other', async () => {
    const { draw, tl } = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morphPoints: 8, initial: FILL, keyframes: [{ at: 0, to: { morph: 1 }, duration: 2, ease: 'none' }] });
    tl.time(1);
    const c = draw();
    const poly = c.find(x => x[0] === 'poly')!;
    expect(poly[2]).toBe(true);                                        // closed
    const pts = poly[1] as number[];
    expect(pts).toHaveLength(16);                                      // 8 points
    // the square 0..100 and the square 0..200 (same start corner, same direction) half way: 0..150, corner (150, 0) is the 3rd point
    expect(Math.max(...pts)).toBeCloseTo(150, 6);
    expect(Math.min(...pts)).toBeCloseTo(0, 6);
    expect(c.some(x => x[0] === 'fill')).toBe(true);
  });

  it('`morph` may be written at the top level or in initial, and a layer can start part way', async () => {
    const top = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morph: 0.5, morphPoints: 8, initial: FILL });
    expect(Math.max(...(top.draw().find(x => x[0] === 'poly')![1] as number[]))).toBeCloseTo(150, 6);
    const ini = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morphPoints: 8, initial: { ...FILL, morph: 0.5 } });
    expect(Math.max(...(ini.draw().find(x => x[0] === 'poly')![1] as number[]))).toBeCloseTo(150, 6);
  });

  it('morphPoints sets how finely the outline is sampled', async () => {
    const { draw } = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morph: 0.5, morphPoints: 40, initial: FILL });
    expect((draw().find(x => x[0] === 'poly')![1] as number[]).length).toBe(80);
  });

  it('a trimmed stroke follows the morphing outline', async () => {
    const { draw } = await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morph: 0.5, morphPoints: 8, trimEnd: 0.5, initial: { strokeColor: '#fff', strokeWidth: 4 } });
    const c = draw();
    expect(c.map(x => x[0])).toEqual(['moveTo', 'lineTo', 'lineTo', 'lineTo', 'lineTo', 'stroke'].slice(0, c.length));
    expect(c.filter(x => x[0] === 'lineTo').length).toBeGreaterThan(1);
  });

  it('a path with no morph keeps drawing exactly as before', async () => {
    const { draw } = await shape({ shape: 'path', d: SQUARE, initial: FILL });
    expect(draw().find(c => c[0] === 'path')).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });

  describe('mistakes are said out loud', () => {
    it('morph without morphTo', async () => {
      const { draw } = await shape({ shape: 'path', d: SQUARE, morph: 0.5, initial: FILL });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/morph.*morphTo/s));
      expect(draw().find(c => c[0] === 'path')).toBeTruthy();                // still drawn
    });

    it('morphTo on a shape that is not a path', async () => {
      await shape({ shape: 'rect', width: 10, height: 10, morphTo: BIG, initial: FILL });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/morphTo.*path/s));
    });

    it('a morphTo that draws nothing', async () => {
      const { draw } = await shape({ shape: 'path', d: SQUARE, morphTo: 'M 5 5', morph: 0.5, initial: FILL });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/morphTo.*nothing/s));
      expect(draw().find(c => c[0] === 'path')).toBeTruthy();
    });

    it('a morphPoints that cannot work', async () => {
      await shape({ shape: 'path', d: SQUARE, morphTo: BIG, morphPoints: 2, initial: FILL });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/morphPoints/));
    });
  });
});
