import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());

import { Container, PerspectiveMesh } from 'pixi.js';
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { registerSequenceType } from '../../src/core/Composition';
import type { SpaceHost } from '../../src/space/Layer3D';
import { blurRadius } from '../../src/space/focus';
import { homeDistance } from '../../src/space/math';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';

class Box extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
    this.intrinsicWidth = 200;
    this.intrinsicHeight = 100;
  }
}
registerSequenceType('__box', Box as never);

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };

async function build(sequences: unknown[], width = 1280, height = 720) {
  const spec = { type: 'composition', width, height, duration: 10, sequences } as unknown as CompositionSequenceSpec;
  const comp = new CompositionSequence(spec, root, root);
  await comp.build();
  comp.bindTimeline(gsap.timeline({ paused: true }));
  return comp;
}
const innerOf = (comp: CompositionSequence) => (comp.target as unknown as Container).children[0] as Container;
const meshes = (comp: CompositionSequence) => innerOf(comp).children.filter(c => c instanceof PerspectiveMesh) as unknown as Array<PerspectiveMesh & { corners: number[] }>;
const mkHost = () => {
  const render = vi.fn();
  return { render, host: { render } as SpaceHost };
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('CompositionSequence — threeD layers', () => {
  it('adds a mesh for a threeD child and the target itself for a 2D child; cameras are not in the scene graph', async () => {
    const comp = await build([
      { type: 'camera' },
      { type: '__box', threeD: true },
      { type: '__box' },
    ]);
    const inner = innerOf(comp);
    expect(inner.children).toHaveLength(2);
    expect(meshes(comp)).toHaveLength(1);
    expect(inner.children.some(c => c === comp._children[2]!.target)).toBe(true);
    expect(inner.children.some(c => c === comp._children[1]!.target)).toBe(false);
  });

  it('updateSpace renders each threeD layer once and identity-projects with the home camera', async () => {
    const comp = await build([{ type: '__box', threeD: true, initial: { x: 100, y: 50 } }]);
    const { render, host } = mkHost();
    comp.updateSpace(0, host);
    expect(render).toHaveBeenCalledTimes(1);
    const want = [100, 50, 300, 50, 300, 150, 100, 150];
    meshes(comp)[0]!.corners.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 6));
  });

  it('uses the camera layer (truck +100 shifts content -100px)', async () => {
    const comp = await build([
      { type: 'camera' },
      { type: '__box', threeD: true, initial: { x: 100, y: 50 } },
    ]);
    const cam = comp._children[0]!.target as unknown as { x: number; lookAtX: number };
    cam.x = 740; cam.lookAtX = 740;
    comp.updateSpace(0, mkHost().host);
    expect(meshes(comp)[0]!.corners[0]).toBeCloseTo(0, 6);
  });

  it('selects the camera by time (cuts)', async () => {
    const comp = await build([
      { type: 'camera', at: 0, duration: 5 },
      { type: 'camera', at: 5, duration: 5 },
      { type: '__box', threeD: true, initial: { x: 100, y: 50 } },
    ]);
    (comp._children[0]!.target as unknown as { x: number; lookAtX: number }).x = 740;
    (comp._children[0]!.target as unknown as { x: number; lookAtX: number }).lookAtX = 740;
    comp.updateSpace(2, mkHost().host);
    expect(meshes(comp)[0]!.corners[0]).toBeCloseTo(0, 6);       // first camera
    comp.updateSpace(7, mkHost().host);
    expect(meshes(comp)[0]!.corners[0]).toBeCloseTo(100, 6);     // second camera = home
  });

  it('REVIEW: the camera still applies on the final frame t === duration', async () => {
    const comp = await build([
      { type: 'camera' },
      { type: '__box', threeD: true, initial: { x: 100, y: 50 } },
    ]);
    const cam = comp._children[0]!.target as unknown as { x: number; lookAtX: number };
    cam.x = 740; cam.lookAtX = 740;
    comp.updateSpace(10, mkHost().host);
    expect(meshes(comp)[0]!.corners[0]).toBeCloseTo(0, 6);
  });

  it('REVIEW: updateSpace is stateless — changing the camera between calls gives independent results', async () => {
    const comp = await build([
      { type: 'camera' },
      { type: '__box', threeD: true, initial: { x: 100, y: 50 } },
    ]);
    const cam = comp._children[0]!.target as unknown as { x: number; lookAtX: number };
    const host = mkHost().host;
    cam.x = 740; cam.lookAtX = 740;
    comp.updateSpace(3, host);
    const first = meshes(comp)[0]!.corners[0]!;
    cam.x = 640; cam.lookAtX = 640;
    comp.updateSpace(1, host);
    const second = meshes(comp)[0]!.corners[0]!;
    cam.x = 740; cam.lookAtX = 740;
    comp.updateSpace(3, host);
    expect(first).toBeCloseTo(0, 6);
    expect(second).toBeCloseTo(100, 6);
    expect(meshes(comp)[0]!.corners[0]).toBeCloseTo(first, 9);
  });

  it('depth-sorts consecutive threeD layers farthest-first via zIndex', async () => {
    const comp = await build([
      { type: '__box', threeD: true, initial: { z: 100 } },    // near, first in stack
      { type: '__box', threeD: true, initial: { z: -100 } },   // far, second in stack
    ]);
    comp.updateSpace(0, mkHost().host);
    const [near, far] = meshes(comp);
    expect(far!.zIndex).toBeLessThan(near!.zIndex);
    expect(innerOf(comp).sortableChildren).toBe(true);
  });

  it('a 2D layer between threeD layers keeps its stack position and splits depth groups', async () => {
    const comp = await build([
      { type: '__box', threeD: true, initial: { z: 100 } },
      { type: '__box' },
      { type: '__box', threeD: true, initial: { z: -100 } },
    ]);
    comp.updateSpace(0, mkHost().host);
    const [a, b] = meshes(comp);
    expect(a!.zIndex).toBe(0);
    expect(comp._children[1]!.target!.zIndex).toBe(1);
    expect(b!.zIndex).toBe(2);
  });

  it('REVIEW: nested threeD composition — inner layers are projected before the outer layer renders the composition', async () => {
    const comp = await build([
      {
        type: 'composition', width: 400, height: 300, threeD: true,
        sequences: [{ type: '__box', threeD: true }],
      },
    ]);
    const { render, host } = mkHost();
    comp.updateSpace(0, host);
    expect(render).toHaveBeenCalledTimes(2);
    const nested = comp._children[0] as CompositionSequence;
    const innerBox = nested._children[0]!;
    expect(render.mock.calls[0]![0].container).toBe(innerBox.target);
    expect(render.mock.calls[1]![0].container).toBe(nested.target);
  });

  it('destroy releases every Layer3D', async () => {
    const comp = await build([{ type: '__box', threeD: true }]);
    const mesh = meshes(comp)[0] as unknown as { destroyed: boolean };
    comp.destroy();
    expect(mesh.destroyed).toBe(true);
  });
});

