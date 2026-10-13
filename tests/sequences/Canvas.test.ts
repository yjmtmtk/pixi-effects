import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { createTimeline } from '../../src/core/timelineEngine';
import { installCanvas } from '../support/fakeGl';
import type { CompositionShape, SequenceSpec, CanvasInfo } from '../../src/types';

const shape: CompositionShape = { width: 320, height: 180, duration: 4, frameRate: 30 };

/** A 2D context that records every call and every property that is set. */
function recording2d() {
  const calls: Array<[string, ...unknown[]]> = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({}, {
    get(_t, key: string) { return key in props ? props[key] : (...a: unknown[]) => { calls.push([key, ...a]); }; },
    set(_t, key: string, v) { props[key] = v; calls.push([`set ${key}`, v]); return true; },
  });
  return { ctx, calls, props };
}

async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 320, height: 180, duration: 4, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  const tl = createTimeline({ paused: true });
  comp.bindTimeline(tl);
  return { comp, tl };
}
type Layer = { spec: { name?: string }; awaitFrameAt(t: number): Promise<void>; destroy(): void; target: { width: number; height: number } };
const layer = (comp: CompositionSequence, name: string) => (comp as unknown as { _children: Layer[] })._children.find(c => c.spec.name === name)!;
const cv = (o: Record<string, unknown> = {}) => ({ type: 'canvas', name: 'c', draw: vi.fn(), ...o });
let rec: ReturnType<typeof recording2d>;
beforeEach(() => { vi.restoreAllMocks(); rec = recording2d(); installCanvas(null, rec as never); });

describe('the canvas layer: what draw is given', () => {
  it('is called once at build for the first frame, and per frame with the layer\'s own time and a full info', async () => {
    const draw = vi.fn();
    const { comp } = await build([cv({ draw, params: { amount: 0.5 } })]);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]![1]).toBe(0);
    draw.mockClear();
    await layer(comp, 'c').awaitFrameAt(1.5);
    const [ctx, t, info] = draw.mock.calls[0]! as [unknown, number, CanvasInfo];
    expect(ctx).toBe(rec.ctx);
    expect(t).toBe(1.5);
    expect(info).toMatchObject({ frame: 45, duration: 4, progress: 1.5 / 4, width: 320, height: 180, resolution: 1, frameRate: 30, params: { amount: 0.5 } });
    expect(info.state).toBeUndefined();
    expect(typeof info.random()).toBe('number');
  });

  it('info.time is the movie\'s time and info.start is where the layer starts: time = start + t, whatever the layer\'s at (setup sees them too)', async () => {
    const draw = vi.fn(), seen: CanvasInfo[] = [];
    const { comp } = await build([cv({ at: 1.5, duration: 2, draw, setup: (i: CanvasInfo) => { seen.push(i); } })]);
    expect(seen[0]).toMatchObject({ start: 1.5, time: 1.5 });
    draw.mockClear();
    await layer(comp, 'c').awaitFrameAt(0.5);
    const info = draw.mock.calls[0]![2] as CanvasInfo;
    expect(info.start).toBe(1.5);
    expect(info.time).toBe(2);
  });

  it('info.start counts the compositions around the layer: a layer at 0.5 inside a group at 2 starts at 2.5 on the movie\'s clock', async () => {
    const draw = vi.fn();
    const { comp } = await build([{ type: 'composition', name: 'g', at: 2, duration: 2, width: 200, height: 100, sequences: [cv({ at: 0.5, duration: 1, draw })] }]);
    draw.mockClear();
    const g = (comp as unknown as { _children: Array<{ spec: { name?: string }; _children: Layer[] }> })._children.find(c => c.spec.name === 'g')!;
    await g._children[0]!.awaitFrameAt(0.25);
    const info = draw.mock.calls[0]![2] as CanvasInfo;
    expect(info.start).toBe(2.5);
    expect(info.time).toBe(2.75);
  });

  it('info.canvas(w, h) gives an offscreen canvas of that size whose 2D context is made for reading (willReadFrequently: the CPU rasteriser, which draws the same picture the first time and every time after)', async () => {
    const asked: unknown[][] = [];
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) { asked.push([this.width, this.height, type, ...rest]); return rec.ctx as never; } as never);
    let made: HTMLCanvasElement | undefined;
    await build([cv({ draw: vi.fn(), setup: (i: CanvasInfo) => { made = i.canvas(64, 32); } })]);
    expect(made).toBeInstanceOf(HTMLCanvasElement);
    expect([made!.width, made!.height]).toEqual([64, 32]);
    expect(asked.some(a => a[0] === 64 && a[1] === 32 && a[2] === '2d' && (a[3] as { willReadFrequently?: boolean })?.willReadFrequently === true)).toBe(true);
    spy.mockRestore();
  });

  it('clears the canvas, resets the transform and saves / restores around every call (nothing a frame sets survives into the next)', async () => {
    const { comp } = await build([cv({ draw: () => { rec.calls.push(['draw']); } })]);
    rec.calls.length = 0;
    await layer(comp, 'c').awaitFrameAt(1);
    const names = rec.calls.map(c => c[0]);
    expect(names.indexOf('clearRect')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('clearRect')).toBeLessThan(names.indexOf('draw'));
    expect(names.indexOf('save')).toBeLessThan(names.indexOf('draw'));
    expect(names.indexOf('draw')).toBeLessThan(names.lastIndexOf('restore'));
  });

  it('runs setup once at build (it may be async); its result is info.state in every call', async () => {
    const setup = vi.fn(async () => ({ table: [1, 2, 3] }));
    const draw = vi.fn();
    const { comp } = await build([cv({ setup, draw })]);
    expect(setup).toHaveBeenCalledTimes(1);
    await layer(comp, 'c').awaitFrameAt(2);
    expect((draw.mock.calls.at(-1)![2] as CanvasInfo).state).toEqual({ table: [1, 2, 3] });
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('draws only when the time or the params changed: the same frame twice is one call', async () => {
    const draw = vi.fn();
    const { comp } = await build([cv({ draw })]);
    draw.mockClear();
    const l = layer(comp, 'c');
    await l.awaitFrameAt(1); await l.awaitFrameAt(1);
    expect(draw).toHaveBeenCalledTimes(1);
    await l.awaitFrameAt(1.5);
    expect(draw).toHaveBeenCalledTimes(2);
  });
});

