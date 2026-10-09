import { describe, it, expect, vi, beforeEach } from 'vitest';
// every Shader the code makes is recorded: a composition with no light must make none
const shaders: unknown[] = [];
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  const Base = m.Shader;
  m.Shader = class extends Base { constructor(o: { resources?: Record<string, unknown> }) { super(o); shaders.push(this); } } as typeof Base;
  return m;
});
import { gsap } from 'gsap';
import { Container } from 'pixi.js';
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { registerSequenceType } from '../../src/core/Composition';
import { LitMaterial } from '../../src/space/LitMaterial';
import type { Layer3D, SpaceHost } from '../../src/space/Layer3D';
import type { CompositionShape, SequenceSpec } from '../../src/types';

class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }
}
registerSequenceType('__box', Box as never);

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 1280, height: 720, duration: 10, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  comp.bindTimeline(gsap.timeline({ paused: true }));
  return comp;
}
const card = (o: Record<string, unknown> = {}) => ({ type: '__box', threeD: true, ...o });
beforeEach(() => { vi.restoreAllMocks(); shaders.length = 0; });
const host = { render: () => {} } as unknown as SpaceHost;
const layers3d = (comp: CompositionSequence) => (comp as unknown as { _layers3d: Layer3D[] })._layers3d;

describe('a composition with light layers', () => {
  it('draws no light (a light has no picture) and keeps it out of layers()', async () => {
    const comp = await build([{ type: 'light', kind: 'ambient' }, { type: 'light', kind: 'point', name: 'key' }, card({ name: 'a' })]);
    expect(comp.layers().map(l => l.seq.spec.name)).toEqual(['a']);
  });

  it('says the composition-wide mistakes once, at build', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'light', kind: 'point' }, card()]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('ambient'));
    expect(said).toHaveLength(1);
  });

  it('a composition with no light layer asks nothing of the light checks: no warning even for castsShadows on layers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([card({ castsShadows: true }), card({ lit: false })]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a light layer written with threeD is still not a drawn layer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'light', kind: 'ambient', threeD: true }, card({ name: 'a' })]);
    expect(comp.layers().map(l => l.seq.spec.name)).toEqual(['a']);
  });
});

describe('lit layers (the shader is made only when there is something to light)', () => {
  it('a composition with no light and no fog makes no shader and no material, however many frames are drawn', async () => {
    const update = vi.spyOn(LitMaterial.prototype, 'update');
    const comp = await build([card({ name: 'a' }), card({ name: 'b' })]);
    for (let i = 0; i < 10; i++) comp.updateSpace(i / 10, host);
    for (const l of layers3d(comp)) {
      expect(l.material).toBeNull();
      expect((l.display as unknown as { shader?: unknown }).shader).toBeUndefined();
    }
    expect(shaders).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('a light layer gives every threeD layer a material; a layer with lit: false is fed no lights; a 2D layer is untouched', async () => {
    const update = vi.spyOn(LitMaterial.prototype, 'update');
    const comp = await build([{ type: 'light', kind: 'ambient', initial: { intensity: 0.3 } }, card({ name: 'a' }), card({ name: 'b', lit: false }), { type: '__box', name: 'flat' }]);
    comp.updateSpace(0, host);
    const [a, b] = layers3d(comp);
    expect(a!.material).not.toBeNull();
    expect(b!.material).not.toBeNull();                      // still made (fog may need it); it is just fed no lights
    expect(layers3d(comp)).toHaveLength(2);
    expect(update).toHaveBeenCalledTimes(2);
    const [litCall, unlitCall] = update.mock.calls;
    expect(litCall![2]).not.toBeNull();
    expect(unlitCall![2]).toBeNull();
  });

  it('a light outside its lifespan is not counted: with none alive the layers are drawn unlit; inside, they are lit', async () => {
    const update = vi.spyOn(LitMaterial.prototype, 'update');
    const comp = await build([{ type: 'light', kind: 'point', at: 2, duration: 3 }, { type: 'light', kind: 'ambient', at: 2, duration: 3 }, card({ name: 'a' })]);
    comp.updateSpace(0, host);
    expect(update.mock.calls.at(-1)![2]).toBeNull();
    comp.updateSpace(3, host);
    const packed = update.mock.calls.at(-1)![2] as { count: number } | null;
    expect(packed).not.toBeNull();
    expect(packed!.count).toBe(1);
    comp.updateSpace(6, host);
    expect(update.mock.calls.at(-1)![2]).toBeNull();
  });

  it('camera fog alone (no light) also makes the material, with the fog and no lights', async () => {
    const update = vi.spyOn(LitMaterial.prototype, 'update');
    const comp = await build([{ type: 'camera', initial: { fogNear: 500, fogFar: 1500, fogColor: '#102030' } }, card({ name: 'a' })]);
    // `initial` is applied when the timeline binds: set the carrier by hand
    const cam = (comp as unknown as { _cameras: Array<{ target: Record<string, unknown> }> })._cameras[0]!;
    cam.target.fogNear = 500; cam.target.fogFar = 1500;
    comp.updateSpace(0, host);
    const [, , lights, fog] = update.mock.calls.at(-1)!;
    expect(lights).toBeNull();
    expect(fog).toMatchObject({ near: 500, far: 1500 });
  });

  it('destroying the layer destroys its material and puts the default shader back', async () => {
    const comp = await build([{ type: 'light', kind: 'ambient' }, card({ name: 'a' })]);
    comp.updateSpace(0, host);
    const [a] = layers3d(comp);
    const material = a!.material!;
    expect((a!.display as unknown as { shader: unknown }).shader).toBe(material.shader);
    a!.destroy();
    expect(a!.material).toBeNull();
    expect((material.shader as unknown as { destroyed: boolean }).destroyed).toBe(true);
  });
});


describe('a light that cannot do anything says so', () => {
  const said = async (sequences: unknown[]) => { const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); await build(sequences); return warn.mock.calls.map(c => String(c[0])); };
  it('a light in a composition that has no threeD layer (lights do not reach into nested compositions)', async () => {
    const w = await said([{ type: 'light', kind: 'ambient' }, { type: 'composition', name: 'scene', width: 100, height: 100, sequences: [card()] }]);
    expect(w.some(m => m.includes('light') && m.includes('no threeD layers') && m.includes('inside the composition'))).toBe(true);
    expect((await said([{ type: 'light', kind: 'ambient' }, card()])).some(m => m.includes('no threeD layers'))).toBe(false);
  });
  it('parent on a light is not followed: it says so, as it does for a camera', async () => {
    const w = await said([{ type: 'null', name: 'rig' }, { type: 'light', kind: 'ambient', name: 'fill', parent: 'rig' }, card()]);
    expect(w.some(m => m.includes('"fill"') && m.includes('light cannot have a parent'))).toBe(true);
  });
});
