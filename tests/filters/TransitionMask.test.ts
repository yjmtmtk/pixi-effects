import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Filter {
    resources: Record<string, unknown> = {};
    glProgram: unknown;
    gpuProgram: unknown;
    apply() { /* duck-type marker */ }
    constructor(opts?: Record<string, unknown>) {
      if (opts) {
        if (opts.resources) this.resources = opts.resources as Record<string, unknown>;
        if (opts.glProgram !== undefined) this.glProgram = opts.glProgram;
        if (opts.gpuProgram !== undefined) this.gpuProgram = opts.gpuProgram;
      }
    }
  }
  class GlProgram {
    constructor(_opts: unknown) { /* no-op */ }
    static from(_opts: unknown): GlProgram { return new GlProgram(_opts); }
  }
  class GpuProgram {
    constructor(_opts: unknown) { /* no-op */ }
    static from(_opts: unknown): GpuProgram { return new GpuProgram(_opts); }
  }
  class UniformGroup {
    uniforms: Record<string, unknown>;
    constructor(uniforms: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, v.value]));
    }
  }
  return { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '' };
});

import { TransitionMaskFilter } from '../../src/filters/TransitionMask';

describe('TransitionMaskFilter', () => {
  it('constructs with default uniforms', () => {
    const f = new TransitionMaskFilter();
    const u = (f as unknown as { resources: { transitionUniforms: { uniforms: Record<string, unknown> } } }).resources.transitionUniforms.uniforms;
    expect(u.uProgress).toBe(0);
    expect(u.uMode).toBe(0);
    expect(u.uSmoothing).toBe(0.02);
  });

  it('honors mode constants for wipe-up / wipe-down / iris-in / iris-out', () => {
    const cases: Array<[Parameters<typeof TransitionMaskFilter>[0], number]> = [
      [{ mode: 'wipe-left'  }, 0],
      [{ mode: 'wipe-right' }, 1],
      [{ mode: 'wipe-up'    }, 2],
      [{ mode: 'wipe-down'  }, 3],
      [{ mode: 'iris-in'    }, 4],
      [{ mode: 'iris-out'   }, 5],
    ];
    for (const [opts, expected] of cases) {
      const f = new TransitionMaskFilter(opts);
      const u = (f as unknown as { resources: { transitionUniforms: { uniforms: Record<string, unknown> } } }).resources.transitionUniforms.uniforms;
      expect(u.uMode).toBe(expected);
    }
  });

  it('exposes both glProgram and gpuProgram', () => {
    const f = new TransitionMaskFilter();
    expect((f as unknown as { glProgram: unknown }).glProgram).toBeDefined();
    expect((f as unknown as { gpuProgram: unknown }).gpuProgram).toBeDefined();
  });
});