describe('the canvas layer: params and random', () => {
  it('params are animated by keyframes as params.<name> and arrive in info.params', async () => {
    const draw = vi.fn();
    const { comp, tl } = await build([cv({ draw, params: { amount: 0 }, keyframes: [{ at: 0, to: { 'params.amount': 10 }, duration: 2, ease: 'none' }] })]);
    tl.time(1);
    await layer(comp, 'c').awaitFrameAt(1);
    expect((draw.mock.calls.at(-1)![2] as CanvasInfo).params.amount).toBeCloseTo(5, 6);
  });

  it('a params keyframe that names nothing says so, with the closest name, once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([cv({ params: { amount: 0 }, keyframes: [{ at: 0, to: { 'params.amout': 1 }, duration: 1 }] })]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => /params\.amout/.test(m));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/did you mean "amount"/);
  });

  it('random() is seeded and starts again at every call: the same frame always gets the same numbers, another seed other ones', async () => {
    const seen: number[][] = [];
    const draw = (_c: unknown, _t: number, info: CanvasInfo) => { seen.push([info.random(), info.random(), info.random()]); };
    const a = await build([cv({ draw, seed: 7 })]);
    await layer(a.comp, 'c').awaitFrameAt(1);
    await layer(a.comp, 'c').awaitFrameAt(2);
    expect(seen[1]).toEqual(seen[2]);                                   // two different frames: the same sequence (it restarts)
    const b = await build([cv({ draw, seed: 8 })]);
    expect(seen.at(-1)).not.toEqual(seen[0]);
    expect(b.comp).toBeTruthy();
    expect(seen[0]!.every(v => v >= 0 && v < 1)).toBe(true);
  });

  it('params that are not numbers are said and dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn();
    await build([cv({ draw, params: { a: 1, b: 'x', c: NaN } })]);
    expect(String(warn.mock.calls.find(c => /params/.test(String(c[0])))?.[0])).toMatch(/"b".*"c"|"c".*"b"/);
    expect((draw.mock.calls[0]![2] as CanvasInfo).params).toEqual({ a: 1 });
  });
});

