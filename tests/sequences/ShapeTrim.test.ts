import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
type Call = [string, ...unknown[]];

/** Build a shape layer; `draw()` runs the per-frame redraw and returns the Graphics calls it made. */
async function shape(spec: Record<string, unknown>) {
  const seq = new ShapeSequence({ type: 'shape', ...spec } as unknown as SequenceSpec, comp, comp);
  await seq.build();
  const g = seq.target as unknown as Record<string, (...a: unknown[]) => unknown> & { onRender: () => void };
  const calls: Call[] = [];
  for (const m of ['clear', 'beginPath', 'moveTo', 'lineTo', 'poly', 'rect', 'roundRect', 'circle', 'ellipse', 'closePath', 'fill', 'stroke']) {
    g[m] = (...a: unknown[]) => { calls.push([m, ...a]); return g; };
  }
  const tl = gsap.timeline({ paused: true });
  seq.bindTimeline(tl, 0);
  const draw = (): Call[] => { calls.length = 0; g.onRender(); return calls.filter(c => c[0] !== 'clear'); };
  return { seq, tl, draw };
}
const STROKE = { strokeColor: '#ffffff', strokeWidth: 6 };

describe('stroke trim: trimStart / trimEnd on a shape', () => {
  it('a line trimmed to its first quarter draws only that part, stroked', async () => {
    const { draw } = await shape({ shape: 'line', from: [0, 0], to: [400, 0], trimEnd: 0.25, initial: STROKE });
    const c = draw();
    expect(c.map(x => x[0])).toEqual(['moveTo', 'lineTo', 'stroke']);
    expect(c[0]).toEqual(['moveTo', 0, 0]);
    expect((c[1] as number[])[1]).toBeCloseTo(100, 6);
  });

  it('with no trim (or 0 → 1) the shape is drawn exactly as before', async () => {
    const plain = await shape({ shape: 'line', from: [0, 0], to: [400, 0], initial: STROKE });
    const full = await shape({ shape: 'line', from: [0, 0], to: [400, 0], trimStart: 0, trimEnd: 1, initial: STROKE });
    expect(full.draw()).toEqual(plain.draw());
    expect(plain.draw().map(x => x[0])).toEqual(['moveTo', 'lineTo', 'stroke']);
  });

  it('draw-on: animating trimEnd 0 → 1 redraws from the live value; at 0 nothing is stroked', async () => {
    const { tl, draw } = await shape({ shape: 'line', from: [0, 0], to: [400, 0], trimEnd: 0, initial: STROKE,
      keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 2 }] });
    expect(draw().some(x => x[0] === 'stroke')).toBe(false);
    tl.time(1);
    const half = draw();
    expect((half.find(x => x[0] === 'lineTo') as number[])[1]).toBeCloseTo(200, 6);
    tl.time(2);
    expect((draw().find(x => x[0] === 'lineTo') as number[])[1]).toBeCloseTo(400, 6);
  });

  it('a polygon outline is trimmed along its perimeter (the closing edge counts)', async () => {
    const { draw } = await shape({ shape: 'polygon', points: [[0, 0], [100, 0], [100, 100], [0, 100]], trimEnd: 0.875, initial: STROKE });
    const lines = draw().filter(x => x[0] === 'lineTo').map(x => [x[1], x[2]]);
    expect(lines.slice(-1)[0]![0]).toBeCloseTo(0, 6);
    expect(lines.slice(-1)[0]![1]).toBeCloseTo(50, 6);
  });

  it('the fill is not trimmed (a trim is for the stroke, like After Effects): the whole geometry is filled, then the stroked part is drawn', async () => {
    const { draw } = await shape({ shape: 'rect', width: 200, height: 100, trimEnd: 0.5, initial: { fillColor: '#ff0000', ...STROKE } });
    const names = draw().map(x => x[0]);
    expect(names.indexOf('rect')).toBeLessThan(names.indexOf('fill'));
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('beginPath'));
    expect(names.indexOf('beginPath')).toBeLessThan(names.indexOf('stroke'));
  });

  it('a rectangle border draws on clockwise from its top-left; trimStart cuts the head off', async () => {
    const { draw } = await shape({ shape: 'rect', width: 200, height: 100, anchorX: 0, anchorY: 0, trimStart: 0.5, trimEnd: 0.75, initial: STROKE });
    const c = draw();
    const mv = c.find(x => x[0] === 'moveTo') as number[];
    // perimeter 600: 0.5 → 0.75 = 300 → 450 = along the bottom edge from its right end (200,100) to (50,100)
    expect(mv[1]).toBeCloseTo(200, 6);
    expect(mv[2]).toBeCloseTo(100, 6);
    const to = c.filter(x => x[0] === 'lineTo').pop() as number[];
    expect(to[1]).toBeCloseTo(50, 6);
  });

  it('a circle starts at 12 o\'clock: a quarter ends at 3 o\'clock', async () => {
    const { draw } = await shape({ shape: 'circle', radius: 50, anchorX: 0.5, anchorY: 0.5, trimEnd: 0.25, initial: STROKE });
    const c = draw();
    const mv = c.find(x => x[0] === 'moveTo') as number[];
    expect(mv[1]).toBeCloseTo(0, 4); expect(mv[2]).toBeCloseTo(-50, 4);
    const last = c.filter(x => x[0] === 'lineTo').pop() as number[];
    expect(last[1]).toBeCloseTo(50, 4); expect(last[2]).toBeCloseTo(0, 4);
  });

  it('a layer that starts fully trimmed still gets its position / pivot from the whole shape', async () => {
    const full = await shape({ shape: 'line', from: [100, 100], to: [300, 100], initial: STROKE });
    const trimmed = await shape({ shape: 'line', from: [100, 100], to: [300, 100], trimEnd: 0, initial: STROKE });
    const t = trimmed.seq.target as unknown as { x: number; y: number; pivot: { x: number; y: number } };
    const f = full.seq.target as unknown as { x: number; y: number; pivot: { x: number; y: number } };
    expect([t.x, t.y, t.pivot.x, t.pivot.y]).toEqual([f.x, f.y, f.pivot.x, f.pivot.y]);
  });

  it('arc says what to use instead (its own angles)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await shape({ shape: 'arc', radius: 50, trimEnd: 0.5, initial: STROKE });
    expect(warn.mock.calls.some(c => String(c[0]).includes('endAngle'))).toBe(true);
    warn.mockRestore();
  });
});

