import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { Sprite, Texture } from 'pixi.js';
import { MatteFilter } from '../../src/filters/Matte';

const sprite = () => new Sprite(new Texture(64, 36));
const uniformsOf = (f: MatteFilter) => (f.resources.matteUniforms as unknown as { uniforms: Record<string, unknown> }).uniforms;

describe('MatteFilter', () => {
  it('reads alpha by default, not inverted; luma and invert are options', () => {
    expect(uniformsOf(new MatteFilter({ sprite: sprite() })).uLuma).toBe(0);
    expect(uniformsOf(new MatteFilter({ sprite: sprite() })).uInvert).toBe(0);
    const f = new MatteFilter({ sprite: sprite(), channel: 'luma', invert: true });
    expect(uniformsOf(f).uLuma).toBe(1);
    expect(uniformsOf(f).uInvert).toBe(1);
  });
  it('apply asks the filter manager for the matrix that maps the layer\'s pixels onto the matte sprite, binds the matte texture, then draws', () => {
    const s = sprite();
    const f = new MatteFilter({ sprite: s });
    const calculateSpriteMatrix = vi.fn();
    const applyFilter = vi.fn();
    f.apply({ calculateSpriteMatrix, applyFilter } as never, 'in' as never, 'out' as never, 'clear' as never);
    expect(calculateSpriteMatrix).toHaveBeenCalledWith(uniformsOf(f).uMatteMatrix, s);
    expect(f.resources.uMatteTexture).toBe(s.texture.source);
    expect(applyFilter).toHaveBeenCalledWith(f, 'in', 'out', 'clear');
  });
  it('follows the sprite\'s texture if it is replaced (the matte texture is recreated)', () => {
    const s = sprite();
    const f = new MatteFilter({ sprite: s });
    s.texture = new Texture(10, 10);
    f.apply({ calculateSpriteMatrix: vi.fn(), applyFilter: vi.fn() } as never, 'i' as never, 'o' as never, 'c' as never);
    expect(f.resources.uMatteTexture).toBe(s.texture.source);
  });
});
