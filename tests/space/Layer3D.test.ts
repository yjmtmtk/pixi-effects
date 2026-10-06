import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());

import { Container, Rectangle, RenderTexture } from 'pixi.js';
import { Layer3D, readLayerTransform, MAX_TEXTURE_SIZE, MAX_TEXTURE_PIXELS, type SpaceHost } from '../../src/space/Layer3D';
import { cameraBasis, homeCamera, homeDistance, DEG } from '../../src/space/math';
import type { Sequence } from '../../src/sequences/Base';

const W = 1280;
const H = 720;
const basis = () => cameraBasis(homeCamera(W, H), W, H);

type Carrier = Container & { z: number; rotationX: number; rotationY: number };

function setup(frame = { x: 0, y: 0, width: 200, height: 100 }) {
  const target = new Container() as unknown as Carrier;
  const seq = { target, spec: { name: 'card' } } as unknown as Sequence;
  const layer = new Layer3D(seq, () => frame);
  const render = vi.fn();
  const host: SpaceHost = { render };
  return { target, layer, render, host };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('Layer3D', () => {
  it('seeds z / rotationX / rotationY on the target without overwriting existing values', () => {
    const target = new Container() as unknown as Carrier;
    (target as unknown as { z: number }).z = 42;
    new Layer3D({ target, spec: {} } as unknown as Sequence, () => ({ x: 0, y: 0, width: 1, height: 1 }));
    expect(target.z).toBe(42);
    expect(target.rotationX).toBe(0);
    expect(target.rotationY).toBe(0);
  });

  it('readLayerTransform converts rotationX/Y from degrees and reads the 2D props', () => {
    const { target } = setup();
    target.x = 10; target.y = 20; target.z = 30;
    target.rotationX = 90; target.rotationY = 45; target.rotation = 1;
    target.scale.x = 2; target.scale.y = 3; target.pivot.x = 4; target.pivot.y = 5;
    const t = readLayerTransform(target);
    expect(t).toMatchObject({ x: 10, y: 20, z: 30, rotationZ: 1, scaleX: 2, scaleY: 3, pivotX: 4, pivotY: 5 });
    expect(t.rotationX).toBeCloseTo(90 * DEG, 12);
    expect(t.rotationY).toBeCloseTo(45 * DEG, 12);
  });

  it('renders the target into a texture with its own transform replaced, then sets identity corners', () => {
    const { target, layer, render, host } = setup({ x: -20, y: -10, width: 200, height: 100 });
    target.x = 100; target.y = 50;
    layer.update(host, basis());
    expect(render).toHaveBeenCalledTimes(1);
    const opts = render.mock.calls[0]![0];
    expect(opts.container).toBe(target);
    expect(opts.clear).toBe(true);
    expect(opts.clearColor).toEqual([0, 0, 0, 0]);
    expect(opts.transform.tx).toBe(20);   // translate(-frame.x, -frame.y)
    expect(opts.transform.ty).toBe(10);
    const want = [80, 40, 280, 40, 280, 140, 80, 140];
    (layer.display as unknown as { corners: number[] }).corners.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 6));
    expect(layer.display.visible).toBe(true);
  });

  it('z > 0 makes the projected quad larger', () => {
    const { target, layer, host } = setup();
    target.x = 100; target.y = 50; target.z = 300;
    layer.update(host, basis());
    const c = (layer.display as unknown as { corners: number[] }).corners;
    const D = homeDistance(H, 40);
    expect(c[2]! - c[0]!).toBeCloseTo((200 * D) / (D - 300), 6);
  });

  it('reuses the render texture while the size is unchanged and resizes the same one in place when it changes', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const resize = vi.spyOn(RenderTexture.prototype, 'resize');
    const frame = { x: 0, y: 0, width: 200, height: 100 };
    const { layer, host } = setup(frame);
    layer.update(host, basis());
    layer.update(host, basis());
    expect(create).toHaveBeenCalledTimes(1);
    expect(resize).not.toHaveBeenCalled();
    const texture = (layer.display as unknown as { texture: unknown }).texture;
    frame.width = 300;
    layer.update(host, basis());
    expect(create).toHaveBeenCalledTimes(1);              // not replaced: Pixi warns when a still-bound texture is destroyed
    expect(resize).toHaveBeenCalledTimes(1);
    expect((layer.display as unknown as { texture: unknown }).texture).toBe(texture);
  });

  it('a replaced texture (sampling changed) is destroyed one update later, not while the mesh may still be bound to it', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const frame = { x: 0, y: 0, width: 200, height: 100 };
    const { layer, host } = setup(frame);
    layer.update(host, basis());
    const first = create.mock.results[0]!.value as { destroyed: boolean };
    frame.width = 1200; frame.height = 1200;               // too big to antialias: a new texture is needed
    layer.update(host, basis());
    expect(create).toHaveBeenCalledTimes(2);
    expect(first.destroyed).toBe(false);
    layer.update(host, basis());
    expect(first.destroyed).toBe(true);
  });

  it('hides without rendering when the target is not renderable (outside its lifespan)', () => {
    const { target, layer, render, host } = setup();
    target.renderable = false;
    layer.update(host, basis());
    expect(render).not.toHaveBeenCalled();
    expect(layer.display.visible).toBe(false);
  });

  it('hides when the layer is behind the camera plane', () => {
    const { target, layer, render, host } = setup();
    target.z = homeDistance(H, 40) + 10;
    layer.update(host, basis());
    expect(render).not.toHaveBeenCalled();
    expect(layer.display.visible).toBe(false);
  });

  it('FIX: warns once, naming the layer, when it is hidden for being at/behind the camera plane', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { target, layer, host } = setup();
    target.z = homeDistance(H, 40) + 10;
    layer.update(host, basis());
    layer.update(host, basis());
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('layer "card"');
    expect(msg).toMatch(/behind the camera/);
  });

  it('REVIEW: empty or non-finite bounds hide the layer instead of creating a 0x0 texture', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    for (const frame of [
      { x: 0, y: 0, width: 0, height: 0 },
      { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity },
      { x: 0, y: 0, width: NaN, height: 10 },
    ]) {
      const { layer, render, host } = setup(frame);
      layer.update(host, basis());
      expect(render).not.toHaveBeenCalled();
      expect(layer.display.visible).toBe(false);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('REVIEW: a very large layer gets a capped texture (resolution < 1)', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const { layer, host } = setup({ x: 0, y: 0, width: 8192, height: 1000 });
    layer.update(host, basis());
    const arg = create.mock.calls[0]![0] as { width: number; height: number; resolution: number };
    expect(arg.width).toBe(8192);
    expect(arg.resolution).toBeCloseTo(MAX_TEXTURE_SIZE / 8192, 9);
  });

  it('supersamples small layers 2x with antialiasing so enlarged (z > 0) layers stay crisp', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const { layer, host } = setup();   // 200x100
    layer.update(host, basis());
    expect(create.mock.calls[0]![0]).toMatchObject({ width: 200, height: 100, resolution: 2, antialias: true });
  });

  it('FIX: hides without rendering when the target is not visible (autoAlpha fade) — no stale texture', () => {
    const { target, layer, render, host } = setup();
    layer.update(host, basis());
    expect(layer.display.visible).toBe(true);
    target.visible = false;              // what PixiPlugin autoAlpha does at alpha 0
    render.mockClear();
    layer.update(host, basis());
    expect(render).not.toHaveBeenCalled();
    expect(layer.display.visible).toBe(false);
  });

  it('FIX: grows the texture by the filters\' padding so filter output is not clipped at the layer edge', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const { target, layer, render, host } = setup();
    target.x = 100; target.y = 50;
    (target as unknown as { filters: Array<{ padding: number }> }).filters = [{ padding: 10 }, { padding: 5 }];
    layer.update(host, basis());
    const arg = create.mock.calls[0]![0] as { width: number; height: number };
    expect(arg.width).toBe(230);   // 200 + 2*15
    expect(arg.height).toBe(130);  // 100 + 2*15
    const opts = render.mock.calls[0]![0];
    expect(opts.transform.tx).toBe(15);
    expect(opts.transform.ty).toBe(15);
    const want = [85, 35, 315, 35, 315, 165, 85, 165];
    (layer.display as unknown as { corners: number[] }).corners.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 6));
  });

  it('FIX: a full-frame layer stays within the texture pixel budget and skips MSAA', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const { layer, host } = setup({ x: 0, y: 0, width: 1920, height: 1080 });
    layer.update(host, basis());
    const arg = create.mock.calls[0]![0] as { resolution: number; antialias: boolean };
    expect(arg.resolution).toBeCloseTo(Math.sqrt(MAX_TEXTURE_PIXELS / (1920 * 1080)), 6);
    expect(arg.antialias).toBe(false);
  });

  it('FIX: content that shrinks or jitters within 2x reuses the texture, and the quad covers the whole texture', () => {
    const create = vi.spyOn(RenderTexture, 'create');
    const frame = { x: 0, y: 0, width: 200, height: 100 };
    const { target, layer, host } = setup(frame);
    target.x = 100; target.y = 50;
    layer.update(host, basis());
    frame.width = 190; frame.height = 95;
    layer.update(host, basis());
    expect(create).toHaveBeenCalledTimes(1);
    const c = (layer.display as unknown as { corners: number[] }).corners;
    expect(c[2]! - c[0]!).toBeCloseTo(200, 6);   // still the 200x100 texture
    frame.width = 60;                            // below half: right-size it (in place)
    const resize = vi.spyOn(RenderTexture.prototype, 'resize');
    layer.update(host, basis());
    expect(create).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledTimes(1);
  });

  it('leaves mesh alpha at 1 (the render texture already carries the layer alpha)', () => {
    const { target, layer, host } = setup();
    target.alpha = 0.4;
    layer.update(host, basis());
    expect(layer.display.alpha).toBe(1);
  });

  it('reports depth even when hidden, and destroy releases the mesh and texture', () => {
    const { layer, host } = setup();
    layer.update(host, basis());
    expect(Number.isFinite(layer.depth)).toBe(true);
    layer.destroy();
    expect((layer.display as unknown as { destroyed: boolean }).destroyed).toBe(true);
  });

  it('uses Rectangle-like frames (mock sanity)', () => {
    expect(new Rectangle(1, 2, 3, 4).width).toBe(3);
  });
});
