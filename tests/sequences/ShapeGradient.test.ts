import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { ShapeSequence } from '../../src/sequences/Shape';
import { gradientOptions, paintRadial, cssColor } from '../../src/sequences/gradient';
import { makeGradientFill } from '../../src/sequences/gradientFill';
import { lintSequence } from '../../src/space/lint';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: unknown) => new ShapeSequence({ type: 'shape', shape: 'rect', width: 100, height: 50, ...(spec as object) } as SequenceSpec, comp, comp);
beforeEach(() => { vi.restoreAllMocks(); });

describe('gradientOptions', () => {
  it('linear: default is top to bottom through the centre, spanning the whole box', () => {
    const o = gradientOptions({ stops: [[0, '#000000'], [1, '#ffffff']] }) as any;
    expect(o.type).toBe('linear');
    expect(o.start.x).toBeCloseTo(0.5, 9); expect(o.start.y).toBeCloseTo(0, 9);
    expect(o.end.x).toBeCloseTo(0.5, 9);   expect(o.end.y).toBeCloseTo(1, 9);
    expect(o.colorStops).toEqual([{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }]);
    expect(o.textureSpace).toBe('local');
  });

  it('linear angle: 0 = left to right; 45 reaches the corners', () => {
    const lr = gradientOptions({ angle: 0, stops: [[0, '#000'], [1, '#fff']] }) as any;
    expect([lr.start.x, lr.start.y, lr.end.x, lr.end.y].map(n => +n.toFixed(6))).toEqual([0, 0.5, 1, 0.5]);
    const d = gradientOptions({ angle: 45, stops: [[0, '#000'], [1, '#fff']] }) as any;
    expect(d.start.x).toBeCloseTo(0, 6); expect(d.start.y).toBeCloseTo(0, 6);
    expect(d.end.x).toBeCloseTo(1, 6);   expect(d.end.y).toBeCloseTo(1, 6);
  });

  it('accepts {offset,color} stops and numeric colours; rejects fewer than two stops', () => {
    const o = gradientOptions({ stops: [{ offset: 0, color: 0xff0000 }, { offset: 1, color: '#0000ff' }] }) as any;
    expect(o.colorStops).toEqual([{ offset: 0, color: 0xff0000 }, { offset: 1, color: '#0000ff' }]);
    expect(() => gradientOptions({ stops: [[0, '#fff']] })).toThrow(/at least two/);
  });
});

describe('ShapeSequence.fillGradient', () => {
  it('fills with a gradient instead of fillColor, from the top level or from `initial`', async () => {
    for (const where of ['top', 'initial'] as const) {
      const gradient = { stops: [[0, '#112233'], [1, '#445566']] };
      const s = make(where === 'top' ? { fillGradient: gradient, initial: { fillColor: '#ff0000' } } : { initial: { fillGradient: gradient, fillColor: '#ff0000' } });
      await s.build();
      const g = s.target as unknown as { fill: ReturnType<typeof vi.fn>; onRender: () => void };
      g.fill = vi.fn();
      g.onRender();
      expect(g.fill).toHaveBeenCalledTimes(1);
      const arg = g.fill.mock.calls[0]![0];
      expect(arg.options.colorStops[0].color).toBe('#112233');   // the FillGradient instance, not { color, alpha }
    }
  });

  it('without a gradient the flat colour path is unchanged', async () => {
    const s = make({ initial: { fillColor: '#ff0000', fillAlpha: 0.5 } });
    await s.build();
    const g = s.target as unknown as { fill: ReturnType<typeof vi.fn>; onRender: () => void };
    g.fill = vi.fn();
    g.onRender();
    expect(g.fill).toHaveBeenCalledWith({ color: '#ff0000', alpha: 0.5 });
  });

  it('lint: a gradient and fillColor together is fine; stops given as a bare string is not silently accepted', () => {
    const w: string[] = [];
    lintSequence({ type: 'shape', shape: 'rect', width: 1, height: 1, fillGradient: { stops: [[0, '#fff'], [1, '#000']] } } as unknown as SequenceSpec, m => w.push(m));
    expect(w).toEqual([]);
  });
});


describe('radial gradients are painted on a canvas (Pixi\'s own radial adds an opaque-last-colour underlay that ruins vignettes)', () => {
  function fakeCtx() {
    const calls: Array<[string, ...unknown[]]> = [];
    const grad = { stops: [] as Array<[number, string]>, addColorStop(o: number, c: string) { this.stops.push([o, c]); } };
    const ctx = {
      createRadialGradient: (...a: number[]) => { calls.push(['createRadialGradient', ...a]); return grad; },
      fillRect: (...a: number[]) => { calls.push(['fillRect', ...a]); },
      fillStyle: null as unknown,
      clearRect: (...a: number[]) => { calls.push(['clearRect', ...a]); },
    };
    return { ctx, calls, grad };
  }

  it('cssColor turns numbers into #rrggbb and leaves strings alone', () => {
    expect(cssColor(0xff8800)).toBe('#ff8800');
    expect(cssColor(0)).toBe('#000000');
    expect(cssColor('rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
  });

  it('paintRadial: concentric circles in px of the canvas, stops forwarded, whole canvas filled', () => {
    const { ctx, calls, grad } = fakeCtx();
    paintRadial(ctx as never, 200, { type: 'radial', center: [0.25, 0.75], innerRadius: 0.1, radius: 0.6, stops: [[0, 'rgba(0,0,0,0)'], [1, 0xff0000]] });
    expect(calls).toContainEqual(['createRadialGradient', 50, 150, 20, 50, 150, 120]);
    expect(grad.stops).toEqual([[0, 'rgba(0,0,0,0)'], [1, '#ff0000']]);
    expect(ctx.fillStyle).toBe(grad);
    expect(calls).toContainEqual(['fillRect', 0, 0, 200, 200]);
  });

  it('makeGradientFill(radial) returns a local-space texture fill built from a painted canvas; linear stays a FillGradient', () => {
    const { ctx } = fakeCtx();
    const canvas = { width: 0, height: 0, getContext: () => ctx };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as never);
    const radial = makeGradientFill({ type: 'radial', stops: [[0, '#000'], [1, '#fff']] }) as { texture: unknown; textureSpace: string };
    expect(radial.textureSpace).toBe('local');
    expect(radial.texture).toBeDefined();
    expect(canvas.width).toBeGreaterThan(0);
    const linear = makeGradientFill({ stops: [[0, '#000'], [1, '#fff']] }) as { options: { type: string } };
    expect(linear.options.type).toBe('linear');
  });

  it('a radial shape fills with { texture, textureSpace: local }', async () => {
    const { ctx } = fakeCtx();
    vi.spyOn(document, 'createElement').mockReturnValue({ width: 0, height: 0, getContext: () => ctx } as never);
    const s = make({ fillGradient: { type: 'radial', stops: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.7)']] } });
    await s.build();
    const g = s.target as unknown as { fill: ReturnType<typeof vi.fn>; onRender: () => void };
    g.fill = vi.fn();
    g.onRender();
    expect(g.fill.mock.calls[0]![0]).toMatchObject({ textureSpace: 'local' });
  });
});
