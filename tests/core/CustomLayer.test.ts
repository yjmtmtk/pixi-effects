import { describe, it, expect, vi } from 'vitest';
// the package entry pulls in Movie, which wants the real plugin exports: the mock only replaces what the layer code touches
vi.mock('pixi.js', async (importOriginal) => ({ ...(await importOriginal<object>()), ...(await import('../space/mockPixi')).createPixiMock() }));
import { Container } from 'pixi.js';
import { Sequence, registerSequenceType } from '../../src/index';
import { CompositionSequence } from '../../src/sequences/Composition';
import { createTimeline } from '../../src/core/timelineEngine';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };

describe('a layer type written outside the library, with only what the package exports', () => {
  it('is built into the tree, takes keyframes on its display object and its lifespan, and has awaitFrameAt for the per-frame draw', async () => {
    const drawn: number[] = [];
    class Mine extends Sequence {
      async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }
      async awaitFrameAt(local: number): Promise<void> { drawn.push(local); }
    }
    registerSequenceType('__mine', Mine as never);
    const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, sequences: [
      { type: '__mine', name: 'm', at: 2, duration: 3, initial: { x: 0 }, keyframes: [{ at: 0, to: { x: 100 }, duration: 2, ease: 'none' }] },
    ] } as unknown as SequenceSpec as never, root, root);
    await comp.build();
    const tl = createTimeline({ paused: true });
    comp.bindTimeline(tl);
    const layer = comp._children[0]!;
    expect(layer).toBeInstanceOf(Mine);
    tl.time(1); expect((layer.target as unknown as { renderable: boolean }).renderable).toBe(false);   // before its lifespan
    tl.time(3); expect((layer.target as unknown as { renderable: boolean; x: number }).renderable).toBe(true);
    expect((layer.target as unknown as { x: number }).x).toBeCloseTo(50, 6);
    expect(typeof (layer as unknown as { awaitFrameAt: unknown }).awaitFrameAt).toBe('function');
  });
});
