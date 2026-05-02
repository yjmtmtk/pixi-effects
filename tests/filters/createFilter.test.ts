import { describe, it, expect, vi } from 'vitest';

// PixiJS depends on a real browser (WebGL/canvas). For unit tests we only need
// the Filter base class to exist so `instanceof Filter` works; mock everything
// else just enough to satisfy the imports of the built-in filter wrappers.

vi.mock('pixi.js', () => {
  class Filter {
    resources: Record<string, unknown> = {};
    constructor(_opts?: unknown) { /* no-op */ }
  }
  class GlProgram { constructor(_opts: unknown) { /* no-op */ } }
  class BlurFilter extends Filter { strength = 8; quality = 4; constructor(_opts?: unknown) { super(); } }
  class ColorMatrixFilter extends Filter {
    alpha = 1;
    reset() {}
    brightness(_v: number, _multiply?: boolean) {}
    saturate(_v: number, _multiply?: boolean) {}
    contrast(_v: number, _multiply?: boolean) {}
    hue(_v: number, _multiply?: boolean) {}
  }
  class Color { constructor(public input: string) {} red = 0; green = 1; blue = 0; }
  return {
    Filter,
    GlProgram,
    BlurFilter,
    ColorMatrixFilter,
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

  it('builds blur filter', () => {
    const f = createFilter({ type: 'blur', name: 'b', strength: 4 }) as Filter & { _name?: string };
    expect(f).toBeInstanceOf(Filter);
    expect(f._name).toBe('b');
  });

  it('builds colorMatrix filter', () => {
    const f = createFilter({ type: 'colorMatrix', name: 'cm', saturate: 0.5 }) as Filter & { _name?: string };
    expect(f).toBeInstanceOf(Filter);
    expect(f._name).toBe('cm');
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

  it('throws if `filter` is not a PIXI Filter instance', () => {
    expect(() => createFilter({ type: 'custom', filter: { not: 'a filter' } as unknown }))
      .toThrow(/requires a `filter` that is a PIXI Filter instance/);
    expect(() => createFilter({ type: 'custom', filter: null as unknown }))
      .toThrow(/requires a `filter` that is a PIXI Filter instance/);
  });
});
