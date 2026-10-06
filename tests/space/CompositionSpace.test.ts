import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());

import { Container, PerspectiveMesh } from 'pixi.js';
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { registerSequenceType } from '../../src/core/Composition';
import type { SpaceHost } from '../../src/space/Layer3D';
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
