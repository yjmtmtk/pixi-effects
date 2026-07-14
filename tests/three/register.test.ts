import { describe, it, expect } from 'vitest';
import { mockThreeModule } from './mockThree';
mockThreeModule();

import { registerThree, three } from '../../src/three/index';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import { buildSequenceTree } from '../../src/core/Composition';
import type { CompositionShape } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 5 };

describe('registerThree', () => {
  it('makes buildSequenceTree construct ThreeSequence for type "three"', async () => {
    registerThree();
    const spec = three({ type: 'three', setup: () => {} });
    const out = await buildSequenceTree([spec], shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(ThreeSequence);
  });

  it('is idempotent', async () => {
    registerThree();
    registerThree();
    const out = await buildSequenceTree([three({ type: 'three', setup: () => {} })], shape, shape);
    expect(out).toHaveLength(1);
  });

  it('three() is an identity helper preserving the spec object', () => {
    const spec = { type: 'three' as const, setup: () => {}, at: 1 };
    expect(three(spec)).toBe(spec);
  });
});
