import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import { inspectScene } from '../../src/core/inspect';
import { groupIssues, splitIssues } from '../../src/core/review';
import { expandTransitions, transitionWindowsOf, carryTransitionWindows } from '../../src/core/Transitions';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }
}
registerSequenceType('__box', Box as never);

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function scene(sequences: unknown[]) {
  const spec = { type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, root, root);
  await comp.build();
  comp.bindTimeline(createTimeline({ paused: true }));
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); });

class Gpu extends Box { renderer: string | null = 'webgpu'; backend: string | null = 'webgl2'; }
class Gl extends Box { renderer: string | null = 'webgl'; backend: string | null = 'webgl'; }
registerSequenceType('__gpu', Gpu as never);
registerSequenceType('__gl', Gl as never);

describe('inspectScene: the renderer of a three.js-based layer', () => {
  it('a layer that says which renderer and backend it drew with (three, model) has them in its info; others have neither', async () => {
    const comp = await scene([{ type: '__gpu', name: 'g' }, { type: '__gl', name: 'w' }, { type: '__box', name: 'b' }]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    const by = (n: string) => r.layers.find((l) => l.name === n)!;
    expect([by('g').renderer, by('g').backend]).toEqual(['webgpu', 'webgl2']);
    expect([by('w').renderer, by('w').backend]).toEqual(['webgl', 'webgl']);
    expect(by('b').renderer).toBeUndefined();
    expect('backend' in by('b')).toBe(false);
  });
});

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

  describe('a picture that crosses text (a shape or an image, not text)', () => {
    // in this mock every layer's box is 200 x 100 at its x / y, whatever width / height it is given
    const rect = (name: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
      ({ type: 'shape', shape: 'rect', name, width: 10, height: 10, initial: { x, y, fillColor: '#ff0000' }, ...extra });
    const text = { type: 'text', name: 'label', text: 'a', initial: { x: 100, y: 100 } };
    const crossing = (issues: string[]) => issues.filter(i => /\boverlap\b/.test(i) && i.includes('"label"') && !/text layers/.test(i));
    const run = async (layers: unknown[]) => crossing(inspectScene(await scene(layers), 0, 0, { width: 1280, height: 720 }).issues);

    it('flags an opaque shape that covers part of the text, naming both layers and how much (an "overlap" kind: a review item, not a failure)', async () => {
      const [msg] = await run([text, rect('card', 150, 100)]);
      expect(msg).toContain('"card"');
      expect(msg).toContain('"label"');
      expect(msg).toMatch(/\boverlap\b/);
      expect(msg).toMatch(/75%/);
    });

    it('flags only an OPAQUE shape drawn OVER the text: under the text it is a shadow or a card, which is on purpose', async () => {
      expect((await run([text, rect('card', 150, 100)]))[0]).toMatch(/drawn over it/);
      expect(await run([rect('card', 150, 100), text])).toEqual([]);
    });

    it('is silent for a backdrop that holds the text (the same box), a shape somewhere else, a faint one, a blended or filtered one (a glow), a stroke-only ring, a path, and a text inside its own group', async () => {
      expect(await run([rect('panel', 100, 100), text])).toEqual([]);                                  // the box of the text is the box of the panel: it holds it
      expect(await run([text, rect('far', 700, 400)])).toEqual([]);
      expect(await run([text, rect('ghost', 150, 100, { initial: { x: 150, y: 100, fillColor: '#f00', alpha: 0.5 } })])).toEqual([]);
      expect(await run([text, rect('glow', 150, 100, { blendMode: 'screen' })])).toEqual([]);
      expect(await run([text, { type: 'shape', shape: 'circle', name: 'ring', radius: 10, initial: { x: 150, y: 100, strokeColor: '#fff', strokeWidth: 2 } }])).toEqual([]);
      expect(await run([text, { type: 'shape', shape: 'path', name: 'curve', d: 'M 0 0 L 400 400', initial: { x: 150, y: 100, fillColor: '#fff' } }])).toEqual([]);
      const comp = await scene([{ type: 'composition', name: 'group', width: 400, height: 300, sequences: [text] }]);
      expect(inspectScene(comp, 0, 0, { width: 1280, height: 720 }).issues).toEqual([]);
    });

    it('judges "over" and "under" by the real draw order: a backdrop parented to a null is still drawn where the null is, and a cover parented to a null can be over the text', async () => {
      // layers() lists the layers of a null last; the picture is drawn in the order of the tree
      const under = await run([{ type: 'null', name: 'rig', initial: { x: 0, y: 0 } }, rect('bg', 150, 100, { parent: 'rig' }), text]);
      expect(under).toEqual([]);                                              // the bg is drawn BEFORE the text (the null is first): under it
      const over = await run([{ type: 'null', name: 'rig', initial: { x: 0, y: 0 } }, { ...text, parent: 'rig' }, rect('cover', 150, 100, { parent: 'rig' })]);      // both in the null, the cover after the text
      expect(over[0]).toMatch(/"cover"/);
    });

    it('an opaque box over the WHOLE text is reported too (the worst case: nothing of it is seen)', async () => {
      const [msg] = await run([text, rect('curtain', 100, 100)]);
      expect(msg).toMatch(/"curtain".*100%/);
    });

    it('a cover inside a group that is almost transparent is not opaque', async () => {
      const comp = await scene([text, { type: 'composition', name: 'veil', width: 400, height: 300, initial: { alpha: 0.2 }, sequences: [rect('card', 150, 100)] }]);
      expect(crossing(inspectScene(comp, 0, 0, { width: 1280, height: 720 }).issues)).toEqual([]);
    });

    it('goes to the review list with the other overlaps, and fails only under --strict', async () => {
      const issues = inspectScene(await scene([text, rect('card', 150, 100)]), 0, 0, { width: 1280, height: 720 }).issues;
      const { problems, review } = splitIssues(groupIssues([{ frame: 0, issues }]));
      expect(problems).toEqual([]);
      expect(review).toHaveLength(1);
      expect(splitIssues(groupIssues([{ frame: 0, issues }]), true).problems).toHaveLength(1);
    });
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

  it('a layer is "moving" only while a KEYFRAME that animates its geometry is running: an x in initial plus a fade is a still layer, and a cut-off one is reported', async () => {
    const comp = await scene([
      { type: 'text', name: 'fading', text: 'a', initial: { x: 1200, y: 100 }, keyframes: [{ at: 0, to: { alpha: 0.9 }, duration: 0.6 }] },
      { type: 'text', name: 'from', text: 'b', initial: { y: 300 }, keyframes: [{ at: 0, from: { x: 1500 }, to: { x: 100 }, duration: 2 }] },
      { type: 'text', name: 'set', text: 'c', initial: { x: 1200, y: 500 }, keyframes: [{ at: 0, set: { x: 1200 } }] },
    ]);
    const r = inspectScene(comp, 30, 1, { width: 1280, height: 720 });
    expect(r.layers.find(l => l.name === 'fading')!.moving).toBe(false);
    expect(r.issues.some(i => i.includes('"fading"') && /cut off/.test(i))).toBe(true);
    expect(r.layers.find(l => l.name === 'from')!.moving).toBe(true);        // a tween of x is running at 1 s
    expect(r.layers.find(l => l.name === 'set')!.moving).toBe(false);        // a `set` is instant: there is no motion, and it sits cut off
    expect(r.issues.some(i => i.includes('"set"') && /cut off/.test(i))).toBe(true);
  });

  it('the commonest entrance, a rise + fade, is exempt only while it runs; once it has settled a title that is wider than the canvas is reported', async () => {
    const comp = await scene([
      { type: 'text', name: 'title', text: 'a', initial: { x: 1200, y: 100 }, keyframes: [{ at: 0.5, to: { y: 100, alpha: 1 }, duration: 0.5 }] },       // (the mock timeline does not run: the bounds are the initial ones)
    ]);
    const during = inspectScene(comp, 0, 0.75, { width: 1280, height: 720 });
    expect(during.layers[0]!.moving).toBe(true);
    expect(during.issues.some(i => /cut off/.test(i))).toBe(false);
    const before = inspectScene(comp, 0, 0.2, { width: 1280, height: 720 });        // not started yet
    expect(before.layers[0]!.moving).toBe(false);
    const after = inspectScene(comp, 0, 2, { width: 1280, height: 720 });
    expect(after.layers[0]!.moving).toBe(false);
    expect(after.issues.some(i => /"title".*cut off/.test(i))).toBe(true);
  });

  it('a slide that leaves the canvas and stays parked there is not "entirely outside" (an exit), but a text that stops half cut off is reported', async () => {
    const comp = await scene([
      { type: 'text', name: 'exit', text: 'a', initial: { x: 5000, y: 100 }, keyframes: [{ at: 0, to: { x: 5000 }, duration: 1 }] },
      { type: 'text', name: 'stops', text: 'b', initial: { x: 1200, y: 300 }, keyframes: [{ at: 0, to: { x: 1200 }, duration: 1 }] },
      { type: 'text', name: 'parked', text: 'c', initial: { x: 5000, y: 500 } },       // never moved: really outside
    ]);
    const r = inspectScene(comp, 0, 3, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"exit"'))).toBe(false);
    expect(r.issues.some(i => i.includes('"stops"') && /cut off/.test(i))).toBe(true);
    expect(r.issues.some(i => i.includes('"parked"') && /outside the canvas/.test(i))).toBe(true);
  });

  it('a layer that waits outside the canvas until its entrance starts (a score bug above the top, a robot at the left) is not "entirely outside"; the same text with no motion is', async () => {
    const comp = await scene([
      { type: 'text', name: 'waits', text: 'a', initial: { x: 5000, y: 100 }, keyframes: [{ at: 2, to: { x: 600 }, duration: 0.5 }] },        // enters at 2 s
      { type: 'text', name: 'never', text: 'b', initial: { x: 5000, y: 300 } },
    ]);
    const r = inspectScene(comp, 0, 0.1, { width: 1280, height: 720 });
    expect(r.layers.find(l => l.name === 'waits')!.moving).toBe(false);                      // it is not moving yet ...
    expect(r.issues.some(i => i.includes('"waits"'))).toBe(false);                            // ... but it is waiting for its entrance, not lost
    expect(r.issues.some(i => i.includes('"never"') && /outside the canvas/.test(i))).toBe(true);
  });

  it('a spring entrance (duration auto) is exempt only until it settles, then a cut-off title is reported', async () => {
    const comp = await scene([
      { type: 'text', name: 'pop', text: 'a', initial: { x: 1200, y: 100 }, keyframes: [{ at: 0, from: { scale: 0.5 }, to: { scale: 1 }, duration: 'auto', ease: 'spring(1,170,12)' }] },
    ]);
    expect(inspectScene(comp, 0, 0.2, { width: 1280, height: 720 }).layers[0]!.moving).toBe(true);        // still springing
    const rest = inspectScene(comp, 0, 3, { width: 1280, height: 720 });                                     // a 1,170,12 spring settles in about a second
    expect(rest.layers[0]!.moving).toBe(false);
    expect(rest.issues.some(i => /"pop".*cut off/.test(i))).toBe(true);
  });

  it('a camera is motion only while one of its keyframes tweens something: a camera that has moved and rests, or one that only `set`s a value, carries nothing', async () => {
    const cam = (keyframes: unknown[]) => scene([
      { type: 'camera', name: 'cam', keyframes },
      { type: 'text', name: 'plane', text: 'a', threeD: true, initial: { x: 1200, y: 100 } },
    ]);
    const during = inspectScene(await cam([{ at: 0, to: { x: 1800 }, duration: 0.5 }]), 0, 0.2, { width: 1280, height: 720 });
    expect(during.layers[0]!.moving).toBe(true);
    const rested = inspectScene(await cam([{ at: 0, to: { x: 1800 }, duration: 0.5 }]), 0, 3, { width: 1280, height: 720 });
    expect(rested.layers[0]!.moving).toBe(false);
    const setOnly = inspectScene(await cam([{ at: 0, set: { fov: 50 } }]), 0, 0.2, { width: 1280, height: 720 });
    expect(setOnly.layers[0]!.moving).toBe(false);
  });

  it('waiting for an entrance is judged by a TRANSLATION tween (x, y, z): a layer put off the canvas by a typo whose only motion is a scale pop is still "entirely outside"', async () => {
    const comp = await scene([
      { type: 'text', name: 'typo', text: 'a', initial: { x: 6400, y: 100 }, keyframes: [{ at: 0, to: { scale: 1.1 }, duration: 0.4 }] },
      { type: 'text', name: 'enters', text: 'b', initial: { x: 6400, y: 300 }, keyframes: [{ at: 2, to: { x: 600 }, duration: 0.5 }] },
    ]);
    const r = inspectScene(comp, 0, 3, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"typo"') && /outside the canvas/.test(i))).toBe(true);
    expect(r.issues.some(i => i.includes('"enters"'))).toBe(false);
  });

  it('a zoom, a spin or a fly-through is motion too: scale, scaleX, rotation, z, anchor and pivot keyframes count, in the layer and in a composition that carries it', async () => {
    const comp = await scene([
      { type: 'text', name: 'zoom', text: 'a', initial: { x: 1200, y: 100 }, keyframes: [{ at: 0, to: { scale: 4 }, duration: 2 }] },
      { type: 'text', name: 'fly', text: 'b', threeD: true, initial: { x: 1200, y: 200 }, keyframes: [{ at: 0, to: { z: 800 }, duration: 2 }] },
      { type: 'text', name: 'pivot', text: 'c', initial: { x: 1200, y: 300 }, keyframes: [{ at: 0, to: { pivotX: 50 }, duration: 2 }] },
      { type: 'composition', name: 'scene', width: 1280, height: 720, keyframes: [{ at: 0, to: { scale: 3 }, duration: 2 }],
        sequences: [{ type: 'text', name: 'inner', text: 'd', initial: { x: 1200, y: 400 } }] },
    ]);
    const r = inspectScene(comp, 0, 1, { width: 1280, height: 720 });
    for (const n of ['zoom', 'fly', 'pivot', 'scene/inner']) expect(r.layers.find(l => l.path === n)!.moving, n).toBe(true);
    expect(r.issues.filter(i => /cut off|outside/.test(i))).toEqual([]);
  });

  it('a camera that moves carries every threeD layer with it (a pan is not "cut off"); a still camera does not', async () => {
    const moving = await scene([
      { type: 'camera', name: 'cam', keyframes: [{ at: 0, to: { x: 1800 }, duration: 2 }] },
      { type: 'text', name: 'plane', text: 'a', threeD: true, initial: { x: 1200, y: 100 }, keyframes: [{ at: 0, to: { alpha: 0.9 }, duration: 0.5 }] },
    ]);
    const a = inspectScene(moving, 0, 1, { width: 1280, height: 720 });
    expect(a.layers.find(l => l.name === 'plane')!.moving).toBe(true);
    expect(a.issues.some(i => /"plane"/.test(i))).toBe(false);
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
      { type: 'text', name: 'under', text: 'a', initial: { x: 100, y: 100 },
        mask: { layer: { type: '__box', initial: { x: 0, y: 100 } }, invert: true } },
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
    const tl = createTimeline({ paused: true });
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

  it('inside a remapped composition the window is read in ITS time: outer 5 s at 0.5x is local 2.5 s, inside the 2–3 s window', async () => {
    const scene2 = (name: string, at: number) => ({
      type: 'composition', name, at, duration: 3, width: 1280, height: 720,
      sequences: [{ type: 'text', name: name + '-title', text: name, initial: { x: 100, y: 100 } }],
    });
    const spec = expandTransitions({
      type: 'composition', width: 1280, height: 720, duration: 10, speed: 0.5,
      sequences: [scene2('a', 0), scene2('b', 2)],
      transitions: [{ kind: 'crossfade', from: 'a', to: 'b', at: 2, duration: 1 }],
    } as unknown as CompositionSequenceSpec);
    const comp = new CompositionSequence(spec, root, root);
    await comp.build();
    const tl = createTimeline({ paused: true });
    comp.bindTimeline(tl);
    tl.time(5);
    const mid = inspectScene(comp, 150, 5, { width: 1280, height: 720 });
    expect(mid.layers.filter(l => l.type === 'text' && l.visible)).toHaveLength(2);   // both scenes alive at local 2.5 s
    expect(mid.issues.filter(i => /overlap/.test(i))).toEqual([]);                    // the two scenes are blending: no overlap issue
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

  it('a typewriter that has not typed anything yet (visibleChars 0) is not reported as "no size"', async () => {
    const comp = await scene([
      { type: 'text', name: 'typing', text: 'hello', initial: { x: 100, y: 100, visibleChars: 0 } },
      { type: 'text', name: 'empty', text: 'b', initial: { x: 100, y: 100 } },
    ]);
    const [typing, empty] = comp.layers();
    emptyBounds(typing!.seq);
    emptyBounds(empty!.seq);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.issues.some(i => i.includes('"typing"') && /no size/.test(i))).toBe(false);
    expect(r.issues.some(i => i.includes('"empty"') && /no size/.test(i))).toBe(true);
  });

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

describe('inspectScene — layers inside a null layer', () => {
  it('lists the children and not the null; a null that is moving makes its children count as moving', async () => {
    const comp = await scene([
      { type: 'null', name: 'rig', keyframes: [{ at: 0, to: { x: 400 }, duration: 2 }] },
      { type: 'text', name: 'caption', text: 'hi', parent: 'rig', initial: { x: 1200, y: 10 } },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.layers.map(l => l.name)).toEqual(['caption']);
    expect(r.layers[0]!.moving).toBe(true);
    expect(r.issues.some(i => /cut off|outside/.test(i))).toBe(false);      // crossing the edge on purpose, like a marquee
  });

  it('a null that only fades (an x in its initial, no moving keyframe) does not make its children "moving": a child that sits half a screen right is cut off', async () => {
    const comp = await scene([
      { type: 'null', name: 'rig', initial: { x: 100, y: 100 }, keyframes: [{ at: 0, to: { alpha: 0.9 }, duration: 0.5 }] },
      { type: 'text', name: 'label', text: 'hi', parent: 'rig', initial: { x: 1200, y: 10 } },
    ]);
    const r = inspectScene(comp, 30, 1, { width: 1280, height: 720 });
    expect(r.layers[0]!.moving).toBe(false);
    expect(r.issues.some(i => i.includes('"label"') && /cut off|outside/.test(i))).toBe(true);
  });

  it('a null that has ended hides its children; a null at alpha 0.5 halves theirs', async () => {
    const comp = await scene([
      { type: 'null', name: 'gone', at: 0, duration: 1 },
      { type: '__box', name: 'a', parent: 'gone' },
      { type: 'null', name: 'dim', initial: { alpha: 0.5 } },
      { type: '__box', name: 'b', parent: 'dim', initial: { alpha: 0.5 } },
    ]);
    comp._children.find(c => c.spec.name === 'gone')!.target!.renderable = false;
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.layers.find(l => l.name === 'a')!.visible).toBe(false);
    expect(r.layers.find(l => l.name === 'b')!.alpha).toBeCloseTo(0.25, 9);
  });
});

describe('inspectScene — depth of field', () => {
  it('reports the blur of each threeD layer (0 on the focal layer, more behind it) and nothing for a 2D layer', async () => {
    const comp = await scene([
      { type: 'camera', initial: { focus: 'front', aperture: 60 } },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
      { type: '__box', name: 'flat' },
    ]);
    comp.updateSpace(0, { render: () => {} } as never);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    const by = Object.fromEntries(r.layers.map(l => [l.name, l.depthBlur]));
    expect(by.front).toBe(0);
    expect(by.back).toBeCloseTo(8.64, 1);
    expect(by.flat).toBeUndefined();
  });
});

describe('inspectScene — a layer used as a matte', () => {
  it('is not in the layer list (it is not drawn), so it is never reported as off-canvas, overlapping or with no size', async () => {
    const comp = await scene([
      { type: 'text', name: 'matte', text: 'I', initial: { x: 5000, y: 10 } },
      { type: '__box', name: 'photo', mask: 'matte' },
    ]);
    const r = inspectScene(comp, 0, 0, { width: 1280, height: 720 });
    expect(r.layers.map(l => l.name)).toEqual(['photo']);
    expect(r.issues).toEqual([]);
  });
});

describe('inspectScene — light', () => {
  const at0 = (comp: CompositionSequence) => { comp.updateSpace(0, { render: () => {} } as never); return Object.fromEntries(inspectScene(comp, 0, 0, { width: 1280, height: 720 }).layers.map(l => [l.name, l.light])); };
  it('a composition with no light reports no light level at all', async () => {
    const comp = await scene([{ type: '__box', name: 'a', threeD: true }]);
    expect(at0(comp).a).toBeUndefined();
  });
  it('a lit threeD layer reports how lit it is; a lit: false layer, a 2D layer and a layer when no light is alive report none', async () => {
    const comp = await scene([
      { type: 'light', kind: 'ambient', initial: { intensity: 0.25 } },
      { type: 'light', kind: 'ambient', initial: { intensity: 0.25 } },
      { type: '__box', name: 'lit', threeD: true },
      { type: '__box', name: 'unlit', threeD: true, lit: false },
      { type: '__box', name: 'flat' },
    ]);
    const by = at0(comp);
    expect(by.lit).toBe(0.5);
    expect(by.unlit).toBeUndefined();
    expect(by.flat).toBeUndefined();
    const late = await scene([{ type: 'light', kind: 'ambient', at: 5 }, { type: '__box', name: 'lit', threeD: true }]);
    expect(at0(late).lit).toBeUndefined();
  });
});
