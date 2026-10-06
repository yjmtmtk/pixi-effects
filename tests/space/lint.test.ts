import { describe, it, expect } from 'vitest';
import { lintSequence } from '../../src/space/lint';
import type { SequenceSpec } from '../../src/types';

function run(spec: unknown): string[] {
  const out: string[] = [];
  lintSequence(spec as SequenceSpec, m => out.push(m));
  return out;
}

describe('lintSequence', () => {
  it('z / rotationX / rotationY without threeD warns once per key and names the layer', () => {
    const w = run({ type: 'image', name: 'photo', asset: 'a', initial: { z: 100 }, keyframes: [{ at: 0, to: { rotationY: 30 } }] });
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('layer "photo"');
    expect(w.some(m => m.includes('"z"') && m.includes('threeD: true'))).toBe(true);
    expect(w.some(m => m.includes('"rotationY"'))).toBe(true);
  });

  it('is silent for a correct threeD layer and for plain 2D layers', () => {
    expect(run({ type: 'image', asset: 'a', threeD: true, initial: { z: 100, rotationX: 10 } })).toEqual([]);
    expect(run({ type: 'text', text: 'hi', initial: { x: 1, y: 2 } })).toEqual([]);
  });

  it('suggests the right name for likely alias mistakes', () => {
    const w = run({ type: 'image', asset: 'a', threeD: true, initial: { rotateY: 30, translateZ: 5, depth: 2 } });
    expect(w.some(m => m.includes('"rotateY"') && m.includes('"rotationY"'))).toBe(true);
    expect(w.some(m => m.includes('"translateZ"') && m.includes('"z"'))).toBe(true);
    expect(w.some(m => m.includes('"depth"') && m.includes('"z"'))).toBe(true);
  });

  it('camera: props on the camera itself must go inside initial', () => {
    const w = run({ type: 'camera', fov: 50, x: 10 });
    expect(w.some(m => m.includes('"fov"') && m.includes('initial'))).toBe(true);
    expect(w.some(m => m.includes('"x"') && m.includes('initial'))).toBe(true);
  });

  it('camera: alias props suggest fov / lookAt', () => {
    const w = run({ type: 'camera', initial: { perspective: 40, zoom: 2, pointOfInterest: 0 } });
    expect(w.some(m => m.includes('"perspective"') && m.includes('"fov"'))).toBe(true);
    expect(w.some(m => m.includes('"zoom"') && m.includes('"fov"'))).toBe(true);
    expect(w.some(m => m.includes('"pointOfInterest"') && m.includes('lookAtX'))).toBe(true);
  });

  it('a correct camera is silent', () => {
    expect(run({ type: 'camera', initial: { fov: 50, lookAtX: 10 }, keyframes: [{ at: 0, to: { x: 5 } }] })).toEqual([]);
  });

  it('threeD on audio warns', () => {
    const w = run({ type: 'audio', asset: 'a', threeD: true });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('audio');
  });

  it('unnamed layers are labelled by type', () => {
    const w = run({ type: 'shape', shape: 'rect', width: 1, height: 1, initial: { z: 1 } });
    expect(w[0]).toContain('unnamed shape layer');
  });

  it('FIX: rotationZ is a likely guess — point to `rotation`', () => {
    const w = run({ type: 'image', asset: 'a', threeD: true, initial: { rotationZ: 10 } });
    expect(w.some(m => m.includes('"rotationZ"') && m.includes('"rotation"'))).toBe(true);
  });

  it('FIX: perspective / zoom on any layer point to the camera fov', () => {
    const w = run({ type: 'composition', initial: { perspective: 800, zoom: 2 } });
    expect(w.some(m => m.includes('"perspective"') && m.includes('"fov"') && m.includes('camera'))).toBe(true);
    expect(w.some(m => m.includes('"zoom"') && m.includes('"fov"'))).toBe(true);
  });

  it('FIX: camera props outside x/y/z/lookAt*/fov are not silently ignored', () => {
    const w = run({ type: 'camera', initial: { rotation: 10, scale: 2, alpha: 0.5 }, keyframes: [{ at: 0, to: { rotationY: 20 } }] });
    for (const k of ['rotation', 'scale', 'alpha', 'rotationY']) {
      expect(w.some(m => m.includes(`"${k}"`) && m.includes('no effect on a camera'))).toBe(true);
    }
  });

  it('FIX: skew on a threeD layer warns (it is dropped by the projection)', () => {
    const w = run({ type: 'image', asset: 'a', threeD: true, initial: { skewX: 0.2 }, keyframes: [{ at: 0, to: { skew: 0.1 } }] });
    expect(w.some(m => m.includes('"skewX"') && m.includes('threeD'))).toBe(true);
    expect(w.some(m => m.includes('"skew"') && m.includes('threeD'))).toBe(true);
  });

  it('FIX: skew on a 2D layer stays silent', () => {
    expect(run({ type: 'image', asset: 'a', initial: { skewX: 0.2 } })).toEqual([]);
  });
});
