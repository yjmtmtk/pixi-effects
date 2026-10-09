import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('matte warnings are said at build, once per layer', () => {
  it('a name nobody has says what was meant', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([
      { type: 'shape', shape: 'circle', radius: 10, name: 'disc' },
      { type: 'text', text: 'a', name: 'title', mask: 'dsic' },
    ]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('mask "dsic"'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('layer "title"');
    expect(said[0]).toContain('did you mean "disc"?');
  });
});
