import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

// A composition's own clock, two more ways: `frameRate` (its content steps, After Effects' Posterize Time) and `loop` (its content repeats).
class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 20; this.intrinsicHeight = 20; }
}
registerSequenceType('__box', Box as never);

const shape: CompositionShape = { width: 320, height: 180, duration: 10, frameRate: 30 };
// a box that moves x 0 → 100 over its composition's first second
const mover = { type: '__box', name: 'm', keyframes: [{ at: 0, from: { x: 0 }, to: { x: 100 }, duration: 1 }] };

async function stage(extra: Record<string, unknown>, children: unknown[] = [mover]) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const spec = { type: 'composition', width: 320, height: 180, duration: 10, sequences: [{ type: 'composition', name: 'stage', at: 1, duration: 6, width: 320, height: 180, ...extra, sequences: children }] } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, shape, shape);
  await comp.build();
  const tl = createTimeline({ paused: true });
  comp.bindTimeline(tl);
  const st = comp.childLayers[0] as CompositionSequence;
  const xAt = (t: number) => { tl.time(t); return (st.childLayers[0]!.target as unknown as { x: number }).x; };
  const warnings = warn.mock.calls.map(c => String(c[0]));
  warn.mockRestore();
  return { xAt, warnings, st };
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('frameRate: the content steps', () => {
  it('frameRate 4: the content moves only every quarter second (the time inside is held on a step), the composition itself is not stepped', async () => {
    const { xAt, warnings } = await stage({ frameRate: 4 });
    expect(warnings).toEqual([]);
    expect(xAt(1 + 0.1)).toBeCloseTo(0, 5);
    expect(xAt(1 + 0.3)).toBeCloseTo(25, 5);
    expect(xAt(1 + 0.49)).toBeCloseTo(25, 5);
    expect(xAt(1 + 0.5)).toBeCloseTo(50, 5);
    expect(xAt(1 + 0.8)).toBeCloseTo(75, 5);
  });
  it('steps a remapped clock too (speed 2 at frameRate 4: half-second steps of the content)', async () => {
    const { xAt } = await stage({ frameRate: 4, speed: 2 });
    expect(xAt(1 + 0.2)).toBeCloseTo(0, 5);                         // the steps are on the screen's clock (4 pictures a second): 0.2 s in is still the first step
    expect(xAt(1 + 0.3)).toBeCloseTo(50, 5);                        // movie 0.25 s into it → local 0.5
  });
  it('a frameRate the movie already has (or more), zero or negative is said and ignored', async () => {
    expect((await stage({ frameRate: 30 })).warnings[0]).toMatch(/frameRate 30 is not below the movie's 30 frames a second: it changes nothing/);
    expect((await stage({ frameRate: 0 })).warnings[0]).toMatch(/frameRate must be a number of frames a second above 0/);
  });
});

describe('loop: the content repeats', () => {
  it('loop: true repeats what happens inside (here the 1 s move) for as long as the composition lasts', async () => {
    const { xAt, warnings } = await stage({ loop: true });
    expect(warnings).toEqual([]);
    expect(xAt(1 + 0.5)).toBeCloseTo(50, 5);
    expect(xAt(1 + 1.5)).toBeCloseTo(50, 5);
    expect(xAt(1 + 4.25)).toBeCloseTo(25, 5);
  });
  it('loop: 2 repeats the first 2 seconds of the content', async () => {
    const { xAt } = await stage({ loop: 2 });
    expect(xAt(1 + 1.5)).toBeCloseTo(100, 5);                       // the move is over, still inside the 2 s
    expect(xAt(1 + 2.5)).toBeCloseTo(50, 5);
  });
  it('loop and frameRate together: a stepped loop', async () => {
    const { xAt } = await stage({ loop: true, frameRate: 4 });
    expect(xAt(1 + 1.3)).toBeCloseTo(25, 5);
  });
  it('says when it cannot repeat: the content lasts the whole composition, or a loop length past the end', async () => {
    const whole = [{ type: '__box', name: 'still', duration: 6 }];
    expect((await stage({ loop: true }, whole)).warnings[0]).toMatch(/loop: what happens inside lasts the whole composition \(6s\), so nothing repeats; give the length to repeat: loop: 2/);
    expect((await stage({ loop: 8 })).warnings[0]).toMatch(/loop: 8 is not shorter than the composition \(6s\), so nothing repeats/);
    expect((await stage({ loop: 'yes' })).warnings[0]).toMatch(/loop must be true or a number of seconds/);
  });
});