describe('CompositionSequence — AI warnings', () => {
  it('warns when z is used without threeD', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: '__box', name: 'photo', initial: { z: 5 } }]);
    expect(warn.mock.calls.some(c => String(c[0]).includes('threeD: true'))).toBe(true);
  });

  it('warns when a camera has no threeD layers to affect', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([{ type: 'camera' }, { type: '__box' }]);
    expect(warn.mock.calls.some(c => String(c[0]).includes('no effect'))).toBe(true);
  });

  it('warns when cameras overlap in time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await build([
      { type: 'camera', at: 0, duration: 6 },
      { type: 'camera', at: 4, duration: 6 },
      { type: '__box', threeD: true },
    ]);
    expect(warn.mock.calls.some(c => String(c[0]).includes('overlap'))).toBe(true);
  });

  it('ignores a mask on a threeD layer with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: '__box', threeD: true, mask: { type: '__box' } }]);
    expect(warn.mock.calls.some(c => String(c[0]).includes('mask'))).toBe(true);
    expect(comp._children[0]!.maskSequence).toBeNull();
  });
});

describe('CompositionSequence — focus by layer name', () => {
  const focusOf = (comp: CompositionSequence, i = 0) => (comp._children[i] as unknown as { state(): { focus: number } }).state().focus;

  it('resolves a layer name to that layer\'s first z (a number or an expression) when the movie is built', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 'back' } },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    expect(focusOf(comp)).toBe(-400);
    const comp2 = await build([
      { type: 'camera', initial: { focus: 'back' } },
      { type: '__box', name: 'back', threeD: true, initial: { z: '0 - GW / 4' } },
    ]);
    expect(focusOf(comp2)).toBe(-320);
  });
  it('a layer name may be any string a layer can be called by (spaces, a leading digit): the exact name wins over the expression reading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([
      { type: 'camera', initial: { focus: 'hero card' }, keyframes: [{ at: 0, to: { focus: '3d-title' }, duration: 1 }] },
      { type: '__box', name: 'hero card', threeD: true, initial: { z: -300 } },
      { type: '__box', name: '3d-title', threeD: true, initial: { z: -700 } },
    ]);
    expect(focusOf(comp)).toBe(-300);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('focus') || String(c[0]).includes('expression failed'))).toEqual([]);
  });
  it('warns once for a name nobody has, and uses the z = 0 plane', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([
      { type: 'camera', initial: { focus: 'bak' } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    const said = warn.mock.calls.filter(c => String(c[0]).includes('focus'));
    expect(said).toHaveLength(1);
    expect(String(said[0]![0])).toContain('did you mean "back"?');
    expect(focusOf(comp)).toBe(0);
  });
});

