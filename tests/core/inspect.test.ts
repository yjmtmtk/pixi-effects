import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import { inspectScene } from '../../src/core/inspect';
import { expandTransitions, transitionWindowsOf, carryTransitionWindows } from '../../src/core/Transitions';
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

  it('does not raise issues for faint layers (mid-fade) or for text that is moving across the canvas on purpose', async () => {
    const comp = await scene([
      { type: 'text', name: 'faint', text: 'a', initial: { x: 5000, y: 10, alpha: 0.1 } },                                   // off-canvas but nearly invisible
      { type: 'text', name: 'ticker', text: 'b', initial: { x: 1200, y: 300 }, keyframes: [{ at: 0, to: { x: -400 }, duration: 5 }] },   // x is animated: a marquee
      { type: 'text', name: 'still', text: 'c', initial: { x: 1200, y: 500 } },                                                 // static and cut off: a real problem
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"faint"'))).toBe(false);
    expect(r.issues.some(i => i.includes('"ticker"'))).toBe(false);
    expect(r.issues.some(i => i.includes('"still"') && /cut off/.test(i))).toBe(true);
    expect(r.layers.find(l => l.name === 'ticker')!.moving).toBe(true);
    expect(r.layers.find(l => l.name === 'still')!.moving).toBe(false);
  });

  it('judges overlaps on what is visible: text parked off the canvas, or hidden by its mask, does not overlap anything', async () => {
    const offscreen = await scene([
      { type: 'text', name: 'p1', text: 'a', initial: { x: 5000, y: 100 } },
      { type: 'text', name: 'p2', text: 'b', initial: { x: 5050, y: 100 } },       // 75% of each other, but nobody can see either
    ]);
    expect(inspectScene(offscreen, 0, 0, { width: 1280, height: 720 }).issues.filter(i => /overlap/.test(i))).toEqual([]);

    const masked = await scene([
      { type: 'text', name: 'under', text: 'a', initial: { x: 100, y: 100 },
        mask: { type: '__box', initial: { x: 0, y: 100 } } },                          // only x 0–200 of it shows
      { type: 'text', name: 'beside', text: 'b', initial: { x: 200, y: 100 } },       // raw bounds overlap 50%, visible parts do not
    ]);
    expect(inspectScene(masked, 0, 0, { width: 1280, height: 720 }).issues.filter(i => /overlap/.test(i))).toEqual([]);
  });

  it('an inverted mask is not used to clip (the layer shows everywhere outside the hole)', async () => {
    const comp = await scene([
      { type: 'text', name: 'under', text: 'a', initial: { x: 100, y: 100 }, maskInverted: true,
        mask: { type: '__box', initial: { x: 0, y: 100 } } },
      { type: 'text', name: 'beside', text: 'b', initial: { x: 200, y: 100 } },
    ]);
    expect(inspectScene(comp, 0, 0, { width: 1280, height: 720 }).issues.filter(i => /overlap/.test(i))).toHaveLength(1);
  });

  it('a composition that has not started yet is not inspected', async () => {
    const comp = await scene([
      { type: 'composition', name: 'later', at: 6, width: 1280, height: 720, sequences: [
        { type: 'text', name: 'one', text: 'a', initial: { x: 100, y: 100 } },
        { type: 'text', name: 'two', text: 'b', initial: { x: 100, y: 100 } },
      ] },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.issues).toEqual([]);
    expect(r.layers.filter(l => l.visible)).toHaveLength(0);
  });
});

describe('inspectScene during a transition', () => {
  async function twoScenes(slideText: boolean) {
    const scene2 = (name: string, at: number, x: number) => ({
      type: 'composition', name, at, duration: 3, width: 1280, height: 720,
      sequences: [{ type: 'text', name: name + '-title', text: name, initial: { x, y: 100 } }],
    });
    // Through the same expansion Movie.init runs: it consumes `transitions` (they are gone from the built spec).
    const spec = expandTransitions({
      type: 'composition', width: 1280, height: 720, duration: 10,
      sequences: [scene2('a', 0, 100), scene2('b', 2, slideText ? 1250 : 100)],
      transitions: [{ kind: 'crossfade', from: 'a', to: 'b', at: 2, duration: 1 }],
    } as unknown as CompositionSequenceSpec);
    const comp = new CompositionSequence(spec, root, root);
    await comp.build();
    const tl = gsap.timeline({ paused: true });
    comp.bindTimeline(tl);
    return { comp, tl };
  }

  it('the two scenes overlap by design while the transition runs: no overlap issue between them', async () => {
    const { comp, tl } = await twoScenes(false);
    tl.time(2.5);
    const mid = inspectScene(comp, 75, 2.5, { width: 1280, height: 720 });
    expect(mid.layers.filter(l => l.type === 'text' && l.visible)).toHaveLength(2);   // both scenes are alive
    expect(mid.issues.filter(i => /overlap/.test(i))).toEqual([]);
  });

  it('text pushed off the canvas by a slide / zoom inside the window is not "cut off"', async () => {
    const { comp, tl } = await twoScenes(true);
    tl.time(2.5);
    expect(inspectScene(comp, 75, 2.5, { width: 1280, height: 720 }).issues).toEqual([]);
  });

  it('outside the window the same layout is still checked', async () => {
    const { comp, tl } = await twoScenes(true);
    tl.time(3.5);                                   // scene b only, its title cut by the right edge, transition over
    const after = inspectScene(comp, 105, 3.5, { width: 1280, height: 720 });
    expect(after.issues.some(i => i.includes('b/b-title') && /cut off/.test(i))).toBe(true);
  });

  it('the windows survive the spread Movie.init makes of the expanded spec', () => {
    const expanded = expandTransitions({
      type: 'composition', width: 1280, height: 720, duration: 10,
      sequences: [{ type: 'text', name: 'a', text: 'a', duration: 3 }, { type: 'text', name: 'b', text: 'b', at: 2, duration: 3 }],
      transitions: [{ kind: 'crossfade', from: 'a', to: 'b', at: 2, duration: 1 }],
    } as unknown as CompositionSequenceSpec);
    const copy = carryTransitionWindows(expanded, { ...expanded });
    expect(transitionWindowsOf(copy)).toEqual([{ from: 'a', to: 'b', start: 2, end: 3 }]);
    expect(transitionWindowsOf({})).toEqual([]);
  });
});

describe('inspectScene — scaled to nothing, and moved by a parent', () => {
  const emptyBounds = (seq: { target: unknown }) => {
    (seq.target as { getBounds: () => unknown }).getBounds = () => ({ x: 640, y: 360, width: 0, height: 0 });
  };

  it('text scaled to 0 on purpose (a pop-in starting from nothing) is not reported as "no size"', async () => {
    const comp = await scene([
      { type: 'text', name: 'pop', text: 'a', initial: { x: 640, y: 360, scale: 0 } },
      { type: 'text', name: 'empty', text: 'b', initial: { x: 100, y: 100 } },
    ]);
    const [pop, empty] = comp.layers();
    (pop!.seq.target as { scale: { x: number; y: number } }).scale = { x: 0, y: 0 };
    emptyBounds(pop!.seq);
    emptyBounds(empty!.seq);                                   // zero size WITHOUT a zero scale: a real problem
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"pop"') && /no size/.test(i))).toBe(false);
    expect(r.issues.some(i => i.includes('"empty"') && /no size/.test(i))).toBe(true);
  });

  it('text inside a composition that is moved by keyframes counts as moving (a panned timeline is not "cut off")', async () => {
    const comp = await scene([
      { type: 'composition', name: 'timeline', width: 4000, height: 720,
        keyframes: [{ at: 0, to: { x: -2000 }, duration: 5 }],
        sequences: [{ type: 'text', name: 'far', text: 'x', initial: { x: 3000, y: 100 } }] },
      { type: 'text', name: 'still', text: 'y', initial: { x: 3000, y: 300 } },        // static and off canvas: a real problem
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.layers.find(l => l.path === 'timeline/far')!.moving).toBe(true);
    expect(r.issues.some(i => i.includes('timeline/far'))).toBe(false);
    expect(r.issues.some(i => i.includes('"still"'))).toBe(true);
  });
});

