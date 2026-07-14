import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { registerSequenceType, buildSequenceTree } from '../../src/core/Composition';
import { Sequence } from '../../src/sequences/Base';
import { ShapeSequence } from '../../src/sequences/Shape';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

class FakeSequence extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerSequenceType', () => {
  it('builds registered custom types through buildSequenceTree', async () => {
    registerSequenceType('__test-custom', FakeSequence as never);
    const specs = [{ type: '__test-custom' } as unknown as SequenceSpec];
    const out = await buildSequenceTree(specs, shape, shape);
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(FakeSequence);
    expect(out[0]!.duration).toBe(10); // parent duration default still applies
  });

  it('still warns and skips unknown types', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const specs = [{ type: '__test-unregistered' } as unknown as SequenceSpec];
    const out = await buildSequenceTree(specs, shape, shape);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('__test-unregistered'));
  });

  it('stores the registry on globalThis via Symbol.for so duplicate bundled copies share it', () => {
    registerSequenceType('__test-global', FakeSequence as never);
    const reg = (globalThis as Record<symbol, unknown>)[
      Symbol.for('pixi-effects.sequenceTypes')
    ] as Record<string, unknown>;
    expect(reg['__test-global']).toBe(FakeSequence);
  });

  it('overwrites on re-registration (idempotent double-register is safe)', async () => {
    registerSequenceType('__test-idem', FakeSequence as never);
    registerSequenceType('__test-idem', FakeSequence as never);
    const out = await buildSequenceTree(
      [{ type: '__test-idem' } as unknown as SequenceSpec], shape, shape,
    );
    expect(out).toHaveLength(1);
  });

  it('does not shadow built-in types', async () => {
    // Register a conflicting FakeSequence under the built-in 'shape' key —
    // staticTypes must still win over the registry, so buildSequenceTree
    // should construct a real ShapeSequence, not the FakeSequence.
    // This registration persists on globalThis for the rest of the test
    // process; that's acceptable here precisely because built-ins always
    // win, so the conflicting registration can never actually take effect.
    registerSequenceType('shape', FakeSequence as never);
    const out = await buildSequenceTree(
      [{ type: 'shape', shape: 'rect', width: 10, height: 10 } as SequenceSpec],
      shape, shape,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(ShapeSequence);
    expect(out[0]).not.toBeInstanceOf(FakeSequence);
  });
});