describe('CompositionSequence — depth of field', () => {
  const filters = (comp: CompositionSequence, i: number) => (meshes(comp)[i] as unknown as { filters: Array<{ radius: number }> | null }).filters;
  const scene = (cameraInitial: Record<string, unknown> | null, extra: unknown[] = []) => [
    ...(cameraInitial ? [{ type: 'camera', initial: cameraInitial }] : []),
    { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
    { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ...extra,
  ];

  it('blurs by depth: nothing on the focal layer, the closed-form radius behind it', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 0)).toBeNull();
    expect(filters(comp, 1)).toHaveLength(1);
    const s = homeDistance(720, 40);
    expect(filters(comp, 1)![0]!.radius).toBeCloseTo(blurRadius(60, s, s + 400, s), 9);
    expect(filters(comp, 1)![0]!.radius).toBeCloseTo(8.64, 1);
  });
  it('focusing on the back layer swaps which one is sharp', async () => {
    const comp = await build(scene({ focus: 'back', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 1)).toBeNull();
    expect(filters(comp, 0)).toHaveLength(1);
  });
  it('with no focus and no aperture on the camera, or no camera, or aperture 0: no filter anywhere', async () => {
    for (const cam of [{ fov: 40 }, null, { focus: 'back', aperture: 0 }]) {
      const comp = await build(scene(cam));
      comp.updateSpace(0, mkHost().host);
      expect(filters(comp, 0)).toBeNull();
      expect(filters(comp, 1)).toBeNull();
    }
  });
  it('a focus pull is a function of the focus: the radius follows the camera, and going back gives the same numbers', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 'front', aperture: 60 }, keyframes: [{ at: 0, to: { focus: 'back' }, duration: 2, ease: 'none' }] },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    // drive the focus through the camera's carrier (the tween itself is GSAP's; what is tested here is the radius as a function of the focus)
    const cam = comp._children[0] as unknown as { target: { focus: number } };
    const radii = (f: number) => { cam.target.focus = f; comp.updateSpace(0, mkHost().host); return [filters(comp, 0)?.[0]?.radius ?? 0, filters(comp, 1)?.[0]?.radius ?? 0]; };
    const mid = radii(-200), back = radii(-400), again = radii(-200);
    expect(back[1]).toBe(0);
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[1]).toBeGreaterThan(0);
    expect(again).toEqual(mid);
  });
  it('a focal plane at or behind the camera warns once and blurs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build(scene({ focus: 5000, aperture: 60 }));
    const { host } = mkHost();
    comp.updateSpace(0, host); comp.updateSpace(0.1, host);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('behind the camera') && String(c[0]).includes('focus'))).toHaveLength(1);
    expect(filters(comp, 0)).toBeNull();
    expect(filters(comp, 1)).toBeNull();
  });
  it('warns once when 20 or more layers are blurred at once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: 22 }, (_, i) => ({ type: '__box', threeD: true, initial: { z: -100 - i * 10 } }));
    const comp = await build([{ type: 'camera', initial: { focus: 0, aperture: 60 } }, ...many]);
    const { host } = mkHost();
    comp.updateSpace(0, host); comp.updateSpace(0.1, host);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('blurred'))).toHaveLength(1);
  });
  it('a layer hidden behind the camera drops its filter, and gets the right radius when it comes back', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }, [{ type: '__box', name: 'pass', threeD: true, hideBehindCamera: true, initial: { z: -400 } }]));
    const { host } = mkHost();
    comp.updateSpace(0, host);
    const pass = comp._children[3]!.target as unknown as { z: number };
    const r0 = filters(comp, 2)![0]!.radius;
    pass.z = 5000;                                   // behind the camera
    comp.updateSpace(0.1, host);
    expect(filters(comp, 2)).toBeNull();
    pass.z = -400;
    comp.updateSpace(0.2, host);
    expect(filters(comp, 2)![0]!.radius).toBeCloseTo(r0, 9);
  });
  it('when the camera changes at a cut, the filters follow the camera that is active (one has aperture, the next does not)', async () => {
    const comp = await build([
      { type: 'camera', at: 0, duration: 1, initial: { focus: 'front', aperture: 60 } },
      { type: 'camera', at: 1, initial: { fov: 40 } },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    const { host } = mkHost();
    comp.updateSpace(0.5, host);
    expect(filters(comp, 1)).toHaveLength(1);
    comp.updateSpace(1.5, host);
    expect(filters(comp, 1)).toBeNull();
    comp.updateSpace(0.5, host);                      // and back again
    expect(filters(comp, 1)).toHaveLength(1);
  });
  it('a layer that is hidden (lifespan over, alpha 0) is not blurred and not counted, whatever the frames visited before (the picture is the same for every order)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slides = Array.from({ length: 24 }, (_, i) => ({ type: '__box', name: 's' + i, threeD: true, initial: { z: -400 } }));
    const comp = await build([{ type: 'camera', initial: { focus: 0, aperture: 30 } }, ...slides]);
    const { host } = mkHost();
    comp.updateSpace(0, host);                                              // all 24 are drawn: 24 blurred, one warning
    expect(warn.mock.calls.filter(c => String(c[0]).includes('blurred'))).toHaveLength(1);
    warn.mockClear();
    for (const c of comp._children.slice(1, 23)) (c.target as unknown as { renderable: boolean }).renderable = false;   // 22 of them are over
    comp.updateSpace(1, host);
    const rows = comp.layers();
    expect(rows.filter(r => r.depthBlur > 0)).toHaveLength(2);              // only the two still shown
    expect(rows.slice(0, 22).every(r => r.depthBlur === 0)).toBe(true);
    for (let i = 0; i < 22; i++) expect(filters(comp, i)).toBeNull();
  });
  it('layers() reports the blur each threeD layer has now (for inspect)', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    const rows = comp.layers();
    expect(rows.find(r => r.seq.spec.name === 'front')!.depthBlur).toBe(0);
    expect(rows.find(r => r.seq.spec.name === 'back')!.depthBlur).toBeGreaterThan(8);
  });
  it('a nested threeD composition is blurred as one layer by its parent\'s camera', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 0, aperture: 60 } },
      { type: 'composition', name: 'card', width: 200, height: 100, duration: 10, threeD: true, initial: { z: -400 }, sequences: [{ type: '__box', threeD: true }] },
    ]);
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 0)).toHaveLength(1);
  });
});
