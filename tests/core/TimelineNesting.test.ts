import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { setTimelineEngine } from '../../src/core/timelineEngine';
setTimelineEngine('gsap');   // these read GSAP's own tweens (getChildren): they are about the GSAP engine

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function build(sequences: SequenceSpec[]) {
  const comp = new CompositionSequence({ type: 'composition', sequences } as never, null, root);
  await comp.build();
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  comp.bindTimeline(tl);
  return { comp, tl };
}
const box = (name: string, extra: object = {}): SequenceSpec => ({ type: 'shape', shape: 'rect', name, width: 10, height: 10, ...extra }) as SequenceSpec;

describe('every layer is bound in a small timeline of its own', () => {
  it('the parent timeline holds one timeline per layer, however many tweens each has (adding thousands of tweens to one timeline made GSAP re-measure it at every add)', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ at: i * 0.1, to: { x: i }, duration: 0.1 }));
    const { tl } = await build([box('a', { keyframes: many }), box('b', { keyframes: many }), box('c')]);
    expect(tl.getChildren(false, false, true)).toHaveLength(3);                     // three timelines (the composition's own on / off switches are the only direct tweens)
    expect(tl.getChildren(true, true, false).length).toBeGreaterThan(120);          // the tweens are all there, one level down
  });

  it('positions stay absolute: the picture at any time is the same as with one flat timeline', async () => {
    const { comp, tl } = await build([
      box('a', { at: 2, initial: { x: 0 }, keyframes: [{ at: 1, to: { x: 100 }, duration: 2, ease: 'none' }] }),
    ]);
    const a = comp._children[0]!.target as unknown as { x: number; renderable: boolean };
    tl.time(0); expect(a.renderable).toBe(false);                                   // not yet born (at 2 s)
    tl.time(3.5);                                                                    // 0.5 s into the tween, which starts 1 s into the layer
    expect(a.renderable).toBe(true);
    expect(a.x).toBeCloseTo(25, 6);
    tl.time(5); expect(a.x).toBeCloseTo(100, 6);
    tl.time(3.5); expect(a.x).toBeCloseTo(25, 6);                                    // seeking back works
  });

  it('nested compositions nest the same way and keep their offsets', async () => {
    const inner: SequenceSpec = { type: 'composition', name: 'inner', at: 3, duration: 5, sequences: [box('c', { at: 1, initial: { x: 0 }, keyframes: [{ at: 0, to: { x: 40 }, duration: 4, ease: 'none' }] })] } as never;
    const { comp, tl } = await build([inner]);
    const c = (comp._children[0] as unknown as { _children: Array<{ target: { x: number } }> })._children[0]!.target;
    tl.time(6);                                                                      // the child starts at 3 + 1 = 4 s; 2 s in -> half way
    expect(c.x).toBeCloseTo(20, 6);
  });

  it('tweens inherit the movie\'s default ease (none), not GSAP\'s', async () => {
    const { comp, tl } = await build([box('a', { initial: { x: 0 }, keyframes: [{ at: 0, to: { x: 100 }, duration: 2 }] })]);
    const a = comp._children[0]!.target as unknown as { x: number };
    tl.time(1); expect(a.x).toBeCloseTo(50, 6);
  });
});
