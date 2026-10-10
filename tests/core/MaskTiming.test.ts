import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
type Tl = ReturnType<typeof createTimeline>;
/** Global start times of every segment that animates `prop`. */
function startsOfLayer(tl: Tl, prop: string): number[] {
  return tl.segments().filter(s => s.id === prop).map(s => +s.start.toFixed(3)).sort((a, b) => a - b);
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
  const tl = createTimeline({ paused: true });
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

describe('an image used as a mask is a matte: it is drawn into the matte texture while it is alive, never on screen', () => {
  async function maskOf(mask: Record<string, unknown>) {
    const spec = {
      type: 'composition', width: 1280, height: 720, duration: 10,
      sequences: [{ type: 'shape', shape: 'rect', width: 100, height: 100, at: 2, duration: 3, mask }],
    } as unknown as SequenceSpec;
    const comp = new CompositionSequence(spec as never, shape, shape);
    await comp.build();
    const target = (comp as unknown as { _children: Array<{ maskSequence: { target: { renderable: boolean } } | null }> })._children[0].maskSequence!.target;
    const tl = createTimeline({ paused: true });
    comp.bindTimeline(tl, 0);
    const toggles = tl.segments().filter(s => s.target === target && s.id === 'renderable');
    return { target, tl, toggles };
  }

  it('the lifespan toggles switch the image mask on at the layer\'s start and off at its end (the matte texture is drawn only while it is alive)', async () => {
    const { target, tl, toggles } = await maskOf({ type: 'image', asset: 'disc' });
    expect(toggles.length).toBeGreaterThan(0);
    tl.time(0);
    expect(target.renderable).toBe(false);                         // before the layer starts (2 s)
    tl.time(3);
    expect(target.renderable).toBe(true);
    tl.time(6);
    expect(target.renderable).toBe(false);                         // after it ends (5 s)
  });

  it('a shape mask keeps its lifespan toggles (its own at / duration still switch it on and off)', async () => {
    const { toggles } = await maskOf({ type: 'shape', shape: 'circle', radius: 40 });
    expect(toggles.length).toBeGreaterThan(0);
  });
});
