/** A WebGL2 context that records what it was asked and answers the way a working (or a failing) driver does. For unit tests of code that draws with GL. */
import { vi } from 'vitest';

export interface FakeGlOptions { compileOk?: boolean; log?: string }
export interface FakeGl { gl: Record<string, unknown>; calls: Array<[string, ...unknown[]]>; count(name: string): number; last(name: string): unknown[] | undefined; opts: FakeGlOptions }

const CONSTS: Record<string, number> = { VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, LINK_STATUS: 35714, COMPILE_STATUS: 35713, TRIANGLES: 4, COLOR_BUFFER_BIT: 16384 };

export function fakeGl(opts: FakeGlOptions = {}): FakeGl {
  const calls: Array<[string, ...unknown[]]> = [];
  const gl: Record<string, unknown> = new Proxy({}, {
    get(_t, key: string) {
      if (key in CONSTS) return CONSTS[key];
      if (key === 'getProgramParameter' || key === 'getShaderParameter') return () => opts.compileOk !== false;
      if (key === 'getShaderInfoLog') return () => opts.log ?? '';
      if (key === 'getProgramInfoLog') return () => '';
      if (key === 'getUniformLocation') return (_p: unknown, name: string) => ({ name });
      if (key === 'getExtension') return () => null;
      if (key === 'createShader' || key === 'createProgram') return () => { const o = { kind: key }; calls.push([key, o]); return o; };
      return (...a: unknown[]) => { calls.push([key, ...a]); };
    },
  });
  return { gl, calls, opts, count: (n) => calls.filter(c => c[0] === n).length, last: (n) => [...calls].reverse().find(c => c[0] === n)?.slice(1) };
}

export interface Fake2d { ctx: Record<string, unknown>; calls: Array<[string, ...unknown[]]> }
export function fake2d(): Fake2d {
  const calls: Array<[string, ...unknown[]]> = [];
  const ctx: Record<string, unknown> = new Proxy({}, {
    get(_t, key: string) { return (...a: unknown[]) => { calls.push([key, ...a]); }; },
    set() { return true; },
  });
  return { ctx, calls };
}

/**
 * Make every canvas hand out `gl` for 'webgl2' (or null) and `ctx2d` for '2d'. Without `ctx2d` the '2d' context is the environment's own.
 * Returns the spy so a test can count the asks.
 */
export function installCanvas(gl: FakeGl | null, ctx2d?: Fake2d) {
  const original = HTMLCanvasElement.prototype.getContext;
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (type === 'webgl2') return gl ? gl.gl : null;
    if (type === '2d' && ctx2d) return ctx2d.ctx;
    return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
  } as never);
}
