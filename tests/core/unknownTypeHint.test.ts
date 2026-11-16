import { describe, it, expect, vi } from 'vitest';
import { buildSequenceTree } from '../../src/core/Composition';

// A layer type that lives in an optional entry says which entry to import when it was not registered: an AI that forgot register3D() learns the fix from the warning.
describe('an unregistered layer type of an optional entry names the entry and the call', () => {
  it.each([
    ['scene3d', /unknown layer type "scene3d": import \{ register3D \} from 'pixi-effects\/3d' and call register3D\(\) before movie\.init/],
  ])('%s', async (type, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await buildSequenceTree([{ type } as never], root, root);
    expect(warn.mock.calls.flat().join('\n')).toMatch(message);
    warn.mockRestore();
  });

  it('the removed three layer says what to write instead (an agent trained on older docs writes it)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await buildSequenceTree([{ type: 'three' } as never], root, root);
    const said = warn.mock.calls.flat().join('\n');
    expect(said).toMatch(/the three layer was removed in 0\.52\.0/);
    expect(said).toMatch(/scene3d layer \(PixiJS 3D: import \{ register3D \} from 'pixi-effects\/3d'\)/);
    expect(said).toMatch(/recipe three-in-canvas/);
    warn.mockRestore();
  });

  it('any other unknown type keeps the short sentence', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await buildSequenceTree([{ type: 'sprocket' } as never], root, root);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/unknown layer type "sprocket"$/m);
    warn.mockRestore();
  });

  it('a type other tools use says ours (rect → a shape, group → composition, sprite → image, sound → audio), a typo gets a guess', async () => {
    const say = async (spec: Record<string, unknown>) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = { width: 100, height: 100, duration: 1 } as never;
      await buildSequenceTree([spec as never], root, root);
      const said = warn.mock.calls.flat().join('\n');
      warn.mockRestore();
      return said;
    };
    expect(await say({ type: 'rect' })).toMatch(/unknown layer type "rect" — did you mean type: 'shape', shape: 'rect'\?/);
    expect(await say({ type: 'rectangle' })).toMatch(/did you mean type: 'shape', shape: 'rect'\?/);
    expect(await say({ type: 'group' })).toMatch(/did you mean "composition"\?/);
    expect(await say({ type: 'sprite' })).toMatch(/did you mean "image"\?/);
    expect(await say({ type: 'sound' })).toMatch(/did you mean "audio"\?/);
    expect(await say({ type: 'imgae' })).toMatch(/did you mean "image"\?/);
  });

  it('an unknown shape is said with a guess, and the layer is left out (it used to stop the build with a TypeError)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    await expect(buildSequenceTree([{ type: 'shape', shape: 'rectangle', width: 10, height: 10 } as never], root, root)).resolves.toEqual([]);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/unknown shape "rectangle" — did you mean "rect"\? \(shapes: rect, circle, ellipse, arc, line, polygon, path\)/);
    warn.mockClear();
    await buildSequenceTree([{ type: 'shape', shape: 'oval' } as never], root, root);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/did you mean "ellipse"\?/);
    warn.mockRestore();
  });
});
