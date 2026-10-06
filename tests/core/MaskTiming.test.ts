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
  return tl.getChildren(true, true, false)
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

describe('an image used as a mask stays hidden (PIXI hides a sprite mask with renderable = false)', () => {
  async function maskOf(mask: Record<string, unknown>) {
    const spec = {
      type: 'composition', width: 1280, height: 720, duration: 10,
      sequences: [{ type: 'shape', shape: 'rect', width: 100, height: 100, at: 2, duration: 3, mask }],
    } as unknown as SequenceSpec;
    const comp = new CompositionSequence(spec as never, shape, shape);
    await comp.build();
    const target = (comp as unknown as { _children: Array<{ maskSequence: { target: { renderable: boolean } } | null }> })._children[0].maskSequence!.target;
    target.renderable = false;                                     // what PIXI's AlphaMask does to a sprite mask
    const tl = gsap.timeline({ paused: true });
    comp.bindTimeline(tl, 0);
    const toggles = tl.getChildren(true, true, false).filter((c: any) => c.targets?.().includes(target) && c.vars && 'renderable' in c.vars);
    return { target, tl, toggles };
  }

  it('the lifespan toggles never switch an image mask\'s renderable back on (it was drawn as a normal white picture)', async () => {
    const { target, tl, toggles } = await maskOf({ type: 'image', asset: 'disc' });
    expect(target.renderable).toBe(false);
    expect(toggles).toHaveLength(0);
    tl.time(3);
    expect(target.renderable).toBe(false);
  });

  it('a shape mask keeps its lifespan toggles (its own at / duration still switch it on and off)', async () => {
    const { toggles } = await maskOf({ type: 'shape', shape: 'circle', radius: 40 });
    expect(toggles.length).toBeGreaterThan(0);
  });
});
