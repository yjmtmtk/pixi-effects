import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  const tex = new m.Texture(64, 32);
  (globalThis as { __tex?: unknown }).__tex = tex;
  m.Assets.get = async () => tex;
  return m;
});
import { ImageSequence } from '../../src/sequences/Image';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
const source = () => ((globalThis as unknown as { __tex: { source: { scaleMode?: string } } }).__tex.source);
beforeEach(() => { vi.restoreAllMocks(); source().scaleMode = undefined; });

describe('image scaleMode', () => {
  it("'nearest' draws the pixels as hard squares when the picture is scaled up (pixel art); the picture is not smoothed", async () => {
    await new ImageSequence({ type: 'image', asset: 'sprite', scaleMode: 'nearest' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBe('nearest');
  });

  it("'linear' is the default and is left to the renderer", async () => {
    await new ImageSequence({ type: 'image', asset: 'sprite' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBeUndefined();
    await new ImageSequence({ type: 'image', asset: 'sprite', scaleMode: 'linear' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBe('linear');
  });

  it('another value is said, with the two that work, and ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await new ImageSequence({ type: 'image', name: 'hero', asset: 'sprite', scaleMode: 'crisp' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/hero.*scaleMode.*"crisp".*"nearest".*"linear"/));
  });

  it('a layer that does not ask gets the asset\'s own mode back: the same spec draws the same picture whatever was built before it (a rebuild, a Playground re-run)', async () => {
    await new ImageSequence({ type: 'image', asset: 'sprite', scaleMode: 'nearest' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBe('nearest');
    await new ImageSequence({ type: 'image', asset: 'sprite' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBeUndefined();                              // what the texture had before any layer touched it
    await new ImageSequence({ type: 'image', asset: 'sprite', scaleMode: 'linear' } as unknown as SequenceSpec, comp, comp).build();
    await new ImageSequence({ type: 'image', asset: 'sprite' } as unknown as SequenceSpec, comp, comp).build();
    expect(source().scaleMode).toBeUndefined();
  });
});
