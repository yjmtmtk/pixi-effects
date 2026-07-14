import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from '../../src/sequences/Base';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

class StubSequence extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
  }
}

function makeSeq(at: number): StubSequence {
  const spec = { type: 'shape', shape: 'rect', width: 1, height: 1, at, duration: 2 } as SequenceSpec;
  return new StubSequence(spec, shape, shape);
}

describe('Sequence.absoluteStart', () => {
  it('is null before bindTimeline', async () => {
    const seq = makeSeq(1);
    await seq.build();
    expect(seq.absoluteStart).toBeNull();
  });

  it('records offset + at when bound', async () => {
    const seq = makeSeq(1);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl, 3); // nested composition starting at t=3
    expect(seq.absoluteStart).toBe(4);
    tl.kill();
  });

  it('equals at when bound with no offset', async () => {
    const seq = makeSeq(1.5);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    expect(seq.absoluteStart).toBe(1.5);
    tl.kill();
  });
});