describe('trimEach: every sub-path of a path draws on at the same time', () => {
  const D = 'M0 0 L100 0 M0 50 L400 50';                                   // two sub-paths, 100 and 400 long
  const strokedTo = (calls: Call[]) => calls.filter(c => c[0] === 'lineTo').map(c => c[1] as number);

  it('by default the trim walks the whole outline in order: a half is the first sub-path whole and a quarter of the second', async () => {
    const { draw } = await shape({ shape: 'path', d: D, trimEnd: 0.5, initial: STROKE });
    const calls = draw();
    expect(calls.filter(c => c[0] === 'moveTo').length).toBe(2);
    expect(strokedTo(calls)[0]).toBeCloseTo(100, 6);                         // the first, whole
    expect(strokedTo(calls)[1]).toBeCloseTo(150, 6);                         // the second, 150 of its 400
  });

  it('with trimEach: true every sub-path is trimmed on its own: half of each', async () => {
    const { draw } = await shape({ shape: 'path', d: D, trimEach: true, trimEnd: 0.5, initial: STROKE });
    expect(strokedTo(draw())).toEqual([50, 200]);
  });

  it('trimEach also works from `initial`, with trimStart, and animated: both lines reach their ends together', async () => {
    const { tl, draw } = await shape({ shape: 'path', d: D, initial: { ...STROKE, trimEach: true, trimEnd: 0 }, keyframes: [{ at: 0, to: { trimEnd: 1 }, duration: 2 }] });
    tl.time(1);
    expect(strokedTo(draw())).toEqual([50, 200]);
    tl.time(2);
    expect(draw().some(c => c[0] === 'stroke')).toBe(true);                  // trimEnd 1: no longer trimmed, the whole path is drawn as it is
    const dash = await shape({ shape: 'path', d: D, trimEach: true, trimStart: 0.25, trimEnd: 0.75, initial: STROKE });
    const calls = dash.draw();
    expect(calls.filter(c => c[0] === 'moveTo').map(c => c[1])).toEqual([25, 100]);
    expect(strokedTo(calls)).toEqual([75, 300]);
  });

  it('a value that is not true / false is ignored with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { draw } = await shape({ shape: 'path', d: D, trimEach: 'yes', trimEnd: 0.5, initial: STROKE });
    expect(warn.mock.calls.join('\n')).toMatch(/trimEach.*true or false/);
    expect(strokedTo(draw())[0]).toBeCloseTo(100, 6);                        // together, as without it
    warn.mockRestore();
  });
});