describe('the canvas layer: mistakes', () => {
  it('no draw function: one warning naming the layer, and a loud checkerboard instead of nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'canvas', name: 'c' }]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => /draw/.test(m));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('"c"');
    expect(rec.calls.some(c => c[0] === 'fillRect')).toBe(true);
  });

  it('draw that throws is said once with its message, the frame shows the checkerboard, and the next frame is tried again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn(() => { throw new Error('boom'); });
    const { comp } = await build([cv({ draw })]);
    rec.calls.length = 0;
    await layer(comp, 'c').awaitFrameAt(1);
    await layer(comp, 'c').awaitFrameAt(2);
    expect(draw.mock.calls.length).toBeGreaterThanOrEqual(3);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => /boom/.test(m));
    expect(said).toHaveLength(1);
    expect(rec.calls.some(c => c[0] === 'fillRect')).toBe(true);
  });

  it('setup that throws is said, and the layer shows the checkerboard', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn();
    await build([cv({ draw, setup: () => { throw new Error('no table'); } })]);
    expect(warn.mock.calls.some(c => /no table/.test(String(c[0])))).toBe(true);
    expect(draw).not.toHaveBeenCalled();
    expect(rec.calls.some(c => c[0] === 'fillRect')).toBe(true);
  });

  it('draw that calls Math.random, Date.now, performance.now or new Date is warned at build, once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([cv({ name: 'a', draw: () => { void Math.random(); } }), cv({ name: 'b', draw: () => { void Date.now(); } }), cv({ name: 'ok', draw: () => {} })]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => /not deterministic|Math\.random|Date\.now/.test(m));
    expect(said).toHaveLength(2);
    expect(said.some(m => m.includes('"a"') && /Math\.random/.test(m))).toBe(true);
    expect(said.some(m => m.includes('"b"') && /Date\.now/.test(m))).toBe(true);
  });
});

describe('the canvas layer: size', () => {
  it('width and height may be expressions and default to the composition\'s size; the sprite is that size', async () => {
    const { comp } = await build([cv({ name: 'a', width: 'GW / 2', height: 90 }), cv({ name: 'b' })]);
    expect([layer(comp, 'a').target.width, layer(comp, 'a').target.height]).toEqual([160, 90]);
    expect([layer(comp, 'b').target.width, layer(comp, 'b').target.height]).toEqual([320, 180]);
  });

  it('a size over 8192, or one that is zero or not a number, is said and fixed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { comp } = await build([cv({ name: 'big', width: 20000 }), cv({ name: 'zero', height: 0 })]);
    expect(layer(comp, 'big').target.width).toBe(8192);
    expect(layer(comp, 'zero').target.height).toBe(180);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => /width|height/.test(m)).length).toBeGreaterThanOrEqual(2);
  });

  it('resolution scales the canvas and the context, and info.resolution says so; out of 0.25 to 4 is said and clamped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn();
    await build([cv({ draw, resolution: 2 })]);
    expect(rec.calls.some(c => c[0] === 'scale' && c[1] === 2 && c[2] === 2)).toBe(true);
    expect((draw.mock.calls[0]![2] as CanvasInfo).resolution).toBe(2);
    await build([cv({ name: 'x', resolution: 9 })]);
    expect(warn.mock.calls.some(c => /resolution/.test(String(c[0])))).toBe(true);
  });

  it('smoothing: false turns image smoothing off for the draw AND draws the picture with hard pixels when it is scaled up (pixel art); the default stays smooth', async () => {
    const { comp } = await build([cv({ name: 'hard', smoothing: false }), cv({ name: 'soft' })]);
    expect(rec.calls.some(c => c[0] === 'set imageSmoothingEnabled' && c[1] === false)).toBe(true);
    const mode = (name: string) => ((layer(comp, name).target as unknown as { texture: { source: { scaleMode?: string } } }).texture.source.scaleMode);
    expect(mode('hard')).toBe('nearest');
    expect(mode('soft')).not.toBe('nearest');
  });
});

