import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { TextSequence } from '../../src/sequences/Text';
import { ShapeSequence } from '../../src/sequences/Shape';
import { ImageSequence } from '../../src/sequences/Image';
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { setTimelineEngine } from '../../src/core/timelineEngine';
setTimelineEngine('gsap');   // these read GSAP's own tweens (getChildren): they are about the GSAP engine

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };

type Tl = ReturnType<typeof gsap.timeline>;
/** Start times (global timeline seconds) of every tween whose vars touch `prop` (or its pixi/live wrapper). */
function startsOf(tl: Tl, prop: string): number[] {
  return tl.getChildren(true, true, false)
    .filter((c: any) => c.vars && (prop in c.vars || (c.vars.pixi && prop in c.vars.pixi)))
    .map((c: any) => +c.startTime().toFixed(3))
    .sort((a: number, b: number) => a - b);
}
/** Start times of tweens that write into a plain state object property (fill / live shape colour). */
function startsOfState(tl: Tl, key: string): number[] {
  return tl.getChildren(true, true, false)
    .filter((c: any) => c.vars && (key in c.vars || (c.vars.p !== undefined)))
    .map((c: any) => +c.startTime().toFixed(3))
    .sort((a: number, b: number) => a - b);
}

describe('keyframe `at` is sequence-local (After Effects style)', () => {
  it('text at:2 — `at: 0` starts at global 2s, for plain props AND fill', async () => {
    const t = new TextSequence({
      type: 'text', text: 'a', at: 2, duration: 3,
      keyframes: [
        { at: 0, to: { alpha: 0.5 }, duration: 1 },
        { at: 0, to: { fill: '#ff0000' }, duration: 1 },
      ],
    } as unknown as SequenceSpec, shape, shape);
    await t.build();
    const tl = gsap.timeline({ paused: true });
    t.bindTimeline(tl, 0);
    expect(startsOf(tl, 'alpha')).toEqual([2]);
    expect(startsOfState(tl, 'fill').filter(s => s !== 2 && s !== 5)).toEqual([]);   // only the renderable toggles (2, 5) and the fill tween (2)
    expect(startsOfState(tl, 'fill')).toContain(2);
  });

  it('negative `at` is measured back from the SEQUENCE end (at + duration + kf.at)', async () => {
    const t = new TextSequence({
      type: 'text', text: 'a', at: 2, duration: 3,
      keyframes: [{ at: -1, to: { y: 5 }, duration: 1 }],
    } as unknown as SequenceSpec, shape, shape);
    await t.build();
    const tl = gsap.timeline({ paused: true });
    t.bindTimeline(tl, 0);
    expect(startsOf(tl, 'y')).toEqual([4]);
  });

  it('shape at:2 — standard props and live (colour) props both start at 2s', async () => {
    const t = new ShapeSequence({
      type: 'shape', shape: 'rect', width: 10, height: 10, at: 2, duration: 3,
      keyframes: [
        { at: 0.5, to: { alpha: 0.5 }, duration: 1 },
        { at: 0.5, to: { fillColor: '#ff0000' }, duration: 1 },
      ],
    } as unknown as SequenceSpec, shape, shape);
    await t.build();
    const tl = gsap.timeline({ paused: true });
    t.bindTimeline(tl, 0);
    expect(startsOf(tl, 'alpha')).toContain(2.5);
    const all = tl.getChildren(true, true, false).map((c: any) => +c.startTime().toFixed(3));
    expect(all.filter(s => s === 2.5).length).toBeGreaterThanOrEqual(2);   // alpha + the live colour tween
    expect(all).not.toContain(0.5);
  });

  it('image with colorSpace: the perceptual tint tween is sequence-local too', async () => {
    const t = new ImageSequence({
      type: 'image', asset: 'x', at: 2, duration: 3, colorSpace: 'oklch',
      initial: { tint: '#ff0000' },
      keyframes: [{ at: 0.5, to: { tint: '#00ff00' }, duration: 1 }],
    } as unknown as SequenceSpec, shape, shape);
    await t.build();
    const tl = gsap.timeline({ paused: true });
    t.bindTimeline(tl, 0);
    const all = tl.getChildren(true, true, false).map((c: any) => +c.startTime().toFixed(3));
    expect(all).toContain(2.5);
    expect(all).not.toContain(0.5);
  });

  it('nested: composition at:3 containing a child at:1 with `at: 0` -> global 4s', async () => {
    const spec = {
      type: 'composition', at: 3, duration: 6, width: 640, height: 360,
      sequences: [{ type: 'text', text: 'a', at: 1, duration: 2, keyframes: [{ at: 0, to: { alpha: 0.5 }, duration: 1 }] }],
    } as unknown as SequenceSpec;
    const comp = new CompositionSequence(spec as never, shape, shape);
    await comp.build();
    const tl = gsap.timeline({ paused: true });
    comp.bindTimeline(tl, 0);
    expect(startsOf(tl, 'alpha')).toEqual([4]);
  });

  it('a keyframe on the sequence itself with at:0 still starts at the sequence start (at:0 sequence unchanged)', async () => {
    const t = new TextSequence({
      type: 'text', text: 'a', at: 0, duration: 3,
      keyframes: [{ at: 0, to: { alpha: 0.5 }, duration: 1 }],
    } as unknown as SequenceSpec, shape, shape);
    await t.build();
    const tl = gsap.timeline({ paused: true });
    t.bindTimeline(tl, 0);
    expect(startsOf(tl, 'alpha')).toEqual([0]);
  });
});
