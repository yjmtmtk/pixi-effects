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
});
