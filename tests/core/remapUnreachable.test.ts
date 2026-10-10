import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 20; this.intrinsicHeight = 20; }
}
registerSequenceType('__box', Box as never);

const shape: CompositionShape = { width: 320, height: 180, duration: 10 };
/** Build a composition holding one remapped `stage` and return what it warned. */
async function warningsOf(stageExtra: Record<string, unknown>, children: unknown[]): Promise<string[]> {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const spec = { type: 'composition', width: 320, height: 180, duration: 10, sequences: [{ type: 'composition', name: 'stage', duration: 4, width: 320, height: 180, ...stageExtra, sequences: children }] } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, shape, shape);
  await comp.build();
  comp.bindTimeline(createTimeline({ paused: true }));
  const out = warn.mock.calls.map(c => String(c[0]));
  warn.mockRestore();
  return out;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('a child the clock never reaches', () => {
  it('says which layer, where it starts in the composition\'s time and what range the clock covers', async () => {
    const w = await warningsOf({ speed: 0.5 }, [{ type: '__box', name: 'late', at: 3, duration: 1 }]);
    expect(w).toEqual([expect.stringMatching(/layer "late" starts at 3s of layer "stage"'s own time, but its clock only reaches 0–2s \(speed 0\.5\), so it is never visible/)]);
  });
  it('is silent when the layer is inside the range, or the clock runs ahead (speed 2)', async () => {
    expect(await warningsOf({ speed: 2 }, [{ type: '__box', name: 'a', at: 5, duration: 1 }])).toEqual([]);
    expect(await warningsOf({ speed: 0.5 }, [{ type: '__box', name: 'b', at: 1, duration: 1 }])).toEqual([]);
    expect(await warningsOf({ speed: -1 }, [{ type: '__box', name: 'c', at: 0, duration: 1 }])).toEqual([]);
  });
  it('a frozen clock (time held at 1) reaches nothing but 1: a layer before or after is never seen', async () => {
    const freeze = { keyframes: [{ at: 0, from: { time: 1 }, to: { time: 1 }, duration: 4 }] };
    const w = await warningsOf(freeze, [{ type: '__box', name: 'before', at: 0, duration: 0.5 }, { type: '__box', name: 'after', at: 2, duration: 1 }, { type: '__box', name: 'across', at: 0.5, duration: 1 }]);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/layer "before"/);
    expect(w[1]).toMatch(/layer "after"/);
  });

  it('a child that starts exactly where the clock begins to HOLD is on screen for the whole hold: no warning', async () => {
    const hold = { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1 }, { at: 1, to: { time: 1 }, duration: 3 }] };   // 0 -> 1 in a second, then held at 1 for 3 s
    expect(await warningsOf(hold, [{ type: '__box', name: 'held', at: 1, duration: 2 }])).toEqual([]);
    const ramp = { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 2 }, duration: 2, ease: 'power2.out' }, { at: 2, to: { time: 2 }, duration: 2 }] };
    expect(await warningsOf(ramp, [{ type: '__box', name: 'lands', at: 2, duration: 1 }])).toEqual([]);
  });
  it('one mistake, one warning: a child written in the OUTER time (at 5 in a 4 s composition at speed 0.5) is said once', async () => {
    const w = await warningsOf({ speed: 0.5 }, [{ type: '__box', name: 'late', at: 5, duration: 1 }]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/layer "late" starts at 5s/);
  });
});

