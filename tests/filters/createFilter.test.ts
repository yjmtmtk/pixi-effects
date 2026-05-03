import { describe, it, expect, vi } from 'vitest';

// PixiJS depends on a real browser (WebGL/canvas). For unit tests we only need
// the Filter base class to exist so `instanceof Filter` works; mock everything
// else just enough to satisfy the imports of the built-in filter wrappers.

vi.mock('pixi.js', () => {
  class Filter {
    resources: Record<string, unknown> = {};
    constructor(_opts?: unknown) { /* no-op */ }
    apply() { /* PIXI calls this on render; presence of this method is the duck-type marker. */ }
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
  class Color { constructor(public input: string) {} red = 0; green = 1; blue = 0; }
  return {
    Filter,
    GlProgram,
    GpuProgram,
    UniformGroup,
    Color,
    defaultFilterVert: '',
  };
});

import { Filter } from 'pixi.js';
import { createFilter } from '../../src/filters/index';

describe('createFilter — built-ins', () => {
  it('builds chromaKey filter and applies the name marker', () => {
    const f = createFilter({ type: 'chromaKey', name: 'k', keyColor: '#00ff00', threshold: 0.5 }) as Filter & { _name?: string };
    expect(f).toBeInstanceOf(Filter);
    expect(f._name).toBe('k');
  });

  it('throws on an unknown filter type', () => {
    // @ts-expect-error — intentionally invalid to trigger the runtime error.
    expect(() => createFilter({ type: 'no-such-filter' })).toThrow(/unknown filter type/);
  });
});

describe('createFilter — custom', () => {
  it('passes a user-provided Filter instance through unchanged + tags _name', () => {
    class MyFilter extends Filter {
      myProp = 1;
    }
    const my = new MyFilter();
    const out = createFilter({ type: 'custom', name: 'glow', filter: my }) as Filter & { _name?: string; myProp: number };
    expect(out).toBe(my);
    expect(out._name).toBe('glow');
    expect(out.myProp).toBe(1);
  });

  it('allows omitting the name (animation paths simply not addressable)', () => {
    const f = new Filter();
    const out = createFilter({ type: 'custom', filter: f }) as Filter & { _name?: string };
    expect(out).toBe(f);
    expect(out._name).toBeUndefined();
  });

  it('throws on null / non-objects / objects without an apply method', () => {
    expect(() => createFilter({ type: 'custom', filter: null as unknown })).toThrow(/PIXI Filter/);
    expect(() => createFilter({ type: 'custom', filter: 'oops' as unknown })).toThrow(/PIXI Filter/);
    expect(() => createFilter({ type: 'custom', filter: { not: 'a filter' } as unknown })).toThrow(/PIXI Filter/);
  });

  it('accepts cross-realm filters via duck-typing (has an `apply` method)', () => {
    // Simulates a Filter instance loaded from a different bundled copy of pixi.js
    // (e.g. when consumers pull pixi-filters via a CDN that bundles its own pixi).
    const fake = { apply() { /* PIXI calls this during render */ }, otherProp: 42 };
    const out = createFilter({ type: 'custom', name: 'fake', filter: fake as unknown }) as { _name?: string; otherProp: number };
    expect(out).toBe(fake);
    expect(out._name).toBe('fake');
    expect(out.otherProp).toBe(42);
  });
});
