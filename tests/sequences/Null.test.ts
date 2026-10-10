import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const root: CompositionShape = { width: 1280, height: 720, duration: 6 };
async function build(sequences: SequenceSpec[]): Promise<CompositionSequence> {
  const comp = new CompositionSequence({ type: 'composition', sequences } as never, null, root);
  await comp.build();
  return comp;
}
const find = (comp: CompositionSequence, name: string) => comp._children.find(c => c.spec.name === name)!;
const rect = (name: string, extra: object = {}): SequenceSpec =>
  ({ type: 'shape', shape: 'rect', width: 10, height: 10, name, ...extra }) as SequenceSpec;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('null layers and parent', () => {
  it('a layer with `parent` is drawn inside the null layer, not beside it', async () => {
    const comp = await build([{ type: 'null', name: 'rig' } as SequenceSpec, rect('a', { parent: 'rig' }), rect('b')]);
    const rig = find(comp, 'rig').target as any, a = find(comp, 'a').target, b = find(comp, 'b').target;
    expect(rig.children).toContain(a);
    expect(rig.children).not.toContain(b);
    const inner = (comp.target as any).children[0];
    expect(inner.children).toContain(rig);
    expect(inner.children).toContain(b);
    expect(inner.children).not.toContain(a);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the parent may be listed after its children', async () => {
    const comp = await build([rect('a', { parent: 'rig' }), { type: 'null', name: 'rig' } as SequenceSpec]);
    expect((find(comp, 'rig').target as any).children).toContain(find(comp, 'a').target);
  });

  it('nulls chain: a child of a null that is a child of another null', async () => {
    const comp = await build([
      { type: 'null', name: 'shoulder' } as SequenceSpec,
      { type: 'null', name: 'elbow', parent: 'shoulder' } as SequenceSpec,
      rect('hand', { parent: 'elbow' }),
    ]);
    expect((find(comp, 'shoulder').target as any).children).toContain(find(comp, 'elbow').target);
    expect((find(comp, 'elbow').target as any).children).toContain(find(comp, 'hand').target);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a null lives for the whole composition unless it says otherwise', async () => {
    const comp = await build([{ type: 'null', name: 'rig' } as SequenceSpec, { type: 'null', name: 'brief', at: 1, duration: 2 } as SequenceSpec]);
    expect(find(comp, 'rig').duration).toBe(6);
    expect(find(comp, 'brief').duration).toBe(2);
  });

  it('a null is animated like any layer, and its children are inside it', async () => {
    const comp = await build([
      { type: 'null', name: 'rig', initial: { x: 100 }, keyframes: [{ at: 0, to: { x: 300 }, duration: 2, ease: 'none' }] } as SequenceSpec,
      rect('a', { parent: 'rig' }),
    ]);
    const tl = createTimeline({ paused: true });
    comp.bindTimeline(tl);
    tl.seek(1);
    expect((find(comp, 'rig').target as any).x).toBeCloseTo(200, 5);
    tl.seek(2);
    expect((find(comp, 'rig').target as any).x).toBeCloseTo(300, 5);
  });

  it('a mask goes into the same space as the layer it masks', async () => {
    const comp = await build([
      { type: 'null', name: 'rig' } as SequenceSpec,
      rect('a', { parent: 'rig', mask: { type: 'shape', shape: 'circle', radius: 5 } }),
    ]);
    const rig = find(comp, 'rig').target as any;
    const maskTarget = find(comp, 'a').maskSequence!.target;
    expect(rig.children).toContain(maskTarget);
  });

  it('layers() lists the drawn layers, including the children of a null, and not the null itself', async () => {
    const comp = await build([{ type: 'null', name: 'rig' } as SequenceSpec, rect('a', { parent: 'rig' }), rect('b')]);
    const names = comp.layers().map(l => l.seq.spec.name).sort();
    expect(names).toEqual(['a', 'b']);
    const a = comp.layers().find(l => l.seq.spec.name === 'a')!;
    expect(a.carriers.map(c => c.spec.name)).toEqual(['rig']);
    expect(comp.layers().find(l => l.seq.spec.name === 'b')!.carriers).toEqual([]);
  });

  describe('mistakes are said out loud and the layer is drawn where it would have been', () => {
    it('an unknown parent name, with a suggestion', async () => {
      const comp = await build([{ type: 'null', name: 'planet' } as SequenceSpec, rect('a', { parent: 'planat' })]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/parent "planat".*no layer with that name.*"planet"/s));
      const inner = (comp.target as any).children[0];
      expect(inner.children).toContain(find(comp, 'a').target);
    });

    it('a parent that is not a null layer', async () => {
      const comp = await build([rect('box'), rect('a', { parent: 'box' })]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/parent "box" is a shape layer.*type: 'null'/s));
      expect((find(comp, 'box').target as any).children).not.toContain(find(comp, 'a').target);
    });

    it('a layer that is its own parent, and a cycle', async () => {
      const comp = await build([
        { type: 'null', name: 'a', parent: 'a' } as SequenceSpec,
        { type: 'null', name: 'b', parent: 'c' } as SequenceSpec,
        { type: 'null', name: 'c', parent: 'b' } as SequenceSpec,
      ]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"a".*its own parent/s));
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/cycle/));
      const inner = (comp.target as any).children[0];
      expect(inner.children).toContain(find(comp, 'a').target);          // nothing vanished
    });

    it('a threeD layer cannot have a parent', async () => {
      const comp = await build([{ type: 'null', name: 'rig' } as SequenceSpec, rect('a', { parent: 'rig', threeD: true })]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/threeD.*parent/s));
      expect((find(comp, 'rig').target as any).children).toHaveLength(0);
    });

    it('duplicate null names: the first one wins, and it says so', async () => {
      await build([{ type: 'null', name: 'rig' } as SequenceSpec, { type: 'null', name: 'rig' } as SequenceSpec, rect('a', { parent: 'rig' })]);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/2 layers are named "rig"/));
    });
  });
});
