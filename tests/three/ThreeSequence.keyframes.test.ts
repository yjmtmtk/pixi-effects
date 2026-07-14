import { describe, it, expect, vi } from 'vitest';
import { mockThreeModule, MockPerspectiveCamera } from './mockThree';
mockThreeModule();

import { gsap } from 'gsap';
import { Sprite } from 'pixi.js';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };

async function bind(over: Partial<ThreeSequenceSpec>): Promise<{ seq: ThreeSequence; tl: gsap.core.Timeline }> {
  const spec = { type: 'three', setup: vi.fn(), duration: 10, ...over } as unknown as SequenceSpec;
  const seq = new ThreeSequence(spec, shape, shape);
  await seq.build();
  const tl = gsap.timeline({ paused: true });
  tl.add(gsap.to({}, { duration: 10 }));
  seq.bindTimeline(tl);
  return { seq, tl };
}

describe('three.* keyframes', () => {
  it('tweens exposed objects through dotted paths', async () => {
    const cube = { rotation: { x: 0, y: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      keyframes: [{ at: 0, to: { 'three.cube.rotation.y': Math.PI }, duration: 2 }],
    });
    tl.time(2);
    expect(cube.rotation.y).toBeCloseTo(Math.PI);
    tl.kill();
  });

  it('addresses the implicit camera', async () => {
    const { seq, tl } = await bind({
      keyframes: [{ at: 0, to: { 'three.camera.fov': 30 }, duration: 1 }],
    });
    tl.time(1);
    expect(((seq as any)._camera as MockPerspectiveCamera).fov).toBeCloseTo(30);
    tl.kill();
  });

  it('resolves expression values against the scope', async () => {
    const cube = { position: { x: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      keyframes: [{ at: 0, to: { 'three.cube.position.x': 'W / 4' }, duration: 1 }],
    });
    tl.time(1);
    expect(cube.position.x).toBeCloseTo(320); // 1280 / 4
    tl.kill();
  });

  it('supports three.* in initial', async () => {
    const cube = { position: { z: 0 } };
    const { tl } = await bind({
      setup: () => ({ objects: { cube } }),
      initial: { 'three.cube.position.z': 5 },
    });
    expect(cube.position.z).toBe(5);
    tl.kill();
  });

  it('warns once and skips unresolvable paths without breaking sibling props', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { seq, tl } = await bind({
      keyframes: [
        { at: 0, to: { 'three.nope.x': 1, x: 50 }, duration: 1 },
        { at: 2, to: { 'three.nope.x': 2 }, duration: 1 },
      ],
    });
    tl.time(1);
    expect((seq.target as Sprite).x).toBeCloseTo(50); // sprite prop unaffected
    const pathWarnings = warn.mock.calls.filter(c => String(c[0]).includes('three.nope.x'));
    expect(pathWarnings).toHaveLength(1); // once per path, not per keyframe
    warn.mockRestore();
    tl.kill();
  });

  it('rejects paths without at least <object>.<prop>', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { tl } = await bind({
      keyframes: [{ at: 0, to: { 'three.camera': 1 }, duration: 1 }],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('three.camera'));
    warn.mockRestore();
    tl.kill();
  });

  it('still runs plain 2D props through the normal pipeline', async () => {
    const { seq, tl } = await bind({
      initial: { x: 10 },
      keyframes: [{ at: 0, to: { alpha: 0.5 }, duration: 1 }],
    });
    const sprite = seq.target as Sprite;
    expect(sprite.x).toBe(10);
    tl.time(1);
    expect(sprite.alpha).toBeCloseTo(0.5);
    tl.kill();
  });
});
