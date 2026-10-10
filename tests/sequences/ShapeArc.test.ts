import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
type Call = [string, ...unknown[]];

/** Build an arc layer; `draw()` runs the per-frame redraw and returns the Graphics calls it made. */
async function arc(spec: Record<string, unknown>) {
  const seq = new ShapeSequence({ type: 'shape', shape: 'arc', ...spec } as unknown as SequenceSpec, comp, comp);
  await seq.build();
  const g = seq.target as unknown as Record<string, (...a: unknown[]) => unknown> & { onRender: () => void };
  const calls: Call[] = [];
  for (const m of ['clear', 'moveTo', 'lineTo', 'arc', 'circle', 'closePath', 'fill', 'stroke']) {
    g[m] = (...a: unknown[]) => { calls.push([m, ...a]); return g; };
  }
  const tl = createTimeline({ paused: true });
  seq.bindTimeline(tl, 0);
  const draw = (): Call[] => { calls.length = 0; g.onRender(); return calls.filter(c => c[0] !== 'clear'); };
  return { seq, tl, draw };
}
const RAD = Math.PI / 180;

describe('shape: arc', () => {
  it('a stroke-only arc is an open line: the arc in radians (0° = 3 o\'clock, clockwise) with NO moveTo before it (that left a flat start cap), then stroke with the cap', async () => {
    const { draw } = await arc({ radius: 100, startAngle: -90, endAngle: 90, strokeCap: 'round', initial: { strokeColor: '#ff0000', strokeWidth: 12 } });
    const c = draw();
    expect(c[0]).toEqual(['arc', 0, 0, 100, -90 * RAD, 90 * RAD, false]);
    expect(c.some(x => x[0] === 'moveTo')).toBe(false);
    const stroke = c.find(x => x[0] === 'stroke')!;
    expect(stroke[1]).toMatchObject({ color: '#ff0000', width: 12, cap: 'round' });
    expect(c.some(x => x[0] === 'fill')).toBe(false);
  });

  it('a sweep of 360° or more is a full circle, and an empty sweep draws nothing', async () => {
    const full = await arc({ radius: 50, startAngle: -90, endAngle: 270, initial: { strokeColor: '#fff', strokeWidth: 4 } });
    expect(full.draw().some(x => x[0] === 'circle' && x[3] === 50)).toBe(true);
    const none = await arc({ radius: 50, startAngle: -90, endAngle: -90, initial: { strokeColor: '#fff', strokeWidth: 4 } });
    expect(none.draw().filter(x => x[0] === 'arc' || x[0] === 'circle')).toEqual([]);
  });

  it('a progress ring: animating endAngle redraws the arc from the live value', async () => {
    const { tl, draw } = await arc({ radius: 100, startAngle: -90, endAngle: -90, initial: { strokeColor: '#fff', strokeWidth: 8 },
      keyframes: [{ at: 0, to: { endAngle: 270 }, duration: 2 }] });
    expect(draw().filter(x => x[0] === 'arc')).toEqual([]);
    tl.time(1);                                                       // half way: a half circle
    const half = draw().find(x => x[0] === 'arc')!;
    expect(half[5] as number).toBeCloseTo(90 * RAD, 6);
    tl.time(2);
    expect(draw().some(x => x[0] === 'circle')).toBe(true);
  });

  it('a fill makes a sector (to the centre); innerRadius makes a ring segment (a donut slice)', async () => {
    const pie = (await arc({ radius: 100, startAngle: 0, endAngle: 90, initial: { fillColor: '#00ff00' } })).draw();
    expect(pie.map(c => c[0])).toEqual(['moveTo', 'arc', 'lineTo', 'closePath', 'fill']);
    expect(pie[2]).toEqual(['lineTo', 0, 0]);
    const ring = (await arc({ radius: 100, innerRadius: 60, startAngle: 0, endAngle: 90, initial: { fillColor: '#00ff00' } })).draw();
    expect(ring.map(c => c[0])).toEqual(['moveTo', 'arc', 'lineTo', 'arc', 'closePath', 'fill']);
    expect(ring[3]).toEqual(['arc', 0, 0, 60, 90 * RAD, 0, true]);    // back along the inner edge
  });

  it('a negative sweep (endAngle < startAngle) goes the other way round', async () => {
    const c = (await arc({ radius: 100, startAngle: 0, endAngle: -90, initial: { strokeColor: '#fff', strokeWidth: 4 } })).draw();
    expect(c.find(x => x[0] === 'arc')).toEqual(['arc', 0, 0, 100, 0, -90 * RAD, true]);
  });

  it('strokeCap / strokeJoin work on every shape', async () => {
    const seq = new ShapeSequence({ type: 'shape', shape: 'rect', width: 10, height: 10, strokeJoin: 'round', initial: { strokeColor: '#fff', strokeWidth: 3 } } as unknown as SequenceSpec, comp, comp);
    await seq.build();
    const g = seq.target as unknown as Record<string, (...a: unknown[]) => unknown> & { onRender: () => void };
    const seen: unknown[] = [];
    g.stroke = (o: unknown) => { seen.push(o); return g; };
    g.onRender();
    expect(seen[0]).toMatchObject({ width: 3, join: 'round' });
  });
});
