import { describe, it, expect, vi } from 'vitest';
import { buildSequenceTree } from '../../src/core/Composition';

// A layer type that lives in an optional entry says which entry to import when it was not registered: an AI that forgot register3D() learns the fix from the warning.
describe('an unregistered layer type of an optional entry names the entry and the call', () => {
  it.each([
    ['scene3d', /unknown sequence type "scene3d": import \{ register3D \} from 'pixi-effects\/3d' and call register3D\(\) before movie\.init/],
    ['three', /unknown sequence type "three": import \{ registerThree \} from 'pixi-effects\/three' and call registerThree\(\) before movie\.init/],
  ])('%s', async (type, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await buildSequenceTree([{ type } as never], root, root);
    expect(warn.mock.calls.flat().join('\n')).toMatch(message);
    warn.mockRestore();
  });

  it('any other unknown type keeps the short sentence', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await buildSequenceTree([{ type: 'sprocket' } as never], root, root);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/unknown sequence type "sprocket"$/m);
    warn.mockRestore();
  });
});
