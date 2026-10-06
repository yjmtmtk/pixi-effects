import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
type Tl = ReturnType<typeof gsap.timeline>;
/** Global start times of every tween that animates `prop` on a layer named `name` (the label sits on the display object). */
function startsOfLayer(tl: Tl, prop: string): number[] {
  return tl.getChildren(false, true, true)
    .filter((c: any) => c.vars && (prop in c.vars || c.vars.pixi && prop in c.vars.pixi || c.vars[prop] !== undefined))
    .map((c: any) => +c.startTime().toFixed(3))
    .sort((a: number, b: number) => a - b);
}

async function build(maskExtra: Record<string, unknown> = {}) {
  const spec = {
    type: 'composition', width: 1280, height: 720, duration: 10,
    sequences: [{
      type: 'shape', shape: 'rect', width: 100, height: 100, at: 2, duration: 3,
      mask: {
        type: 'shape', shape: 'rect', width: 0, height: 100, initial: { anchorX: 0 },
        keyframes: [{ at: 0, to: { width: 100 }, duration: 1 }],
        ...maskExtra,
      },
    }],
  } as unknown as SequenceSpec;
  const comp = new CompositionSequence(spec as never, shape, shape);
  await comp.build();
  const tl = gsap.timeline({ paused: true });
  comp.bindTimeline(tl, 0);
  return { comp, tl };
}

describe('a mask shares the lifetime of the layer it masks', () => {
  it('by default the mask starts with the masked layer: its keyframe at 0 plays at the layer start (2 s)', async () => {
    const { tl } = await build();
    expect(startsOfLayer(tl, 'width')).toEqual([2]);
  });

  it('an explicit mask `at` is still composition time (unchanged)', async () => {
    const { tl } = await build({ at: 1 });
    expect(startsOfLayer(tl, 'width')).toEqual([1]);
  });

  it('the mask is alive exactly while the masked layer is (default duration = the layer duration)', async () => {
    const { comp } = await build();
    const maskSeq = (comp as unknown as { _children: Array<{ maskSequence: { at: number; duration: number } | null }> })._children[0].maskSequence!;
    expect(maskSeq.at).toBe(2);
    expect(maskSeq.duration).toBe(3);
  });

  it('an explicit mask `at` keeps the old default duration (it does not shrink to the layer)', async () => {
    const { comp } = await build({ at: 0 });
    const maskSeq = (comp as unknown as { _children: Array<{ maskSequence: { at: number; duration: number } | null }> })._children[0].maskSequence!;
    expect(maskSeq.at).toBe(0);
    expect(maskSeq.duration).toBe(10);
  });
});