describe('the canvas layer: is the same frame the same picture', () => {
  /** A context whose "pixels" are the arguments of the last fillRect, so two draws can be compared. */
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
  type Checked = Layer & { checkDeterminism(times: number[]): { differs: Array<{ t: number; pixels: number; maxDiff: number }>; drawMs: number } };

  it('checkDeterminism draws each time twice and lists the times where the two pictures differ', async () => {
    installCanvas(null, pixelCtx() as never);
    let counter = 0;
    const { comp } = await build([
      cv({ name: 'pure', draw: (ctx: CanvasRenderingContext2D, t: number) => { ctx.fillRect(Math.round(t * 10), 0, 1, 1); } }),
      cv({ name: 'leaky', draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(counter++, 0, 1, 1); } }),
    ]);
    const pure = (layer(comp, 'pure') as Checked).checkDeterminism([0.5, 1, 2]);
    expect(pure.differs).toEqual([]);
    expect(pure.drawMs).toBeGreaterThanOrEqual(0);
    expect((layer(comp, 'leaky') as Checked).checkDeterminism([0.5, 1, 2]).differs.map(d => d.t)).toEqual([0.5, 1, 2]);
  });

  it('says how much differs: the number of differing channel values and the largest difference', async () => {
    installCanvas(null, pixelCtx() as never);
    let n = 0;
    const { comp } = await build([cv({ name: 'leaky', draw: (ctx: CanvasRenderingContext2D) => { ctx.fillRect(10 * n++, 0, 1, 1); } })]);
    const d = (layer(comp, 'leaky') as Checked).checkDeterminism([1]).differs[0]!;
    expect(d.t).toBe(1);
    expect(d.pixels).toBeGreaterThan(0);
    expect(d.maxDiff).toBeGreaterThan(0);
    expect(d.maxDiff).toBeLessThanOrEqual(255);
  });

  it('a first draw that differs from every later one (a browser drawing a canvas from setup differently the first time) is not held against the layer: one draw is thrown away before the pictures are compared', async () => {
    installCanvas(null, pixelCtx() as never);
    const seen = new Set<number>();
    const { comp } = await build([cv({ name: 'warm', draw: (ctx: CanvasRenderingContext2D, t: number) => { ctx.fillRect(seen.has(t) ? 5 : 99, 0, 1, 1); seen.add(t); } })]);
    seen.clear();
    expect((layer(comp, 'warm') as Checked).checkDeterminism([0.5, 1]).differs).toEqual([]);
  });

  it('a layer that failed (no draw) has nothing to check', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installCanvas(null, pixelCtx() as never);
    const { comp } = await build([{ type: 'canvas', name: 'c' }]);
    expect((layer(comp, 'c') as Checked).checkDeterminism([1]).differs).toEqual([]);
  });

  it('after the check the picture is the one the movie had (the next real draw is not skipped)', async () => {
    installCanvas(null, pixelCtx() as never);
    const draw = vi.fn();
    const { comp } = await build([cv({ draw })]);
    (layer(comp, 'c') as Checked).checkDeterminism([1]);
    draw.mockClear();
    await layer(comp, 'c').awaitFrameAt(1);
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe('the canvas layer: limits and a draw that does not balance its own save()', () => {
  it('a canvas that would be larger than 8192 pixels (size x resolution) is made smaller and said, and info.resolution tells the truth', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn();
    const { comp } = await build([cv({ draw, width: 4000, height: 100, resolution: 4 })]);
    expect((draw.mock.calls[0]![2] as CanvasInfo).resolution).toBeCloseTo(8192 / 4000, 6);
    expect(warn.mock.calls.some(c => /8192/.test(String(c[0])) && /resolution/.test(String(c[0])))).toBe(true);
    expect(layer(comp, 'c').target.width).toBe(4000);                 // the layer is still 4000 px wide on the stage
  });

  it('a browser that gives no 2D context is said once (the layer would be blank without a word)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    const w2 = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([cv()]);
    expect(w2.mock.calls.some(c => /2D context/.test(String(c[0])))).toBe(true);
    expect(warn).toBeDefined();
  });
});

