import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  m.Assets.get = async () => ({ width: 100, height: 100 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { Container } from 'pixi.js';
import type { SpaceHost } from '../../src/space/Layer3D';
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

const innerOf = (comp: CompositionSequence) => ((comp.target as unknown as { children: Container[] }).children[0]!);
const matteFiltersOf = (display: unknown) => ((display as { filters?: Array<{ constructor: { name: string } }> }).filters ?? []).filter(f => f.constructor.name === 'MatteFilter');

describe('a named matte', () => {
  it('is not drawn on screen; the layers that name it get a MatteFilter, last among their own filters', async () => {
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 30, name: 'disc', initial: { x: 100, y: 100, fillColor: '#ffffff' } },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'a', mask: 'disc' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'b', mask: 'disc' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'c' },
    ]);
    const names = comp.layers().map(l => l.seq.spec.name);
    expect(names).toEqual(['a', 'b', 'c']);                                   // 'disc' is a matte: not a drawn layer
    const [a, b, c] = comp.layers();
    expect(matteFiltersOf(a!.display)).toHaveLength(1);
    expect(matteFiltersOf(b!.display)).toHaveLength(1);
    expect(matteFiltersOf(c!.display)).toHaveLength(0);
    // one matte, shared: the two filters read the same sprite
    expect((matteFiltersOf(a!.display)[0] as unknown as { _sprite: unknown })._sprite).toBe((matteFiltersOf(b!.display)[0] as unknown as { _sprite: unknown })._sprite);
  });

  it('a list of references is a filter for each (intersect); invert and channel are carried', async () => {
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 30, name: 'disc' },
      { type: 'shape', shape: 'rect', width: 20, height: 20, name: 'hole' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'a', mask: ['disc', { layer: 'hole', invert: true, channel: 'luma' }] },
    ]);
    const filters = matteFiltersOf(comp.layers()[0]!.display) as unknown as Array<{ resources: { matteUniforms: { uniforms: { uLuma: number; uInvert: number } } } }>;
    expect(filters).toHaveLength(2);
    expect(filters[0]!.resources.matteUniforms.uniforms).toMatchObject({ uLuma: 0, uInvert: 0 });
    expect(filters[1]!.resources.matteUniforms.uniforms).toMatchObject({ uLuma: 1, uInvert: 1 });
  });

  it('the matte is drawn into its texture once per frame in updateSpace (and an empty one while it is hidden)', async () => {
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 30, name: 'disc' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'a', mask: 'disc' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'b', mask: 'disc' },
    ]);
    const render = vi.fn();
    const host = { render } as unknown as SpaceHost;
    comp.updateSpace(0, host);
    expect(render).toHaveBeenCalledTimes(1);                                 // one matte, however many layers use it
    const opts = render.mock.calls[0]![0];
    expect(opts.clear).toBe(true);
    expect(opts.clearColor).toEqual([0, 0, 0, 0]);
    expect(opts.container).toBe(comp._children[0]!.target);
    (comp._children[0]!.target as unknown as { renderable: boolean }).renderable = false;
    comp.updateSpace(0.1, host);
    expect(render.mock.calls[1]![0].container).not.toBe(comp._children[0]!.target);   // hidden: an empty container is drawn
  });

  it('a composition with no matte does no matte work: nothing is drawn for mattes, no sprite is added', async () => {
    const comp = await build([{ type: 'shape', shape: 'rect', width: 50, height: 50 }]);
    const render = vi.fn();
    comp.updateSpace(0, { render } as unknown as SpaceHost);
    expect(render).not.toHaveBeenCalled();
    expect(innerOf(comp).children).toHaveLength(1);
  });

  it('destroy() destroys the matte sprites', async () => {
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 30, name: 'disc' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'a', mask: 'disc' },
    ]);
    const sprite = (innerOf(comp).children as unknown as Array<{ destroyed: boolean; constructor: { name: string } }>).find(c => c.constructor.name === 'Sprite')!;
    expect(sprite).toBeDefined();
    comp.destroy();
    expect(sprite.destroyed).toBe(true);
  });
});

describe('limits and memory', () => {
  it('a threeD matte is not used (it is drawn as a normal threeD layer) and a threeD layer with a reference warns that masks are not supported on it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([
      { type: 'shape', shape: 'circle', radius: 30, name: 'solid', threeD: true },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'a', mask: 'solid' },
      { type: 'shape', shape: 'rect', width: 50, height: 50, name: 'b', threeD: true, mask: 'solid' },
    ]);
    const said = warn.mock.calls.map(c => String(c[0]));
    expect(said.some(m => m.includes('"solid" is a threeD layer and cannot be a matte'))).toBe(true);
    expect(said.some(m => m.includes('layer "b"') && m.includes('mask is not supported on threeD'))).toBe(true);
    expect(comp.layers().map(l => l.seq.spec.name)).toContain('solid');                    // not a matte: it is drawn (as the threeD layer it is)
  });

  it('more than 8 mattes in one composition warns once, with the size of each texture', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mattes = Array.from({ length: 9 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 10, name: 'm' + i }));
    const users = mattes.map((m, i) => ({ type: 'shape', shape: 'rect', width: 10, height: 10, name: 'u' + i, mask: m.name }));
    await build([...mattes, ...users]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('mattes'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/9 mattes.*1280×720.*MiB/);
  });

  it('8 mattes are fine: no memory warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mattes = Array.from({ length: 8 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 10, name: 'm' + i }));
    const users = mattes.map((m, i) => ({ type: 'shape', shape: 'rect', width: 10, height: 10, name: 'u' + i, mask: m.name }));
    await build([...mattes, ...users]);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('mattes'))).toEqual([]);
  });
});
