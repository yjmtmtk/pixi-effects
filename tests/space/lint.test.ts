import { describe, it, expect } from 'vitest';
import { lintSequence, lintFocus } from '../../src/space/lint';
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

  it('focus and aperture on a layer that is not a camera say where they belong', () => {
    const w = run({ type: 'text', text: 'hi', threeD: true, initial: { focus: 'x', aperture: 40 }, keyframes: [{ at: 0, to: { aperture: 10 } }] });
    expect(w).toHaveLength(2);
    expect(w.some(m => m.includes('"focus"') && m.includes('camera'))).toBe(true);
    expect(w.some(m => m.includes('"aperture"') && m.includes('camera'))).toBe(true);
    expect(run({ type: 'camera', initial: { focus: 'x', aperture: 40 } })).toEqual([]);
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

function runFocus(camera: unknown, siblings: unknown[]): string[] {
  const out: string[] = [];
  lintFocus(camera as SequenceSpec, siblings as SequenceSpec[], m => out.push(m));
  return out;
}

describe('lintFocus', () => {
  const sibs = [
    { type: 'text', name: 'title', threeD: true, text: 'a' },
    { type: 'image', name: 'label', asset: 'a' },
    { type: 'shape', shape: 'rect', name: 'mover', threeD: true, keyframes: [{ at: 0, to: { z: 9 }, duration: 1 }] },
  ];
  it('a missing name says what was meant', () => {
    const w = runFocus({ type: 'camera', initial: { focus: 'tilte' } }, sibs);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('focus');
    expect(w[0]).toContain('"tilte"');
    expect(w[0]).toContain('did you mean "title"?');
  });
  it('a layer that is not threeD, and a layer whose z moves, are said', () => {
    expect(runFocus({ type: 'camera', initial: { focus: 'label' } }, sibs)[0]).toMatch(/"label".*not a threeD/);
    expect(runFocus({ type: 'camera', initial: { focus: 'mover' } }, sibs)[0]).toMatch(/"mover".*first z/);
  });
  it('duplicate names are said, with the one that is used', () => {
    const dup = [{ type: 'text', name: 'title', text: 'a' }, { type: 'text', name: 'title', threeD: true, text: 'b' }];
    const w = runFocus({ type: 'camera', initial: { focus: 'title' } }, dup);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/2 layers are named "title".*first threeD/);
  });
  it('is silent for a good name, a number and a camera without focus', () => {
    expect(runFocus({ type: 'camera', initial: { focus: 'title' } }, sibs)).toEqual([]);
    expect(runFocus({ type: 'camera', initial: { focus: 300 } }, sibs)).toEqual([]);
    expect(runFocus({ type: 'camera' }, sibs)).toEqual([]);
  });
  it('other kinds of layer are not looked at', () => {
    expect(runFocus({ type: 'text', text: 'a', initial: { focus: 'nope' } }, sibs)).toEqual([]);
  });
});

describe('lintSequence — depth of field names', () => {
  it('the likely wrong names point at focus and aperture', () => {
    const w = run({ type: 'camera', initial: { depthOfField: 1, dof: 1, focalDistance: 1, focusDistance: 1, fStop: 2, blurAmount: 3 } });
    for (const k of ['depthOfField', 'dof', 'focalDistance', 'focusDistance', 'fStop', 'blurAmount']) {
      expect(w.some(m => m.includes(`"${k}"`) && m.includes('"focus"') && m.includes('"aperture"'))).toBe(true);
    }
  });
  it('focus and aperture inside initial are fine, and on the camera itself they must go inside initial', () => {
    expect(run({ type: 'camera', initial: { focus: 100, aperture: 40 } })).toEqual([]);
    const w = run({ type: 'camera', focus: 100 });
    expect(w.some(m => m.includes('"focus"') && m.includes('initial'))).toBe(true);
  });
});
