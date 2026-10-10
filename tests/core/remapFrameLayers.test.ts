import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
// Movie.ts registers a culler plugin when it is imported: the shared mock gets the few names that needs
vi.mock('pixi.js', async () => ({
  ...(await import('../space/mockPixi')).createPixiMock(),
  extensions: { add() {} }, CullerPlugin: class {}, Culler: class {}, Application: class {}, ExtensionType: { LoadParser: 'load-parser' },
}));
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import { collectVideoSequences } from '../../src/core/Movie';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

/** A frame-driven layer like a three.js one: Movie asks it to draw for a time it works out. */
class Frame extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 10; this.intrinsicHeight = 10; }
  async awaitFrameAt(): Promise<void> { /* the test reads what Movie would pass */ }
}
registerSequenceType('__frame', Frame as never);

const shape: CompositionShape = { width: 320, height: 180, duration: 10 };
beforeEach(() => { vi.restoreAllMocks(); });

async function build(stage: Record<string, unknown>) {
  const spec = { type: 'composition', width: 320, height: 180, duration: 10, sequences: [
    { type: 'composition', name: 'stage', width: 320, height: 180, duration: 4, ...stage, sequences: [{ type: '__frame', name: 'f', at: 1, duration: 3 }] },
    { type: '__frame', name: 'outside', at: 1, duration: 3 },
  ] } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, shape, shape);
  await comp.build();
  const tl = createTimeline({ paused: true });
  comp.bindTimeline(tl);
  const out: any[] = [], clocks = new Map<any, () => number>();
  collectVideoSequences(comp, out, clocks);
  return { tl, out, clocks };
}
/** What Movie passes a frame-driven layer: the time of ITS composition minus the layer's own start. */
const localOf = (v: any, t: number, clocks: Map<any, () => number>): number => (clocks.get(v)?.() ?? t) - (v.absoluteStart ?? v.at);

describe('a frame-driven layer (three) inside a composition with its own time', () => {
  it('is asked for the composition\'s local time: at movie 1.5 s of a speed-2 composition the layer (at 1) is 2 s in; outside it is the movie\'s time', async () => {
    const { tl, out, clocks } = await build({ speed: 2 });
    tl.time(1.5);
    const inside = out.find(v => v.spec.name === 'f'), outside = out.find(v => v.spec.name === 'outside');
    expect(localOf(inside, 1.5, clocks)).toBeCloseTo(2, 6);        // local 3 s - the layer's own start 1 s
    expect(localOf(outside, 1.5, clocks)).toBeCloseTo(0.5, 6);     // 1.5 - 1
  });
  it('runs backward with a reversed composition', async () => {
    const { tl, out, clocks } = await build({ speed: -1 });
    tl.time(1);                                                      // local 4 - 1 = 3 s
    expect(localOf(out.find(v => v.spec.name === 'f'), 1, clocks)).toBeCloseTo(2, 6);
    tl.time(2);                                                      // local 2 s
    expect(localOf(out.find(v => v.spec.name === 'f'), 2, clocks)).toBeCloseTo(1, 6);
  });
});
