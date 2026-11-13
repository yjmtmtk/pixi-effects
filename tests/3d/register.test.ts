import { describe, it, expect, vi } from 'vitest';

// @pixi/3d needs a GPU-capable PixiJS at import time; the unit test only needs the two classes whose defaults register3D turns off.
vi.mock('@pixi/3d', () => ({
  Model3D: { defaultOptions: { autoUpdate: true, autoPlay: false } },
  AnimationPlayer: { defaultOptions: { autoUpdate: true } },
  View3D: class {},
}));

describe('register3D', () => {
  it('turns off self-updating models and animation players: a video draws from the time, not from a ticker', async () => {
    const { register3D } = await import('../../src/3d/index');
    const p3d = await import('@pixi/3d') as unknown as { Model3D: { defaultOptions: { autoUpdate: boolean } }; AnimationPlayer: { defaultOptions: { autoUpdate: boolean } } };
    register3D();
    expect(p3d.Model3D.defaultOptions.autoUpdate).toBe(false);
    expect(p3d.AnimationPlayer.defaultOptions.autoUpdate).toBe(false);
  });

  it('registers the scene3d layer type, and scene3d() hands the spec back as it is', async () => {
    const { register3D, scene3d, Scene3DSequence } = await import('../../src/3d/index');
    const { buildSequenceTree } = await import('../../src/core/Composition');
    register3D();
    const spec = { type: 'scene3d' as const, setup() {} };
    expect(scene3d(spec)).toBe(spec);
    const build = vi.spyOn(Scene3DSequence.prototype, 'build').mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = { width: 100, height: 100, duration: 1 } as never;
    const built = await buildSequenceTree([scene3d(spec)], root, root);
    expect(build).toHaveBeenCalledTimes(1);
    expect(built[0]).toBeInstanceOf(Scene3DSequence);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/unknown sequence type/);
    build.mockRestore(); warn.mockRestore();
  });
});
