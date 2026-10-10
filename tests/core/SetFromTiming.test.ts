import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { TextSequence } from '../../src/sequences/Text';
import { ShapeSequence } from '../../src/sequences/Shape';
import { ImageSequence } from '../../src/sequences/Image';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const textOf = (s: TextSequence) => (s.target as unknown as { text: string }).text;
const alphaOf = (s: { target: unknown }) => (s.target as { alpha: number }).alpha;

async function boundText(spec: unknown) {
  const s = new TextSequence({ type: 'text', ...(spec as object) } as SequenceSpec, comp, comp);
  await s.build();
  const tl = createTimeline({ paused: true });
  s.bindTimeline(tl, 0);
  return { s, tl };
}
async function boundRect(spec: unknown) {
  const s = new ShapeSequence({ type: 'shape', shape: 'rect', width: 10, height: 10, ...(spec as object) } as SequenceSpec, comp, comp);
  await s.build();
  const tl = createTimeline({ paused: true });
  s.bindTimeline(tl, 0);
  return { s, tl };
}

describe('a `set` keyframe jumps at its own time, not before', () => {
  it('{value} counter: set at 1 s leaves initial.value untouched until then, in both directions', async () => {
    const { s, tl } = await boundText({ text: '{value}', duration: 6, initial: { value: 1 }, keyframes: [{ at: 1, set: { value: 7 } }] });
    expect(textOf(s)).toBe('1');
    tl.time(0.9); expect(textOf(s)).toBe('1');
    tl.time(1);   expect(textOf(s)).toBe('7');
    tl.time(0);   expect(textOf(s)).toBe('1');
  });

  it('text fill: set at 1 s is undone when seeking back before it', async () => {
    const { s, tl } = await boundText({ text: 'a', duration: 6, style: { fill: '#ff0000' }, keyframes: [{ at: 1, set: { fill: '#00ff00' } }] });
    const fillOf = () => (s.target as unknown as { style: { fill: unknown } }).style.fill;
    const start = fillOf();
    tl.time(2);   expect(fillOf()).not.toEqual(start);
    tl.time(0);   expect(fillOf()).toEqual(start);
  });

  it('plain prop: set alpha at 1 s', async () => {
    const { s, tl } = await boundRect({ duration: 6, initial: { alpha: 0 }, keyframes: [{ at: 1, set: { alpha: 1 } }] });
    expect(alphaOf(s)).toBe(0);
    tl.time(1);   expect(alphaOf(s)).toBe(1);
    tl.time(0);   expect(alphaOf(s)).toBe(0);
  });
});

describe('set on live shape style and on image tint is undone by a backward seek', () => {
  it('shape fillColor + width', async () => {
    const { s, tl } = await boundRect({ duration: 6, initial: { fillColor: '#ff0000', width: 10 }, keyframes: [{ at: 1, set: { fillColor: '#00ff00', width: 99 } }] });
    const st = () => (s as unknown as { _state: { fillColor: unknown; width: number } })._state;
    expect(st().width).toBe(10);
    tl.time(2);   expect(st().width).toBe(99); expect(st().fillColor).toBe('#00ff00');
    tl.time(0);   expect(st().width).toBe(10); expect(st().fillColor).toBe('#ff0000');
  });

  it('image tint', async () => {
    const s = new ImageSequence({ type: 'image', asset: 'x', duration: 6, colorSpace: 'oklab', initial: { tint: '#ff0000' }, keyframes: [{ at: 1, set: { tint: '#00ff00' } }] } as unknown as SequenceSpec, comp, comp);
    await s.build();
    const tl = createTimeline({ paused: true });
    s.bindTimeline(tl, 0);
    const tint = () => (s.target as unknown as { tint: unknown }).tint;
    const start = tint();
    tl.time(2);   expect(tint()).not.toEqual(start);
    tl.time(0);   expect(tint()).toEqual(start);
  });
});

describe('`from` keyframes hold their start value from the layer start (documented GSAP behaviour)', () => {
  it('a delayed fade-in needs no initial alpha: the from value shows until the tween starts', async () => {
    const { s, tl } = await boundRect({ duration: 6, keyframes: [{ at: 2, from: { alpha: 0.2 }, duration: 1 }] });
    expect(alphaOf(s)).toBe(0.2);
    tl.time(1.9); expect(alphaOf(s)).toBe(0.2);
    tl.time(3);   expect(alphaOf(s)).toBe(1);
    tl.time(0);   expect(alphaOf(s)).toBe(0.2);
  });
});

describe('shape geometry is brought up to date before the frame is culled', () => {
  it('syncFrame() redraws a shape from its tweened state (the culler measures the drawn geometry)', async () => {
    const { s, tl } = await boundRect({ duration: 6, initial: { width: 0, anchorX: 0 }, keyframes: [{ at: 1, to: { width: 300 }, duration: 1 }] });
    const g = s.target as unknown as { rect: (...a: number[]) => unknown };
    const widths: number[] = [];
    g.rect = (...a: number[]) => { widths.push(a[2]); return g; };
    tl.time(2);                                   // jump straight to the end of the tween
    (s as unknown as { syncFrame: () => void }).syncFrame();
    expect(widths.at(-1)).toBe(300);
  });

  it('a redraw done by syncFrame() is not repeated by the same frame\'s render', async () => {
    const { s, tl } = await boundRect({ duration: 6, initial: { width: 0, anchorX: 0 }, keyframes: [{ at: 1, to: { width: 300 }, duration: 1 }] });
    const g = s.target as unknown as { rect: (...a: number[]) => unknown; onRender: () => void };
    let draws = 0;
    g.rect = () => { draws++; return g; };
    tl.time(2);
    (s as unknown as { syncFrame: () => void }).syncFrame();
    g.onRender();
    expect(draws).toBe(1);
    g.onRender();                                 // a second render pass (no sync in between) still redraws
    expect(draws).toBe(2);
  });
});
