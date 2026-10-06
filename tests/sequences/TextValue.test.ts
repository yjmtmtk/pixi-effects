import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { TextSequence } from '../../src/sequences/Text';
import { lintText } from '../../src/core/lint';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: unknown) => new TextSequence({ type: 'text', ...(spec as object) } as SequenceSpec, comp, comp);
const textOf = (s: TextSequence) => (s.target as unknown as { text: string }).text;
async function bound(spec: unknown) {
  const s = make(spec);
  await s.build();
  const tl = gsap.timeline({ paused: true });
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
    expect(textOf((await bound({ text: 'hello' })).s)).toBeUndefined();   // never rewritten (the mock has no initial text)
  });
});

describe('lintText', () => {
  const run = (spec: unknown) => { const o: string[] = []; lintText(spec as SequenceSpec, m => o.push(m)); return o; };
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
