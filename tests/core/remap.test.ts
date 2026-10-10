// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gsap } from 'gsap';
import { timeRemapOf, resolveFromEnd, contentLength, bindClock, clockTable, remapOf } from '../../src/core/remap';
import { createTimeline } from '../../src/core/timelineEngine';

const scope = {} as Record<string, number>;
const clockAt = (remap: NonNullable<ReturnType<typeof timeRemapOf>>, prop: string, duration: number, t: number): number => {
  const tl = createTimeline({ paused: true });
  const clock: Record<string, number> = { [prop]: 0 };
  bindClock(tl, clock, prop, remap, duration, 0, scope);
  tl.time(tl.duration()); tl.time(0);
  tl.time(t);
  return clock[prop]!;
};

describe('timeRemapOf', () => {
  it('nothing about time: null', () => {
    expect(timeRemapOf({ initial: { x: 1 }, keyframes: [{ at: 0, to: { x: 2 }, duration: 1 }] })).toBeNull();
  });
  it('time keyframes go to the clock (renamed), the rest stays for the display object', () => {
    const r = timeRemapOf({ initial: { x: 1, time: 2 }, keyframes: [
      { at: 0, to: { time: 5 }, duration: 1 }, { at: 1, to: { x: 9, time: 3 }, duration: 1 }, { at: 2, to: { x: 4 }, duration: 1 },
    ] }, 'currentTime')!;
    expect(r.start).toBe(2);
    expect(r.restInitial).toEqual({ x: 1 });
    expect(r.timeKfs.map(k => k.to)).toEqual([{ currentTime: 5 }, { currentTime: 3 }]);
    expect(r.restKfs!.map(k => k.to)).toEqual([{ x: 9 }, { x: 4 }]);
  });
  it('speed alone is enough', () => {
    expect(timeRemapOf({ speed: 2 })!.speed).toBe(2);
  });
});

describe('bindClock', () => {
  it('speed 2: the clock runs twice as fast; speed 0.5 half; speed -1 backward from |speed| x duration', () => {
    expect(clockAt(timeRemapOf({ speed: 2 })!, 'time', 3, 1.5)).toBeCloseTo(3, 9);
    expect(clockAt(timeRemapOf({ speed: 0.5 })!, 'time', 3, 2)).toBeCloseTo(1, 9);
    expect(clockAt(timeRemapOf({ speed: -1 })!, 'time', 3, 0)).toBeCloseTo(3, 9);
    expect(clockAt(timeRemapOf({ speed: -1 })!, 'time', 3, 1)).toBeCloseTo(2, 9);
    expect(clockAt(timeRemapOf({ speed: -2 })!, 'time', 3, 1)).toBeCloseTo(4, 9);        // starts at 2 x 3 = 6, runs 2 per second backward
  });
  it('initial.time is where it starts', () => {
    expect(clockAt(timeRemapOf({ speed: 1, initial: { time: 2 } })!, 'time', 3, 0.5)).toBeCloseTo(2.5, 9);
  });
  it('keyframes: a ramp, a freeze (the same value twice) and a loop (repeat)', () => {
    const r = timeRemapOf({ keyframes: [
      { at: 0, from: { time: 0 }, to: { time: 2 }, duration: 1 },        // 0..1 s: 0 -> 2
      { at: 1, to: { time: 2 }, duration: 1 },                           // 1..2 s: frozen at 2
      { at: 2, from: { time: 0 }, to: { time: 1 }, duration: 1, repeat: 1 },   // 2..4 s: 0 -> 1, twice
    ] })!;
    expect(clockAt(r, 'time', 4, 0.5)).toBeCloseTo(1, 9);
    expect(clockAt(r, 'time', 4, 1.5)).toBeCloseTo(2, 9);
    expect(clockAt(r, 'time', 4, 2.5)).toBeCloseTo(0.5, 9);
    expect(clockAt(r, 'time', 4, 3.5)).toBeCloseTo(0.5, 9);
  });
  it('keyframes and initial.time together: the clock starts at initial.time before the first keyframe', () => {
    const r = timeRemapOf({ initial: { time: 2 }, keyframes: [{ at: 1, to: { time: 4 }, duration: 1 }] })!;
    expect(clockAt(r, 'time', 3, 0.5)).toBeCloseTo(2, 9);
    expect(clockAt(r, 'time', 3, 2)).toBeCloseTo(4, 9);
  });
  it('seeks backward first and still gets the same values (a to-tween captures its start once, in order)', () => {
    const r = timeRemapOf({ keyframes: [{ at: 0, to: { time: 2 }, duration: 1 }, { at: 1, to: { time: 6 }, duration: 1 }] })!;
    const tl = createTimeline({ paused: true });
    const clock = { time: 0 };
    bindClock(tl, clock, 'time', r, 2, 0, scope);
    tl.time(tl.duration()); tl.time(0);
    tl.time(2); expect(clock.time).toBeCloseTo(6, 9);
    tl.time(1.5); expect(clock.time).toBeCloseTo(4, 9);
    tl.time(0.5); expect(clock.time).toBeCloseTo(1, 9);
  });
});

