import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { canvasProblems, canvasReport } from '../../src/core/canvasCheck';
import { createTimeline } from '../../src/core/timelineEngine';
import { installCanvas } from '../support/fakeGl';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 320, height: 180, duration: 4, frameRate: 30 };
/** The "pixels" are the arguments of the last fillRect. */
function pixelCtx() {
  let last: unknown[] = [];
  const ctx = new Proxy({}, {
    get(_t, key: string) {
      if (key === 'getImageData') return () => ({ data: Uint8ClampedArray.from(last.map(v => Number(v) & 255)) });
      return (...a: unknown[]) => { if (key === 'fillRect') last = a; };
    },
    set() { return true; },
  });
  return { ctx };
}
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 320, height: 180, duration: 4, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  comp.bindTimeline(createTimeline({ paused: true }));
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); installCanvas(null, pixelCtx() as never); });

describe('canvasProblems: the canvas layers of a movie whose same frame is not the same picture', () => {
  it('names the layer and the moments (also inside a nested composition); a pure layer is not mentioned', async () => {
    let n = 0;
    const comp = await build([
      { type: 'canvas', name: 'pure', draw: (ctx: CanvasRenderingContext2D, t: number) => { ctx.fillRect(Math.round(t * 10), 0, 1, 1); } },
      { type: 'composition', name: 'group', width: 200, height: 100, sequences: [
        { type: 'canvas', name: 'leaky', draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(n++, 0, 1, 1); } },
      ] },
    ]);
    const problems = canvasProblems(comp);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"leaky"');
    expect(problems[0]).toMatch(/same time/);
    expect(problems[0]).toMatch(/Math\.random|Date\.now|outlives/);
    expect(problems[0]).toMatch(/\d(\.\d+)? s/);
  });

  it('a movie with no canvas layer has nothing to say', async () => {
    expect(canvasProblems(await build([{ type: 'shape', shape: 'rect', width: 10, height: 10 }]))).toEqual([]);
  });

  it('catches state that builds up from call to call (an integrator: each call moves by the time since the last one), which two draws in a row at the same time cannot show', async () => {
    let x = 0, v = 0, last = 0;
    const comp = await build([{ type: 'canvas', name: 'integrator', draw: (ctx: CanvasRenderingContext2D, t: number) => {
      const dt = t - last; last = t; v += 9.8 * dt; x += v * dt; ctx.fillRect(Math.round(x * 10), 0, 1, 1);
    } }]);
    const problems = canvasProblems(comp);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"integrator"');
  });

  it('checks the canvas layers used as inline masks too', async () => {
    let n = 0;
    const comp = await build([{ type: 'shape', shape: 'rect', name: 'masked', width: 50, height: 50,
      mask: { type: 'canvas', name: 'maskdraw', width: 50, height: 50, draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(n++, 0, 1, 1); } } }]);
    const problems = canvasProblems(comp);
    expect(problems.some(m => m.includes('"maskdraw"'))).toBe(true);
  });
});

describe('canvasReport: what the check tells even when every canvas layer passes', () => {
  it('lists each canvas layer with the moments checked, a draw time and whether it passed (also inside a nested composition); no canvas layer, no rows', async () => {
    let n = 0;
    const comp = await build([
      { type: 'canvas', name: 'pure', draw: (ctx: CanvasRenderingContext2D, t: number) => { ctx.fillRect(Math.round(t * 10), 0, 1, 1); } },
      { type: 'composition', name: 'group', width: 200, height: 100, sequences: [
        { type: 'canvas', name: 'leaky', draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(n++, 0, 1, 1); } },
      ] },
    ]);
    const rows = canvasReport(comp);
    expect(rows.map(r => [r.name, r.ok])).toEqual([['pure', true], ['leaky', false]]);
    expect(rows[0]!.moments).toHaveLength(4);
    expect(rows[0]!.drawMs).toBeGreaterThanOrEqual(0);
    expect(canvasReport(await build([{ type: 'shape', shape: 'rect', width: 10, height: 10 }]))).toEqual([]);
  });

  it('the sentence about a layer that differs gives the number of pixels and the largest difference, and does not blame only Math.random: it names the canvas-from-setup cause and info.canvas', async () => {
    let n = 0;
    const comp = await build([{ type: 'canvas', name: 'leaky', draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(10 * n++, 0, 1, 1); } }]);
    const [problem] = canvasProblems(comp);
    expect(problem).toMatch(/differ/);
    expect(problem).toMatch(/up to \d+ of 255/);
    expect(problem).toMatch(/info\.canvas/);
  });

  it('a layer whose draw throws is not "deterministic": its row is not ok and the sentence says it drew a checkerboard', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'canvas', name: 'bad', draw: () => { throw new Error('boom'); } }]);
    const [row] = canvasReport(comp);
    expect(row!.ok).toBe(false);
    expect(row!.problem).toMatch(/"bad"/);
    expect(row!.problem).toMatch(/threw|checkerboard/);
  });
});
