import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { TextSequence } from '../../src/sequences/Text';
import { lintText } from '../../src/core/lint';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: unknown) => new TextSequence({ type: 'text', ...(spec as object) } as SequenceSpec, comp, comp);
const textOf = (s: TextSequence) => (s.target as unknown as { text: string }).text;
async function bound(spec: unknown) {
  const s = make(spec);
  await s.build();
  const tl = createTimeline({ paused: true });
  s.bindTimeline(tl, 0);
  return { s, tl };
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('text `value` counter', () => {
  it('replaces {value} in the text, starting from initial.value (default 0)', async () => {
    expect(textOf((await bound({ text: '{value} users' })).s)).toBe('0 users');
    expect(textOf((await bound({ text: '{value} users', initial: { value: 5 } })).s)).toBe('5 users');
  });

  it('animates with the normal keyframe vocabulary (to / from+to / set) and any ease', async () => {
    const { s, tl } = await bound({
      text: '{value}', duration: 6,
      keyframes: [{ at: 0, to: { value: 100 }, duration: 2 }, { at: 3, from: { value: 0 }, to: { value: 40 }, duration: 2 }],
    });
    tl.time(1);   expect(textOf(s)).toBe('50');
    tl.time(2);   expect(textOf(s)).toBe('100');
    tl.time(3);   expect(textOf(s)).toBe('0');       // fromTo snaps to its start
    tl.time(4);   expect(textOf(s)).toBe('20');
    tl.time(0.5); expect(textOf(s)).toBe('25');      // seeking backwards works too
  });

  it('is layer-local like every other keyframe', async () => {
    const { s, tl } = await bound({ text: '{value}', at: 2, duration: 4, keyframes: [{ at: 0, to: { value: 100 }, duration: 2 }] });
    tl.time(2);   expect(textOf(s)).toBe('0');
    tl.time(3);   expect(textOf(s)).toBe('50');
  });

  it('formats: decimals and thousands grouping', async () => {
    const { s, tl } = await bound({ text: '${value}', format: { decimals: 1, grouping: true }, keyframes: [{ at: 0, to: { value: 12345.67 }, duration: 1 }] });
    tl.time(1);   expect(textOf(s)).toBe('$12,345.7');
    const g = await bound({ text: '{value}', format: { grouping: true }, initial: { value: 1234567 } });
    expect(textOf(g.s)).toBe('1,234,567');
  });

  it('accepts expressions as values', async () => {
    const { s, tl } = await bound({ text: '{value}', keyframes: [{ at: 0, to: { value: 'GW / 10' }, duration: 1 }] });
    tl.time(1);   expect(textOf(s)).toBe('128');
  });

  it('works with repeat / yoyo', async () => {
    const { s, tl } = await bound({ text: '{value}', duration: 6, keyframes: [{ at: 0, to: { value: 10 }, duration: 1, repeat: 1, yoyo: true }] });
    tl.time(1.5); expect(textOf(s)).toBe('5');
    tl.time(2);   expect(textOf(s)).toBe('0');
  });

  it('plain text without {value} is untouched', async () => {
    expect(textOf((await bound({ text: 'hello' })).s)).toBe('hello');
  });
});

describe('lintText', () => {
  const run = (spec: unknown) => { const o: string[] = []; lintText(spec as SequenceSpec, m => o.push(m)); return o; };
  it('a {value} that only a swapped string (set: { text }) has is a placeholder too', () => {
    expect(run({ type: 'text', name: 'n', text: 'x', keyframes: [{ at: 1, set: { text: 'N: {value}', value: 0 } }, { at: 1, to: { value: 5 }, duration: 1 }] })).toEqual([]);
  });
  it('warns when value is animated but the text has no {value} placeholder', () => {
    const w = run({ type: 'text', name: 'n', text: 'hello', keyframes: [{ at: 0, to: { value: 10 }, duration: 1 }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('{value}');
    expect(w[0]).toContain('layer "n"');
  });
  it('is silent with the placeholder, without value, and for non-text layers', () => {
    expect(run({ type: 'text', text: '{value}', initial: { value: 1 } })).toEqual([]);
    expect(run({ type: 'text', text: 'hi' })).toEqual([]);
    expect(run({ type: 'shape', shape: 'rect', width: 1, height: 1, initial: { value: 1 } })).toEqual([]);
  });
});

describe('text `{value}` — lint and zero-padding', () => {
  it('a {value} placeholder that nothing sets or animates warns that it will print 0', () => {
    const out: string[] = [];
    lintText({ type: 'text', text: 'power2.inOut · {value}%' } as never, m => out.push(m));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('{value}');
    expect(out[0]).toMatch(/prints 0|shows 0/);
    // set in initial, or animated: no warning
    const none: string[] = [];
    lintText({ type: 'text', text: '{value}', initial: { value: 3 } } as never, m => none.push(m));
    lintText({ type: 'text', text: '{value}', keyframes: [{ at: 0, to: { value: 9 }, duration: 1 }] } as never, m => none.push(m));
    lintText({ type: 'text', text: 'plain' } as never, m => none.push(m));
    expect(none).toEqual([]);
  });

  it('format.pad zero-pads the whole part to that many digits (a clock needs :05)', async () => {
    const { s, tl } = await bound({ text: '18:42:{value}', format: { pad: 2 }, initial: { value: 5 }, keyframes: [{ at: 0, to: { value: 12 }, duration: 1 }] });
    expect(textOf(s)).toBe('18:42:05');
    tl.time(1);   expect(textOf(s)).toBe('18:42:12');
    const d = await bound({ text: '{value}', format: { pad: 3, decimals: 1 }, initial: { value: 4.25 } });
    expect(textOf(d.s)).toBe('004.3');            // pads the integer part only
    const neg = await bound({ text: '{value}', format: { pad: 2 }, initial: { value: -3 } });
    expect(textOf(neg.s)).toBe('-03');
    const grouped = await bound({ text: '{value}', format: { pad: 6, grouping: true }, initial: { value: 1234 } });
    expect(textOf(grouped.s)).toBe('001,234');
  });

  it('format.time prints the value (seconds) as a clock: hh:mm:ss, h:mm:ss, hh:mm, mm:ss, m:ss; the hours do not wrap', async () => {
    const at = async (time: string, v: number) => textOf((await bound({ text: '{value}', format: { time } as never, initial: { value: v } })).s);
    expect(await at('mm:ss', 75)).toBe('01:15');
    expect(await at('m:ss', 75)).toBe('1:15');
    expect(await at('m:ss', 3599)).toBe('59:59');
    expect(await at('hh:mm:ss', 3725)).toBe('01:02:05');
    expect(await at('h:mm:ss', 3725)).toBe('1:02:05');
    expect(await at('hh:mm', 15000)).toBe('04:10');                  // 4 h 10 min; the seconds are cut, not rounded up
    expect(await at('hh:mm', 84300)).toBe('23:25');
    expect(await at('hh:mm', 90000)).toBe('25:00');
    expect(await at('mm:ss', 3725)).toBe('62:05');                    // the minutes carry the hours when there is no hour field
  });

  it('format.time follows an animated value, rounds down to whole seconds, and shows a negative value with a minus', async () => {
    const { s, tl } = await bound({ text: '{value}', format: { time: 'mm:ss' } as never, initial: { value: 0 }, keyframes: [{ at: 0, to: { value: 61 }, duration: 1, ease: 'none' }] });
    expect(textOf(s)).toBe('00:00');
    tl.time(0.5);  expect(textOf(s)).toBe('00:30');
    tl.time(1);    expect(textOf(s)).toBe('01:01');
    expect(textOf((await bound({ text: '{value}', format: { time: 'mm:ss' } as never, initial: { value: -75 } })).s)).toBe('-01:15');
  });

  it('a time pattern that is not one of the five is said, with the list, and the value prints as a plain number', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await bound({ text: '{value}', format: { time: 'hh:mm:ss.s' } as never, initial: { value: 75 } });
    expect(textOf(r.s)).toBe('75');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/format\.time.*"hh:mm:ss\.s".*hh:mm:ss.*m:ss/));
  });
});
