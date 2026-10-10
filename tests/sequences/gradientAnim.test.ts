import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { gsap } from 'gsap';
import { ShapeSequence } from '../../src/sequences/Shape';
import { TextSequence } from '../../src/sequences/Text';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { gradStateFrom, mergeGrad, tweenGradient, bindGradientKeyframes, hasGradientKeys, validateGradientKeyframes } from '../../src/sequences/gradientAnim';
import { createTimeline } from '../../src/core/timelineEngine';

const two = { angle: 0, stops: [[0, '#ff0000'], [1, '#0000ff']] as Array<[number, string]> };
const base = () => gradStateFrom(two);
const warns = (spec: object): string[] => { const out: string[] = []; validateGradientKeyframes(spec as never, 'layer "g"', (m: string) => out.push(m)); return out; };
beforeEach(() => { vi.restoreAllMocks(); });

describe('gradient state', () => {
  it('gradStateFrom fills the defaults and turns numeric colours into CSS strings', () => {
    const s = gradStateFrom({ stops: [[0, 0xff0000], { offset: 1, color: '#00f' }] });
    expect(s).toMatchObject({ type: 'linear', angle: 90, center: [0.5, 0.5], innerRadius: 0, radius: 0.5 });
    expect(s.stops).toEqual([{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#00f' }]);
  });
  it('mergeGrad replaces only the keys of the patch, never mutates the base, and ignores what cannot be tweened', () => {
    const b = base();
    const m = mergeGrad(b, { angle: 200, radius: 0.9 });
    expect(m).toMatchObject({ angle: 200, radius: 0.9, innerRadius: 0 });
    expect(m.stops).toEqual(b.stops);
    expect(b.angle).toBe(0);
    expect(mergeGrad(b, { stops: [[0, '#fff'], [0.5, '#888'], [1, '#000']] }).stops).toEqual(b.stops);   // a different count is ignored (validated at build)
    expect(mergeGrad(b, { type: 'radial' }).type).toBe('linear');
    expect(mergeGrad(b, 'red' as never)).toEqual(b);
  });
});

describe('tweenGradient', () => {
  const run = (colorSpace: 'rgb' | 'oklch', to: object) => {
    const holder = { grad: base() };
    const tl = createTimeline({ paused: true });
    let changes = 0;
    tweenGradient(tl, holder, undefined, to, 2, 'none', 0, colorSpace, () => { changes++; });
    return { holder, tl, changes: () => changes };
  };
  it('numbers move linearly and every stop colour moves through the colour space', () => {
    const { holder, tl } = run('rgb', { angle: 360, stops: [[0, '#00ff00'], [1, '#ffff00']] });
    tl.time(1);
    expect(holder.grad.angle).toBeCloseTo(180, 6);
    expect(holder.grad.stops[0]!.color).toMatch(/^rgb/);
    tl.time(2);
    expect(holder.grad.angle).toBeCloseTo(360, 6);
  });
  it('seeking forwards and back gives the same state', () => {
    const { holder, tl } = run('oklch', { angle: 90, center: [0.2, 0.8] });
    // (at exactly t = 0 the colours read back as 'rgba(…)' instead of the '#hex' they were written in: the same colour, so the check starts after it)
    const at = (t: number) => { tl.time(t); return JSON.stringify({ ...holder.grad, stops: t === 0 ? 'start' : holder.grad.stops }); };
    const fwd = [0, 0.5, 1, 1.5, 2].map(at);
    const back = [2, 1.5, 1, 0.5, 0].map(at).reverse();
    expect(back).toEqual(fwd);
  });
  it('the colour space matters: the middle of red to blue is not the same in rgb and oklch', () => {
    const mid = (space: 'rgb' | 'oklch') => { const r = run(space, { stops: [[0, '#00ff00'], [1, '#ff00ff']] }); r.tl.time(1); return r.holder.grad.stops[0]!.color; };
    expect(mid('rgb')).not.toBe(mid('oklch'));
  });
  it('a numeric colour tweens like its CSS string (rgb)', () => {
    const num = { grad: gradStateFrom({ angle: 0, stops: [[0, 0xff0000], [1, 0x0000ff]] }) };
    const css = { grad: base() };
    for (const h of [num, css]) {
      const tl = createTimeline({ paused: true });
      tweenGradient(tl, h, undefined, { stops: [[0, '#00ff00'], [1, '#ffff00']] }, 2, 'none', 0, 'rgb', () => {});
      tl.time(1);
    }
    expect(num.grad.stops).toEqual(css.grad.stops);
  });
});

describe('bindGradientKeyframes', () => {
  it('a set jumps at its time and is undone by a seek back; a keyframe after it starts from the live value', () => {
    const holder = { grad: base() };
    const tl = createTimeline({ paused: true });
    bindGradientKeyframes(tl, holder, [
      { at: 1, set: { fillGradient: { angle: 90 } } },
      { at: 2, to: { fillGradient: { angle: 180 } }, duration: 2 },
    ] as never, 10, 0, 'rgb', () => {});
    tl.time(0.5); expect(holder.grad.angle).toBe(0);
    tl.time(1.5); expect(holder.grad.angle).toBe(90);
    tl.time(3);   expect(holder.grad.angle).toBeCloseTo(135, 6);       // 90 → 180, half way
    tl.time(0.5); expect(holder.grad.angle).toBe(0);                    // undone
  });
  it('a keyframe with only `from` runs from that gradient to the one the layer has (like every other property), then holds', () => {
    const holder = { grad: gradStateFrom({ angle: 90, stops: [[0, '#ff0000'], [1, '#0000ff']] }) };
    const tl = createTimeline({ paused: true });
    bindGradientKeyframes(tl, holder, [{ at: 0, duration: 2, from: { fillGradient: { angle: 0 } } }] as never, 10, 0, 'rgb', () => {});
    const at = (t: number) => { tl.time(t); return holder.grad.angle; };
    expect(at(0.001)).toBeCloseTo(0, 1);
    expect(at(1)).toBeCloseTo(45, 6);
    expect(at(2)).toBeCloseTo(90, 6);
    expect(at(3)).toBeCloseTo(90, 6);
    expect(at(0.5)).toBeCloseTo(22.5, 6);                          // and back
    expect(at(1)).toBeCloseTo(45, 6);                              // and forward again: not frozen on the `from` state
  });
  it('hasGradientKeys sees set, to and from', () => {
    expect(hasGradientKeys([{ at: 0, to: { fillGradient: { angle: 1 } } }] as never)).toBe(true);
    expect(hasGradientKeys([{ at: 0, from: { fillGradient: { angle: 1 } } }] as never)).toBe(true);
    expect(hasGradientKeys([{ at: 0, set: { fillGradient: { angle: 1 } } }] as never)).toBe(true);
    expect(hasGradientKeys([{ at: 0, to: { x: 1 } }] as never)).toBe(false);
    expect(hasGradientKeys(undefined)).toBe(false);
  });
});

describe('validateGradientKeyframes: said once, at build, with what to write', () => {
  const kf = (bag: object, key = 'to') => ({ fillGradient: two, keyframes: [{ at: 0, duration: 1, [key]: bag }] });
  it('a good spec is quiet', () => {
    expect(warns(kf({ fillGradient: { angle: 90, stops: [[0, '#fff'], [1, '#000']] } }))).toEqual([]);
    expect(warns({ keyframes: [{ at: 0, to: { x: 5 } }] })).toEqual([]);                 // no gradient animation at all
    expect(warns({ initial: { fillGradient: two }, keyframes: [{ at: 0, to: { fillGradient: { angle: 9 } } }] })).toEqual([]);   // the start may be in initial
  });
  it('a different number of stops', () => {
    expect(warns(kf({ fillGradient: { stops: [[0, '#fff'], [0.5, '#888'], [1, '#000']] } }))[0]).toMatch(/same number of stops as the gradient has \(2, got 3\)/);
  });
  it('a mistyped key says which one is meant', () => {
    expect(warns(kf({ fillGradient: { angel: 5 } }))[0]).toMatch(/fillGradient\.angel is not a gradient property.*did you mean "angle"/s);
  });
  it('a type change, and a gradient that is not an object', () => {
    expect(warns(kf({ fillGradient: { type: 'radial' } }))[0]).toMatch(/type cannot change over time/);
    expect(warns(kf({ fillGradient: 'red' }))[0]).toMatch(/must be an object like \{ angle: 200, stops/);
  });
  it('no starting gradient', () => {
    expect(warns({ keyframes: [{ at: 0, to: { fillGradient: { angle: 9 } } }] })[0]).toMatch(/give it a fillGradient first/);
  });
  it('the names an AI guesses (a dotted path, a flat property) say what to write', () => {
    expect(warns(kf({ 'fillGradient.angle': 90 }))[0]).toMatch(/"fillGradient\.angle".*write fillGradient: \{ angle \}/s);
    expect(warns(kf({ gradientAngle: 90 }))[0]).toMatch(/"gradientAngle".*write fillGradient: \{ angle \}/s);
  });
  it('a text layer has linear gradients only: a radial type, centre or radius is said once instead of being dropped in silence', () => {
    const out: string[] = [];
    validateGradientKeyframes({ fillGradient: { type: 'radial', center: [0.2, 0.2], radius: 0.3, stops: [[0, '#fff'], [1, '#000']] } } as never, 'layer "t"', (m: string) => out.push(m), 'text');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/layer "t".*a text gradient is linear.*type, center, innerRadius and radius are ignored.*shape/s);
    const kf: string[] = [];
    validateGradientKeyframes({ fillGradient: two, keyframes: [{ at: 0, duration: 1, to: { fillGradient: { center: [0.8, 0.8] } } }] } as never, 'layer "t"', (m: string) => kf.push(m), 'text');
    expect(kf.join('\n')).toMatch(/a text gradient is linear/);
    const shape: string[] = [];
    validateGradientKeyframes({ fillGradient: { type: 'radial', stops: [[0, '#fff'], [1, '#000']] } } as never, 'layer "s"', (m: string) => shape.push(m), 'shape');
    expect(shape).toEqual([]);                                       // a shape has them all
  });
  it('says each thing once per call even if two keyframes make the same mistake', () => {
    const out = warns({ fillGradient: two, keyframes: [{ at: 0, to: { fillGradient: { angel: 1 } } }, { at: 1, to: { fillGradient: { angel: 2 } } }] });
    expect(out.filter((m) => /angel/.test(m))).toHaveLength(1);
  });
});

describe('the layers that animate a gradient', () => {
  const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
  const fakeCanvas = () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    clearRect() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillStyle: null,
  })) as never);
  const shape = (extra: object) => new ShapeSequence({ type: 'shape', shape: 'rect', width: 100, height: 50, fillGradient: two, ...extra } as unknown as SequenceSpec, comp, comp);
  const painters = (): number => (globalThis as { __gradientPainters?: number }).__gradientPainters ?? 0;

  it('a shape with gradient keyframes paints a texture; destroying it gives the texture back; a shape without keyframes makes no painter', async () => {
    fakeCanvas();
    const before = painters();
    const animated = shape({ keyframes: [{ at: 0, to: { fillGradient: { angle: 180 } }, duration: 1 }] });
    await animated.build();
    expect(painters()).toBe(before + 1);
    const g = animated.target as unknown as { fill: ReturnType<typeof vi.fn>; onRender: () => void };
    g.fill = vi.fn(); g.onRender();
    expect(g.fill.mock.calls[0]![0].textureSpace).toBe('local');                    // the painted texture, not a FillGradient
    animated.destroy();
    expect(painters()).toBe(before);
    const still = shape({});
    await still.build();
    expect(painters()).toBe(before);
    still.destroy();
  });

  it('a mistake is said once, when the layer is built', async () => {
    fakeCanvas();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = shape({ name: 'bg', keyframes: [{ at: 0, to: { fillGradient: { angel: 5 } }, duration: 1 }] });
    await s.build();
    const tl = createTimeline({ paused: true });
    s.bindTimeline(tl as never, 0);
    for (const t of [0, 0.5, 1, 0.2, 0.8]) tl.time(t);
    const mine = warn.mock.calls.map(c => String(c[0])).filter(m => /angel/.test(m));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(/layer "bg".*did you mean "angle"/s);
    s.destroy();
  });

  it('a text layer takes a fillGradient (top level or initial) as its fill, and keeps it after a keyframe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const where of ['top', 'initial'] as const) {
      const t = new TextSequence({ type: 'text', text: 'hi', ...(where === 'top' ? { fillGradient: two } : { initial: { fillGradient: two } }), keyframes: [{ at: 0, to: { fillGradient: { angle: 90 } }, duration: 1 }] } as unknown as SequenceSpec, comp, comp);
      await t.build();
      const style = (t.target as unknown as { style: { fill: { options: { colorStops: Array<{ color: string }> } } } }).style;
      expect(style.fill.options.colorStops.map(c => c.color)).toEqual(['#ff0000', '#0000ff']);
      const tl = createTimeline({ paused: true });
      t.bindTimeline(tl as never, 0);
      tl.time(0.5);
      expect((t.target as unknown as { style: { fill: { options: Record<string, unknown> } } }).style.fill.options.start).toBeDefined();
      t.destroy();
    }
    expect(warn.mock.calls.filter(c => /fillGradient|gradient/i.test(String(c[0])))).toEqual([]);
  });
});
