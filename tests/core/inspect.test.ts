import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import { inspectScene } from '../../src/core/inspect';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';

class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }
}
registerSequenceType('__box', Box as never);

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function scene(sequences: unknown[]) {
  const spec = { type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, root, root);
  await comp.build();
  comp.bindTimeline(gsap.timeline({ paused: true }));
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('inspectScene', () => {
  it('lists every layer with name, type, visibility and canvas-space bounds', async () => {
    const comp = await scene([
      { type: '__box', name: 'a', initial: { x: 100, y: 50 } },
      { type: 'text', name: 'title', text: 'hi', initial: { x: 300, y: 200 } },
    ]);
    const r = inspectScene(comp, 12, 0.4, { width: 1280, height: 720 });
    expect(r.frame).toBe(12);
    expect(r.time).toBeCloseTo(0.4, 9);
    expect(r.canvas).toEqual({ width: 1280, height: 720 });
    expect(r.layers.map(l => [l.name, l.type])).toEqual([['a', '__box'], ['title', 'text']]);
    expect(r.layers[0]!.bounds).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(r.layers[0]!.visible).toBe(true);
    expect(r.layers[0]!.onCanvas).toBe('full');
    expect(r.issues).toEqual([]);
  });

  it('flags a layer entirely outside the canvas, and a text layer cut off by an edge (with the amount)', async () => {
    const comp = await scene([
      { type: 'text', name: 'gone', text: 'x', initial: { x: 5000, y: 10 } },
      { type: 'text', name: 'cut', text: 'y', initial: { x: 1200, y: 10 } },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"gone"') && /outside the canvas/.test(i))).toBe(true);
    const cut = r.issues.find(i => i.includes('"cut"'))!;
    expect(cut).toMatch(/cut off/);
    expect(cut).toMatch(/120px.*right/);
  });

  it('flags overlapping text layers with the overlap share, but not text over a shape', async () => {
    const comp = await scene([
      { type: 'text', name: 'one', text: 'a', initial: { x: 100, y: 100 } },
      { type: 'text', name: 'two', text: 'b', initial: { x: 150, y: 100 } },
      { type: '__box', name: 'bg', initial: { x: 100, y: 100 } },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    const overlap = r.issues.filter(i => /overlap/.test(i));
    expect(overlap).toHaveLength(1);
    expect(overlap[0]).toContain('"one"');
    expect(overlap[0]).toContain('"two"');
    expect(overlap[0]).toMatch(/75%/);               // 150x100 of the 200x100 boxes
  });

  it('reports hidden layers as not visible and does not raise issues for them', async () => {
    const comp = await scene([{ type: 'text', name: 'later', text: 'z', at: 5, initial: { x: 5000, y: 0 } }]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.layers[0]!.visible).toBe(false);
    expect(r.issues).toEqual([]);
  });

  it('walks nested compositions and gives layers inside a threeD layer no canvas bounds', async () => {
    const comp = await scene([
      { type: 'composition', name: 'group', width: 400, height: 300, sequences: [{ type: '__box', name: 'inner', initial: { x: 20, y: 30 } }] },
      { type: 'composition', name: 'card', width: 400, height: 300, threeD: true, sequences: [{ type: '__box', name: 'inCard' }] },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    const byName = Object.fromEntries(r.layers.map(l => [l.name, l]));
    expect(byName.inner!.path).toBe('group/inner');
    expect(byName.inner!.bounds).not.toBeNull();
    expect(byName.card!.threeD).toBe(true);
    expect(byName.inCard!.bounds).toBeNull();        // rendered into the card's texture: no canvas-space bounds
  });

  it('layers option: "visible" (only layers drawn at this frame) or "none" (just issues + summary); issues come before layers', async () => {
    const comp = await scene([
      { type: '__box', name: 'now', initial: { x: 10, y: 10 } },
      { type: '__box', name: 'later', at: 5 },
    ]);
    const all = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(all.layers).toHaveLength(2);
    expect(all.summary).toEqual({ layers: 2, visible: 1 });
    expect(Object.keys(all).indexOf('issues')).toBeLessThan(Object.keys(all).indexOf('layers'));

    const vis = inspectScene(comp, 0, 0, { width: 1280, height: 720 }, { layers: 'visible' });
    expect(vis.layers.map(l => l.name)).toEqual(['now']);
    expect(vis.summary).toEqual({ layers: 2, visible: 1 });

    const none = inspectScene(comp, 0, 0, { width: 1280, height: 720 }, { layers: 'none' });
    expect(none.layers).toEqual([]);
    expect(none.summary.visible).toBe(1);
  });
});

