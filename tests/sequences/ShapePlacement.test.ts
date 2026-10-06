import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { Graphics, Rectangle } from 'pixi.js';
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: unknown) => new ShapeSequence({ type: 'shape', ...(spec as object) } as SequenceSpec, comp, comp);
async function placed(spec: unknown, bounds: Rectangle) {
  vi.spyOn(Graphics.prototype, 'getLocalBounds').mockReturnValue(bounds as never);
  const s = make(spec);
  await s.build();
  s.bindTimeline(gsap.timeline({ paused: true }), 0);
  const g = s.target as unknown as { x: number; y: number };
  return { x: g.x, y: g.y };
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('line / polygon / path without x, y are drawn where their points say (absolute coordinates)', () => {
  it('a line from (100,100) to (300,100) sits at its midpoint (200,100) — not around (0,0)', async () => {
    expect(await placed({ shape: 'line', from: [100, 100], to: [300, 100], initial: { strokeColor: '#fff', strokeWidth: 2 } }, new Rectangle(100, 99, 200, 2)))
      .toEqual({ x: 200, y: 100 });
  });

  it('a polygon and a path are placed at the centre of their bounds', async () => {
    expect(await placed({ shape: 'polygon', points: [[10, 10], [110, 10], [60, 90]], initial: { fillColor: '#f00' } }, new Rectangle(10, 10, 100, 80)))
      .toEqual({ x: 60, y: 50 });
    expect(await placed({ shape: 'path', d: 'M0 0 L50 0 L50 50 Z', initial: { fillColor: '#f00' } }, new Rectangle(0, 0, 50, 50)))
      .toEqual({ x: 25, y: 25 });
  });

  it('an explicit initial x / y still positions the midpoint (existing behaviour), each axis independently', async () => {
    expect(await placed({ shape: 'line', from: [-50, 0], to: [50, 0], initial: { x: 640, y: 360, strokeColor: '#fff', strokeWidth: 2 } }, new Rectangle(-50, -1, 100, 2)))
      .toEqual({ x: 640, y: 360 });
    expect(await placed({ shape: 'line', from: [100, 100], to: [300, 100], initial: { x: 5, strokeColor: '#fff', strokeWidth: 2 } }, new Rectangle(100, 99, 200, 2)))
      .toEqual({ x: 5, y: 100 });
  });

  it('rect / circle / ellipse are unchanged: they stay at 0,0 until x, y are given', async () => {
    expect(await placed({ shape: 'rect', width: 10, height: 10 }, new Rectangle(-5, -5, 10, 10))).toEqual({ x: 0, y: 0 });
  });
});
