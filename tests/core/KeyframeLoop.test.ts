import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { applyKeyframes, loopVars } from '../../src/core/Timeline';
import { ShapeSequence } from '../../src/sequences/Shape';
import { TextSequence } from '../../src/sequences/Text';
import type { CompositionShape, Keyframe, SequenceSpec } from '../../src/types';
import { setTimelineEngine } from '../../src/core/timelineEngine';
setTimelineEngine('gsap');   // these read GSAP's own tweens (getChildren): they are about the GSAP engine

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
beforeEach(() => { vi.restoreAllMocks(); });

describe('loopVars', () => {
  it('passes repeat / yoyo / repeatDelay through, and nothing when unset', () => {
    expect(loopVars({ repeat: 3, yoyo: true, repeatDelay: 0.2 })).toEqual({ repeat: 3, yoyo: true, repeatDelay: 0.2 });
    expect(loopVars({ at: 1 })).toEqual({});
  });
  it('floors fractional counts and rejects infinite / negative repeats with a warning (the timeline must have a fixed length)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loopVars({ repeat: 2.7 })).toEqual({ repeat: 2 });
    expect(loopVars({ repeat: -1 })).toEqual({});
    expect(loopVars({ repeat: Infinity })).toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toMatch(/repeat.*finite/i);
  });
});

describe('applyKeyframes with repeat / yoyo', () => {
  it('a yoyo tween goes there and back (value check by seeking)', () => {
    const target = { x: 0 };
    const tl = gsap.timeline({ paused: true });
    const kfs: Keyframe[] = [{ at: 0, to: { x: 100 }, duration: 1, repeat: 1, yoyo: true }];
    applyKeyframes(tl, target, kfs, 10, {});
    tl.time(0.5); expect(target.x).toBeCloseTo(50, 6);
    tl.time(1);   expect(target.x).toBeCloseTo(100, 6);
    tl.time(1.5); expect(target.x).toBeCloseTo(50, 6);
    tl.time(2);   expect(target.x).toBeCloseTo(0, 6);
  });

  it('a plain repeat restarts from the start value; fromTo and from also repeat', () => {
    const t1 = { x: 0 };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, t1, [{ at: 0, from: { x: 0 }, to: { x: 100 }, duration: 1, repeat: 2 }], 10, {});
    tl.time(2.5); expect(t1.x).toBeCloseTo(50, 6);
    const t2 = { y: 100 };
    const tl2 = gsap.timeline({ paused: true });
    applyKeyframes(tl2, t2, [{ at: 0, from: { y: 0 }, duration: 1, repeat: 1, yoyo: true }], 10, {});
    expect(tl2.getChildren(false, true, true).some((c: any) => c.repeat() === 1 && c.yoyo())).toBe(true);
  });

  it('repeatDelay is honoured and filter / routed paths repeat too', () => {
    const f = { _name: 'b', strength: 0 };
    const target = { filters: [f] };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, target, [{ at: 0, to: { 'filters.b.strength': 10 }, duration: 1, repeat: 1, repeatDelay: 1, yoyo: false }], 10, {});
    const child = tl.getChildren(false, true, true).find((c: any) => c.targets?.()[0] === f) as any;
    expect(child.repeat()).toBe(1);
    expect(child.repeatDelay()).toBe(1);
  });
});

describe('colour and shape paths repeat too', () => {
  it('shape live props (width, colour) and text fill take repeat / yoyo', async () => {
    const s = new ShapeSequence({ type: 'shape', shape: 'rect', width: 10, height: 10, duration: 5,
      keyframes: [
        { at: 0, to: { width: 50 }, duration: 1, repeat: 3, yoyo: true },
        { at: 0, to: { fillColor: '#ff0000' }, duration: 1, repeat: 3, yoyo: true },
      ] } as unknown as SequenceSpec, comp, comp);
    await s.build();
    const tl = gsap.timeline({ paused: true });
    s.bindTimeline(tl, 0);
    const reps = tl.getChildren(false, true, true).filter((c: any) => c.repeat?.() === 3);
    expect(reps.length).toBe(2);

    const t = new TextSequence({ type: 'text', text: 'a', duration: 5,
      keyframes: [{ at: 0, to: { fill: '#00ff00' }, duration: 1, repeat: 2, yoyo: true }] } as unknown as SequenceSpec, comp, comp);
    await t.build();
    const tl2 = gsap.timeline({ paused: true });
    t.bindTimeline(tl2, 0);
    expect(tl2.getChildren(false, true, true).some((c: any) => c.repeat?.() === 2 && c.yoyo?.())).toBe(true);
  });
});
