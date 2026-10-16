import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startHover } from '../../src/core/hover';
import type { PickHit } from '../../src/core/pick';

/** A canvas that is an EventTarget with a style, a pick that answers from a table, and a frame loop the test turns by hand. */
function setup(opts: Parameters<typeof startHover>[1] = {}) {
  const canvas = Object.assign(new EventTarget(), { style: { cursor: '' } }) as unknown as HTMLCanvasElement;
  const answers: { hit: PickHit | null } = { hit: null };
  const picks: Array<{ x: number; y: number; opts: unknown }> = [];
  let frames: Array<() => void> = [];
  let cancelled = 0;
  const stop = startHover({
    canvas,
    pick: (x, y, o) => { picks.push({ x, y, opts: o }); return answers.hit; },
    point: (e) => [(e as unknown as { clientX: number }).clientX, (e as unknown as { clientY: number }).clientY],
    requestFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelFrame: () => { cancelled++; frames = []; },
  }, opts);
  const move = (x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y }));
  const leave = () => canvas.dispatchEvent(new Event('pointerleave'));
  const tick = () => { const run = frames; frames = []; run.forEach((f) => f()); };
  return { canvas, answers, picks, stop, move, leave, tick, cancelled: () => cancelled, pending: () => frames.length };
}
const hit = (name: string, object?: string): PickHit => ({ name, path: name, type: 'x', kind: object ? 'three' : 'flat', point: { x: 0, y: 0 }, ...(object ? { three: { object, point: [0, 0, 0] as [number, number, number], distance: 1 } } : {}) });
beforeEach(() => { vi.restoreAllMocks(); });

describe('hover: onEnter / onLeave for what is under the pointer', () => {
  it('enters a layer once however often the pointer moves inside it, and leaves it when the pointer goes to another layer or off the picture', () => {
    const log: string[] = [];
    const h = setup({ onEnter: (x) => log.push('in ' + x.name), onLeave: (x) => log.push('out ' + x.name) });
    h.answers.hit = hit('a'); h.move(1, 1); h.move(2, 2); h.move(3, 3);
    expect(log).toEqual(['in a']);
    h.answers.hit = hit('b'); h.move(4, 4);
    expect(log).toEqual(['in a', 'out a', 'in b']);
    h.answers.hit = null; h.move(5, 5);
    expect(log).toEqual(['in a', 'out a', 'in b', 'out b']);
    h.answers.hit = hit('b'); h.move(6, 6); h.leave();
    expect(log.slice(-2)).toEqual(['in b', 'out b']);
    h.leave();                                                                // already out: nothing more
    expect(log).toHaveLength(6);
  });

  it('the pointer is turned into canvas pixels (movie.canvasPoint) and asked with only / ignore', () => {
    const h = setup({ only: ['button'], ignore: ['bg'], onEnter: () => {} });
    h.move(40, 50);
    expect(h.picks[0]).toEqual({ x: 40, y: 50, opts: { only: ['button'], ignore: ['bg'] } });
  });

  it('another object of the same three layer is another hover (the fox, then the cube in the same layer)', () => {
    const log: string[] = [];
    const h = setup({ onEnter: (x) => log.push('in ' + x.three!.object), onLeave: (x) => log.push('out ' + x.three!.object) });
    h.answers.hit = hit('world', 'fox'); h.move(1, 1);
    h.answers.hit = hit('world', 'cube'); h.move(2, 2);
    expect(log).toEqual(['in fox', 'out fox', 'in cube']);
  });

  it('while the pointer stays still over a picture that moves, the answer is asked again every frame (the fox runs away from the pointer: leave)', () => {
    const log: string[] = [];
    const h = setup({ onEnter: (x) => log.push('in ' + x.name), onLeave: (x) => log.push('out ' + x.name) });
    h.answers.hit = hit('fox'); h.move(10, 10);
    expect(h.pending(), 'a frame is waiting while the pointer is inside').toBe(1);
    h.answers.hit = null; h.tick();
    expect(log).toEqual(['in fox', 'out fox']);
    h.answers.hit = hit('title'); h.tick();
    expect(log.at(-1)).toBe('in title');
    expect(h.picks.at(-1)).toMatchObject({ x: 10, y: 10 });                   // still the same place of the pointer
  });

  it('no frames are asked for while the pointer is off the picture, and the loop ends when it leaves', () => {
    const h = setup({ onEnter: () => {} });
    expect(h.pending()).toBe(0);
    h.move(1, 1);
    expect(h.pending()).toBe(1);
    h.leave();
    expect(h.cancelled()).toBeGreaterThan(0);
    expect(h.pending()).toBe(0);
  });

  it('cursor: a hit makes the cursor a pointer, no hit puts it back', () => {
    const h = setup({ cursor: 'pointer' });
    h.answers.hit = hit('a'); h.move(1, 1);
    expect(h.canvas.style.cursor).toBe('pointer');
    h.answers.hit = null; h.move(2, 2);
    expect(h.canvas.style.cursor).toBe('');
    h.answers.hit = hit('a'); h.move(3, 3); h.leave();
    expect(h.canvas.style.cursor).toBe('');
  });

  it('the stop function removes the listeners, leaves what is hovered once, and puts the cursor back', () => {
    const log: string[] = [];
    const h = setup({ cursor: 'grab', onEnter: (x) => log.push('in ' + x.name), onLeave: (x) => log.push('out ' + x.name) });
    h.answers.hit = hit('a'); h.move(1, 1);
    h.stop();
    expect(log).toEqual(['in a', 'out a']);
    expect(h.canvas.style.cursor).toBe('');
    h.answers.hit = hit('b'); h.move(2, 2);
    expect(log).toHaveLength(2);
  });

  it("a handler that throws is said once and does not break the next hover", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log: string[] = [];
    const h = setup({ onEnter: (x) => { log.push('in ' + x.name); throw new Error('boom'); } });
    h.answers.hit = hit('a'); h.move(1, 1);
    h.answers.hit = hit('b'); h.move(2, 2);
    expect(log).toEqual(['in a', 'in b']);
    expect(warn.mock.calls.filter((c) => /hover/.test(String(c[0])))).toHaveLength(1);
  });
});
