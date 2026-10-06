import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { TextSequence } from '../../src/sequences/Text';
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

describe('text content over time: set: { text }', () => {
  it('swaps the string at the keyframe time and swaps back when you seek back', async () => {
    const { s, tl } = await bound({ text: 'Three', keyframes: [
      { at: 1, set: { text: 'Two' } }, { at: 2, set: { text: 'One' } }, { at: 3, set: { text: 'Go!' } }] });
    expect(textOf(s)).toBe('Three');
    tl.time(1.5); expect(textOf(s)).toBe('Two');
    tl.time(2.5); expect(textOf(s)).toBe('One');
    tl.time(3);   expect(textOf(s)).toBe('Go!');        // exactly on the boundary
    tl.time(0.2); expect(textOf(s)).toBe('Three');      // a jump back undoes them all
    tl.time(2);   expect(textOf(s)).toBe('One');
  });

  it('is layer-local like every other keyframe', async () => {
    const { s, tl } = await bound({ text: 'a', at: 2, duration: 4, keyframes: [{ at: 1, set: { text: 'b' } }] });
    tl.time(2.5); expect(textOf(s)).toBe('a');
    tl.time(3);   expect(textOf(s)).toBe('b');
  });

  it('a swapped string may still use the {value} counter', async () => {
    const { s, tl } = await bound({ text: 'n', keyframes: [
      { at: 1, set: { text: 'Score: {value}', value: 0 } }, { at: 1, to: { value: 10 }, duration: 1 }] });
    tl.time(1.5); expect(textOf(s)).toBe('Score: 5');
  });

  it('to / from with text cannot tween a string: it says to use set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await bound({ text: 'a', keyframes: [{ at: 1, to: { text: 'b' }, duration: 1 }] });
    expect(warn.mock.calls.some(c => String(c[0]).includes('set: { text'))).toBe(true);
  });
});

describe('text visibleChars (a typewriter)', () => {
  it('shows the first N characters (rounded down) and animates like any number', async () => {
    const { s, tl } = await bound({ text: 'Hello world', initial: { visibleChars: 0 }, keyframes: [{ at: 1, to: { visibleChars: 11 }, duration: 2 }] });
    expect(textOf(s)).toBe('');
    tl.time(1);   expect(textOf(s)).toBe('');
    tl.time(2);   expect(textOf(s)).toBe('Hello');      // 5.5 → 5
    tl.time(3);   expect(textOf(s)).toBe('Hello world');
    tl.time(1.5); expect(textOf(s)).toBe('He');         // seeking back (2.75 → 2)
  });

  it('starts empty when it is animated and has no initial value', async () => {
    const { s } = await bound({ text: 'abc', keyframes: [{ at: 0, to: { visibleChars: 3 }, duration: 1 }] });
    expect(textOf(s)).toBe('');
  });

  it('counts what you see: an emoji or a surrogate pair is one character', async () => {
    const { s, tl } = await bound({ text: 'a😀b', keyframes: [{ at: 0, to: { visibleChars: 3 }, duration: 3, ease: 'none' }] });
    tl.time(2); expect(textOf(s)).toBe('a😀');
  });

  it('works with a swapped string: the new text is typed from where the count is', async () => {
    const { s, tl } = await bound({ text: 'one two', keyframes: [
      { at: 0, set: { visibleChars: 0 } }, { at: 0, to: { visibleChars: 7 }, duration: 1 },
      { at: 2, set: { text: 'three' } }, { at: 2, set: { visibleChars: 0 } }, { at: 2, to: { visibleChars: 5 }, duration: 1 }] });
    tl.time(1);   expect(textOf(s)).toBe('one two');
    tl.time(2.2); expect(textOf(s)).toBe('t');
    tl.time(3);   expect(textOf(s)).toBe('three');
  });

  it('without visibleChars the whole text shows', async () => {
    expect(textOf((await bound({ text: 'plain' })).s)).toBe('plain');
  });
});
