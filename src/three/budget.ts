/**
 * How many three layers a page can hold. Each `three` layer owns a renderer, and a browser keeps only so many live graphics contexts for a whole page: about 16 for WebGL, about 32 for
 * WebGPU (measured 2026-10-15 on Chrome: layers beyond it draw nothing, without an error). PixiJS and a `shader` layer use contexts of their own, so the warning comes a little before the
 * limit: more than 12 WebGL layers, more than 28 WebGPU layers. A WebGPU layer that draws on PixiJS's own GPU device has no context of its own and is not counted.
 */
export type ThreeKind = 'webgl' | 'webgpu';

const WARN_ABOVE: Record<ThreeKind, number> = { webgl: 12, webgpu: 28 };
const LIMIT: Record<ThreeKind, string> = { webgl: 'about 16 WebGL contexts', webgpu: 'about 32 WebGPU contexts' };
const live: Record<ThreeKind, number> = { webgl: 0, webgpu: 0 };
const warned = new Set<ThreeKind>();

/** A three layer made its renderer: count it, and say once per kind when the page holds too many. */
export function trackThree(kind: ThreeKind): void {
  live[kind]++;
  if (live[kind] > WARN_ABOVE[kind] && !warned.has(kind)) {
    warned.add(kind);
    console.warn(`pixi-effects: ${live[kind]} three layers are alive with renderer: '${kind}', and a browser keeps ${LIMIT[kind]} for the whole page; layers beyond that draw nothing, without an error. ` +
      `Put several objects in one three layer, destroy layers that are over, ` + (kind === 'webgl' ? `or use renderer: 'webgpu' for some (in a movie PixiJS draws on WebGPU they share its GPU device and have no limit; otherwise it is about 32)` : `or use renderer: 'webgl' for some of them (a different pool of contexts), or leave shareGpu on in a movie PixiJS draws on WebGPU (the layers then share its device)`));
  }
}

/** A three layer let its renderer go. */
export function releaseThree(kind: ThreeKind): void {
  live[kind] = Math.max(0, live[kind] - 1);
}

/** What the page holds now, per renderer. */
export function threeBudget(): Record<ThreeKind, number> {
  return { ...live };
}

/** For tests: forget everything. */
export function resetThreeBudget(): void {
  live.webgl = live.webgpu = 0;
  warned.clear();
}