describe('contentLength and negative time (from the end)', () => {
  it('contentLength is the lifespan, or more when the clock runs ahead of it', () => {
    expect(contentLength(timeRemapOf({ speed: 1 })!, 4)).toBe(4);
    expect(contentLength(timeRemapOf({ speed: 2 })!, 4)).toBe(8);
    expect(contentLength(timeRemapOf({ speed: -3 })!, 4)).toBe(12);
    expect(contentLength(timeRemapOf({ keyframes: [{ at: 0, to: { time: 9 }, duration: 1 }] })!, 4)).toBe(9);
    expect(contentLength(timeRemapOf({ keyframes: [{ at: 0, to: { time: -2 }, duration: 1 }] })!, 4)).toBe(4);   // a negative one does not lengthen it
  });
  it('a negative number counts back from the end of the content (initial and keyframes); other values are left alone', () => {
    const r = resolveFromEnd(timeRemapOf({ initial: { time: -1 }, keyframes: [{ at: 0, to: { time: -2 }, duration: 1 }, { at: 1, to: { time: 'W / 2' }, duration: 1 }] })!, 10, 'time');
    expect(r.start).toBe(9);
    expect(r.timeKfs[0]!.to).toEqual({ time: 8 });
    expect(r.timeKfs[1]!.to).toEqual({ time: 'W / 2' });
    expect(resolveFromEnd(timeRemapOf({ initial: { time: -50 } })!, 10, 'time').start).toBe(0);                 // before the start: stops at the start
  });
  it('remapOf is both steps; a null length leaves negatives alone', () => {
    expect(remapOf({ initial: { time: -1 } }, 'time', 10)!.start).toBe(9);
    expect(remapOf({ initial: { time: -1 } }, 'time', null)!.start).toBe(-1);
    expect(remapOf({ x: 1 } as never, 'time', 10)).toBeNull();
  });
});

describe('clockTable', () => {
  it('reads the same clock as bindClock, at any time, with its range', () => {
    const r = timeRemapOf({ speed: -1 })!;
    const table = clockTable(r, 'time', 3, 1, scope, 4);          // the layer starts at 1 s
    expect(table.at(1)).toBeCloseTo(3, 3);
    expect(table.at(2.5)).toBeCloseTo(1.5, 3);
    expect(table.at(4)).toBeCloseTo(0, 3);
    expect(table.min).toBeCloseTo(0, 3);
    expect(table.max).toBeCloseTo(3, 3);
  });
  it('a freeze has a flat table', () => {
    const r = timeRemapOf({ keyframes: [{ at: 0, from: { time: 1 }, to: { time: 1 }, duration: 2 }] })!;
    const table = clockTable(r, 'time', 2, 0, scope, 2);
    expect(table.at(0.3)).toBeCloseTo(1, 6);
    expect(table.at(1.9)).toBeCloseTo(1, 6);
  });
});
