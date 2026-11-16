import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { Sequence } from '../../src/sequences/Base';
import { lintKeys } from '../../src/core/lint';

// A shape takes `anchorX` / `anchorY` beside its size; text, image and video take them there too now (they warned "write it in initial"),
// one rule for every drawn layer: the top-level value goes into `initial` and wins over one written there.
class Probe extends Sequence { async build(): Promise<void> {} }
const shape = { width: 100, height: 100, duration: 1 } as never;

describe('a top-level anchorX / anchorY on text, image and video', () => {
  it('is a key of those layers (no warning)', () => {
    const said: string[] = [];
    for (const spec of [{ type: 'text', text: 'x', anchorX: 0.5, anchorY: 0.5 }, { type: 'image', asset: 'a', anchorX: 0.5 }, { type: 'video', asset: 'v', anchorY: 1 }]) lintKeys(spec as never, m => said.push(m));
    expect(said).toEqual([]);
  });
  it('goes into initial, and wins over initial', () => {
    const s = new Probe({ type: 'text', text: 'x', anchorX: 0.5, initial: { x: 10, anchorX: 0, anchorY: 1 } } as never, shape, shape);
    expect((s.spec as { initial: Record<string, number> }).initial).toEqual({ x: 10, anchorX: 0.5, anchorY: 1 });
  });
});
