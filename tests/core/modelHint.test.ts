import { describe, it, expect, vi } from 'vitest';
import { buildSequenceTree } from '../../src/core/Composition';
import type { CompositionShape } from '../../src/types';

// This file never registers an engine (each test file has its own module registry).
const shape: CompositionShape = { width: 100, height: 100, duration: 5 };

describe('a model layer when no 3D engine is registered', () => {
  it('says what to do (register the three.js engine) instead of a bare "unknown sequence type"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await buildSequenceTree([{ type: 'model', asset: 'x.glb' }], shape, shape);
    const text = warn.mock.calls.map((c) => String(c[0])).join('\n');
    warn.mockRestore();
    expect(out).toHaveLength(0);
    expect(text).toMatch(/"model" layer needs a 3D engine/);
    expect(text).toMatch(/registerThree\(\)/);
    expect(text).toMatch(/pixi-effects\/three/);
  });

  it('another unknown type keeps the plain message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await buildSequenceTree([{ type: 'nope' } as never], shape, shape);
    const text = warn.mock.calls.map((c) => String(c[0])).join('\n');
    warn.mockRestore();
    expect(text).toMatch(/unknown sequence type "nope"/);
  });
});
