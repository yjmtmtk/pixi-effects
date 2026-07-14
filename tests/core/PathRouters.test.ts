import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { applyKeyframes, applyInitial, splitRouted, type PathRouters } from '../../src/core/Timeline';

/** Router resolving against a plain-object registry, walking dotted paths. */
function makeRouter(registry: Record<string, object>): PathRouters {
  return {
    three: (path: string) => {
      const segs = path.split('.');
      let obj: unknown = registry[segs[0]!];
      for (let i = 1; i < segs.length - 1; i++) {
        obj = (obj as Record<string, unknown> | undefined)?.[segs[i]!];
      }
      const prop = segs[segs.length - 1]!;
      if (obj == null || typeof obj !== 'object' || !(prop in obj)) return null;
      return { target: obj, prop };
    },
  };
}

describe('splitRouted', () => {
  it('returns everything as rest when no routers given', () => {
    const { rest, routed } = splitRouted({ x: 1, 'three.cube.rotation.y': 2 }, undefined);
    expect(rest).toEqual({ x: 1, 'three.cube.rotation.y': 2 });
    expect(routed).toEqual([]);
  });

  it('routes prefixed keys and leaves the rest (incl. filters.*) untouched', () => {
    const cube = { rotation: { y: 0 } };
    const routers = makeRouter({ cube });
    const { rest, routed } = splitRouted(
      { x: 1, 'filters.b.strength': 8, 'three.cube.rotation.y': 2 }, routers,
    );
    expect(rest).toEqual({ x: 1, 'filters.b.strength': 8 });
    expect(routed).toHaveLength(1);
    expect(routed[0]).toMatchObject({ target: cube.rotation, prop: 'y', key: 'three.cube.rotation.y', value: 2 });
  });

  it('drops keys the router cannot resolve', () => {
    const routers = makeRouter({});
    const { rest, routed } = splitRouted({ 'three.missing.x': 1 }, routers);
    expect(rest).toEqual({});
    expect(routed).toEqual([]);
  });
});

describe('applyKeyframes with routers', () => {
  it('tweens routed props (to)', () => {
    const cube = { rotation: { x: 0, y: 0 } };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {}, [{ at: 0, to: { 'three.cube.rotation.y': 2 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });

  it('sets routed props (set)', () => {
    const cube = { visible: 0 };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {}, [{ at: 0, set: { 'three.cube.visible': 1 } }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(cube.visible).toBe(1);
    tl.kill();
  });

  it('pairs from/to per key (fromTo)', () => {
    const cube = { position: { z: 99 } };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, {},
      [{ at: 0, from: { 'three.cube.position.z': 0 }, to: { 'three.cube.position.z': 10 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(0);
    expect(cube.position.z).toBeCloseTo(0);
    tl.progress(1);
    expect(cube.position.z).toBeCloseTo(10);
    tl.kill();
  });

  it('respects the timeline offset for routed props', () => {
    const cube = { rotation: { y: 0 } };
    const tl = gsap.timeline({ paused: true });
    tl.add(gsap.to({}, { duration: 10 })); // give the timeline room
    applyKeyframes(tl, {}, [{ at: 0, to: { 'three.cube.rotation.y': 2 }, duration: 2 }],
      10, {}, [], 4, makeRouter({ cube })); // offset = 4
    tl.time(4);
    expect(cube.rotation.y).toBeCloseTo(0);
    tl.time(6);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });

  it('still applies non-routed props to the main target alongside routed ones', () => {
    const cube = { rotation: { y: 0 } };
    const sprite = { x: 0 };
    const tl = gsap.timeline({ paused: true });
    applyKeyframes(tl, sprite, [{ at: 0, to: { x: 50, 'three.cube.rotation.y': 2 }, duration: 1 }],
      10, {}, [], 0, makeRouter({ cube }));
    tl.progress(1);
    expect(sprite.x).toBeCloseTo(50);
    expect(cube.rotation.y).toBeCloseTo(2);
    tl.kill();
  });
});

describe('applyInitial with routers', () => {
  it('sets routed props immediately', () => {
    const cube = { position: { z: 0 } };
    applyInitial({}, { 'three.cube.position.z': 5 }, {}, [], makeRouter({ cube }));
    expect(cube.position.z).toBe(5);
  });
});
