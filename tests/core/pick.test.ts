import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { Container, Rectangle } from 'pixi.js';
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { registerSequenceType } from '../../src/core/Composition';
import { pickScene, pointInQuad, type AlphaReader } from '../../src/core/pick';
import { createTimeline } from '../../src/core/timelineEngine';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';

/**
 * A stand-in for a Pixi display object with exactly what a hit test reads: where it is (x, y, rotation about its origin, scale), how big it is, `toLocal` (the inverse of that),
 * and, for a round layer, `containsPoint` (what Pixi's Graphics has). The real objects are exercised by tests/films/pick in Chrome.
 */
class Fake extends Container {
  rotation = 0;
  scaleX = 1;
  w = 100; h = 60; round = false;
  toLocal(p: { x: number; y: number }) {
    const dx = p.x - this.x, dy = p.y - this.y, c = Math.cos(-this.rotation), s = Math.sin(-this.rotation);
    return { x: (dx * c - dy * s) / this.scaleX, y: (dx * s + dy * c) / this.scaleX };
  }
  getLocalBounds() { return new Rectangle(0, 0, this.w, this.h); }
  containsPoint(p: { x: number; y: number }) { const r = this.w / 2; return !this.round || Math.hypot(p.x - r, p.y - r) <= r; }
}
class Flat extends Sequence {
  async build(): Promise<void> {
    const s = this.spec as unknown as { x?: number; y?: number; w?: number; h?: number; rotation?: number; round?: boolean };
    const d = new Fake();
    d.x = s.x ?? 0; d.y = s.y ?? 0; d.w = s.w ?? 100; d.h = s.h ?? 60; d.rotation = s.rotation ?? 0; d.round = !!s.round;
    if (!d.round) delete (d as { containsPoint?: unknown }).containsPoint;
    this.target = d as never;
    this.intrinsicWidth = d.w; this.intrinsicHeight = d.h;
  }
}
/** A three layer as far as picking knows it: it answers pickAt(u, v) with a hit or null. */
class ThreeLike extends Flat {
  asked: Array<[number, number]> = [];
  answer: unknown = null;
  planes: Array<{ point: unknown; plane: unknown; at: Array<[number, number]> }> = [];
  pickAt(u: number, v: number) { this.asked.push([u, v]); return this.answer; }
  dragPlane(point: unknown, plane: unknown) { const rec = { point, plane, at: [] as Array<[number, number]> }; this.planes.push(rec); return (u: number, v: number) => { rec.at.push([u, v]); return { point: [u, v, 0], delta: [u * 10, v * 10, 0] }; }; }
}
registerSequenceType('__flat', Flat as never);
registerSequenceType('__threelike', ThreeLike as never);

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function scene(sequences: unknown[]) {
  const spec = { type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, root, root);
  await comp.build();
  comp.bindTimeline(createTimeline({ paused: true }));
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('pickScene: what is under a point of the canvas', () => {
  it('nothing: null; a point inside a layer: its name, path, type and the point in the layer\'s own pixels', async () => {
    const comp = await scene([{ type: '__flat', name: 'a', x: 100, y: 100 }]);
    expect(pickScene(comp, 20, 20)).toEqual([]);
    const [hit] = pickScene(comp, 130, 120);
    expect(hit).toMatchObject({ name: 'a', path: 'a', type: '__flat', kind: 'flat' });
    expect(hit!.local).toEqual({ x: 30, y: 20 });
  });

  it('the layer drawn last is on top: pickScene lists them top first', async () => {
    const comp = await scene([{ type: '__flat', name: 'under', x: 0, y: 0 }, { type: '__flat', name: 'over', x: 50, y: 20 }]);
    expect(pickScene(comp, 70, 40).map((h) => h.name)).toEqual(['over', 'under']);
    expect(pickScene(comp, 10, 10).map((h) => h.name)).toEqual(['under']);
  });

  it('a rotated layer is hit by its own shape, not by the box around it', async () => {
    const comp = await scene([{ type: '__flat', name: 'bar', x: 200, y: 200, w: 200, h: 20, rotation: Math.PI / 4 }]);
    expect(pickScene(comp, 200 + 100 * Math.SQRT1_2, 200 + 100 * Math.SQRT1_2 + 2).map((h) => h.name), 'on the bar').toEqual(['bar']);
    expect(pickScene(comp, 200 + 180, 200 + 5), 'inside the box around it, off the bar').toEqual([]);
  });

  it("a round layer is hit where it is round (the display object's own containsPoint), not at the corners of its box", async () => {
    const comp = await scene([{ type: '__flat', name: 'dot', x: 0, y: 0, w: 100, h: 100, round: true }]);
    expect(pickScene(comp, 50, 50).map((h) => h.name)).toEqual(['dot']);
    expect(pickScene(comp, 4, 4)).toEqual([]);
  });

  it('a layer outside its life, hidden, or at alpha 0 is not under anything', async () => {
    const comp = await scene([
      { type: '__flat', name: 'gone', x: 0, y: 0 },
      { type: '__flat', name: 'faded', x: 0, y: 0 },
      { type: '__flat', name: 'shown', x: 0, y: 0 },
    ]);
    for (const l of comp.layers()) {
      if (l.seq.spec.name === 'gone') (l.seq.target as unknown as { renderable: boolean }).renderable = false;
      if (l.seq.spec.name === 'faded') (l.seq.target as unknown as { alpha: number }).alpha = 0;
    }
    expect(pickScene(comp, 10, 10).map((h) => h.name)).toEqual(['shown']);
  });

  it('a layer inside a nested composition is found by its path; the composition itself is not a hit', async () => {
    const comp = await scene([{ type: 'composition', name: 'group', width: 300, height: 200, duration: 10, sequences: [{ type: '__flat', name: 'leaf', x: 10, y: 10 }] }]);
    const hits = pickScene(comp, 30, 30);
    expect(hits.map((h) => h.path)).toEqual(['group/leaf']);
    expect(hits[0]!.name).toBe('leaf');
  });

  it('only / ignore choose which layers can be hit (by name or by path)', async () => {
    const comp = await scene([{ type: '__flat', name: 'bg', x: 0, y: 0, w: 500, h: 500 }, { type: '__flat', name: 'button', x: 10, y: 10 }]);
    expect(pickScene(comp, 20, 20, { only: ['button'] }).map((h) => h.name)).toEqual(['button']);
    expect(pickScene(comp, 20, 20, { ignore: ['button'] }).map((h) => h.name)).toEqual(['bg']);
    expect(pickScene(comp, 300, 300, { only: ['button'] })).toEqual([]);
  });

  it('naming a group (a nested composition) in only / ignore means everything in it: a card with a label is one target', async () => {
    const comp = await scene([
      { type: '__flat', name: 'bg', x: 0, y: 0, w: 500, h: 500 },
      { type: 'composition', name: 'card', width: 200, height: 100, duration: 10, sequences: [{ type: '__flat', name: 'face', x: 10, y: 10, w: 100, h: 60 }, { type: '__flat', name: 'label', x: 30, y: 20, w: 40, h: 20 }] },
      { type: '__flat', name: 'cardinal', x: 300, y: 300, w: 50, h: 50 },
    ]);
    expect(pickScene(comp, 40, 25, { only: ['card'] }).map((h) => h.path), 'both parts of the card').toEqual(['card/label', 'card/face']);
    expect(pickScene(comp, 40, 25, { ignore: ['card'] }).map((h) => h.path), 'none of it').toEqual(['bg']);
    expect(pickScene(comp, 40, 25, { only: ['card/label'] }).map((h) => h.path), 'a path to one part still works').toEqual(['card/label']);
    expect(pickScene(comp, 320, 320, { only: ['card'] }).map((h) => h.path), '"cardinal" is not in "card"').toEqual([]);
  });

  it('a three layer is asked with the point in 0..1 of its picture; its answer becomes the hit (the object, the point and the distance), and no answer lets the layer below be hit', async () => {
    const comp = await scene([{ type: '__flat', name: 'wall', x: 0, y: 0, w: 400, h: 400 }, { type: '__threelike', name: 'world', x: 0, y: 0, w: 400, h: 200 }]);
    const three = comp.layers().find((l) => l.seq.spec.name === 'world')!.seq as unknown as ThreeLike;
    expect(pickScene(comp, 100, 50).map((h) => h.name), 'the three layer found nothing there: the wall below is hit').toEqual(['wall']);
    expect(three.asked[0]).toEqual([0.25, 0.25]);
    three.answer = { object: 'fox', point: [1, 2, 3], distance: 42 };
    const [hit] = pickScene(comp, 100, 50);
    expect(hit).toMatchObject({ name: 'world', kind: 'three', three: { object: 'fox', point: [1, 2, 3], distance: 42 } });
    expect(pickScene(comp, 100, 300).map((h) => h.name), 'below the three layer\'s picture: not asked').toEqual(['wall']);
  });
});

describe('a three hit can be grabbed: the pointer, in canvas pixels, moves the grabbed point on a plane', () => {
  it('hit.three.grab(plane) maps canvas pixels to the picture of the layer (0..1) for the layer\'s dragPlane, and gives back its answer', async () => {
    const comp = await scene([{ type: '__threelike', name: 'world', x: 100, y: 50, w: 400, h: 200 }]);
    const three = comp.layers()[0]!.seq as unknown as ThreeLike;
    three.answer = { object: 'fox', point: [1, 2, 3], distance: 5 };
    const [hit] = pickScene(comp, 200, 100);
    const grab = hit!.three!.grab!('floor');
    expect(three.planes[0]).toMatchObject({ point: [1, 2, 3], plane: 'floor' });
    expect(grab.move(300, 150)).toEqual({ point: [0.5, 0.5, 0], delta: [5, 5, 0] });         // (300, 150) is the middle of the layer: 0.5, 0.5
    expect(three.planes[0]!.at).toEqual([[0.5, 0.5]]);
    expect(hit!.three!.grab!().move(100, 50)).toEqual({ point: [0, 0, 0], delta: [0, 0, 0] });   // no plane named: the screen plane
    expect(three.planes[1]!.plane).toBe('screen');
  });
});

describe('pointInQuad: the projected card of a threeD layer', () => {
  const quad = [0, 0, 100, 10, 90, 100, 5, 80];                          // TL, TR, BR, BL: a slightly skewed card
  it('inside, outside and on the right side of each edge', () => {
    expect(pointInQuad(quad, 50, 50)).toBe(true);
    expect(pointInQuad(quad, 98, 90)).toBe(false);
    expect(pointInQuad(quad, -5, 40)).toBe(false);
    expect(pointInQuad(quad, 50, 105)).toBe(false);
  });
  it('a card seen from behind (the corners the other way round) is hit too', () => {
    const back = [100, 10, 0, 0, 5, 80, 90, 100];
    expect(pointInQuad(back, 50, 50)).toBe(true);
    expect(pointInQuad(back, 120, 50)).toBe(false);
  });
});

describe('pickScene with { alpha }: a transparent part of a picture is not the picture', () => {
  /** A picture layer: a display object with a texture (frame, source resolution, a resource) as a Sprite has. The reader is the test's: it says how opaque the resource is at a pixel. */
  class Picture extends Flat {
    async build(): Promise<void> {
      await super.build();
      const d = this.target as unknown as Fake & { texture?: unknown };
      d.texture = { frame: { x: 0, y: 0, width: 100, height: 60 }, source: { resolution: 2, resource: { tag: 'resource' } } };
    }
  }
  registerSequenceType('__picture', Picture as never);
  const calls: Array<{ x: number; y: number }> = [];
  // the left half of the 200 x 120 pixel resource (resolution 2) is transparent, the right half opaque
  const reader: AlphaReader = (_resource, px, py) => { calls.push({ x: px, y: py }); return px < 100 ? 0 : 1; };

  it('without the option nothing is read: the box is the picture', async () => {
    calls.length = 0;
    const comp = await scene([{ type: '__picture', name: 'logo', x: 0, y: 0 }]);
    expect(pickScene(comp, 10, 30, {}, { readAlpha: reader }).map((h) => h.name)).toEqual(['logo']);
    expect(calls).toHaveLength(0);
  });

  it('with it, a pixel at or below the threshold is not a hit and one above it is; the resource pixel is found through the frame and the source resolution', async () => {
    calls.length = 0;
    const comp = await scene([{ type: '__flat', name: 'under', x: 0, y: 0, w: 300, h: 300 }, { type: '__picture', name: 'logo', x: 0, y: 0 }]);
    expect(pickScene(comp, 10, 30, { alpha: 0.1 }, { readAlpha: reader }).map((h) => h.name), 'on the transparent half: the layer below').toEqual(['under']);
    expect(pickScene(comp, 70, 30, { alpha: 0.1 }, { readAlpha: reader }).map((h) => h.name), 'on the opaque half').toEqual(['logo', 'under']);
    expect(calls[1]).toEqual({ x: 140, y: 60 });                               // (70, 30) in a 100 x 60 box is (140, 60) in a resource of twice the pixels
    expect(pickScene(comp, 70, 30, { alpha: 1 }, { readAlpha: reader }).map((h) => h.name), 'alpha 1: nothing is opaque enough (> 1)').toEqual(['under']);
  });

  it('a layer whose picture cannot be read stays a hit, and the page is told once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await scene([{ type: '__picture', name: 'logo', x: 0, y: 0 }]);
    const blind: AlphaReader = () => null;
    expect(pickScene(comp, 10, 30, { alpha: 0.1 }, { readAlpha: blind }).map((h) => h.name)).toEqual(['logo']);
    pickScene(comp, 10, 30, { alpha: 0.1 }, { readAlpha: blind });
    expect(warn.mock.calls.filter((c) => /alpha/.test(String(c[0])))).toHaveLength(1);
  });

  it("a shader layer is decided by its box (its WebGL picture cannot be read back safely)", async () => {
    const comp = await scene([{ type: '__picture', name: 'plain', x: 0, y: 0 }]);
    comp.layers()[0]!.seq.spec = { ...comp.layers()[0]!.seq.spec, type: 'shader' } as never;
    expect(pickScene(comp, 10, 30, { alpha: 0.1 }, { readAlpha: reader }).map((h) => h.name)).toEqual(['plain']);
  });

  it('a layer with no texture (a shape, a group) is decided as before; a bad alpha is said', async () => {
    const comp = await scene([{ type: '__flat', name: 'box', x: 0, y: 0 }]);
    expect(pickScene(comp, 10, 10, { alpha: 0.5 }, { readAlpha: reader }).map((h) => h.name)).toEqual(['box']);
    expect(() => pickScene(comp, 10, 10, { alpha: 2 })).toThrow(/alpha.*0.*1/);
  });
});
