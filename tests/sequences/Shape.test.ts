import { describe, it, expect, vi, beforeEach } from 'vitest';

// PIXI v8 isn't usable headless. Mock just enough of Graphics /
// GraphicsContext to record the calls drawShape() makes — that's all we
// need to verify routing per shape kind and expression resolution.
const calls: Array<{ method: string; args: unknown[] }> = [];
// Per-test override for what `getLocalBounds()` returns. Lets the
// auto-centring test exercise the pivot computation without having to
// implement real bbox math in the mock.
let nextBounds: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 0, height: 0 };
let lastGraphics: { pivot: { x: number; y: number; set: (x: number, y: number) => void } } | null = null;

vi.mock('pixi.js', () => {
  class Rectangle { constructor(public x: number, public y: number, public width: number, public height: number) {} }
  class Container {
    cullable = false; cullableChildren = false; renderable = true;
    cullArea: Rectangle | null = null;
    filterArea: Rectangle | null = null;
    filters: unknown[] | null = null;
    label: string | undefined;
    addChild(_c: unknown) { return _c; }
    constructor(opts?: { label?: string }) { this.label = opts?.label; }
    destroy() {}
  }
  class Graphics extends Container {
    context: unknown = null;
    pivot = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    constructor(opts?: { label?: string }) { super(opts); lastGraphics = this; }
    private _record(method: string, ...args: unknown[]) { calls.push({ method, args }); return this; }
    rect(...args: unknown[]) { return this._record('rect', ...args); }
    roundRect(...args: unknown[]) { return this._record('roundRect', ...args); }
    circle(...args: unknown[]) { return this._record('circle', ...args); }
    ellipse(...args: unknown[]) { return this._record('ellipse', ...args); }
    moveTo(...args: unknown[]) { return this._record('moveTo', ...args); }
    lineTo(...args: unknown[]) { return this._record('lineTo', ...args); }
    poly(...args: unknown[]) { return this._record('poly', ...args); }
    path(...args: unknown[]) { return this._record('path', ...args); }
    fill(...args: unknown[]) { return this._record('fill', ...args); }
    stroke(...args: unknown[]) { return this._record('stroke', ...args); }
    getLocalBounds() { return new Rectangle(nextBounds.x, nextBounds.y, nextBounds.width, nextBounds.height); }
  }
  class GraphicsPath {
    constructor(public svgD: string) { calls.push({ method: 'GraphicsPath', args: [svgD] }); }
  }
  class Sprite extends Container {}
  class Text extends Container { width = 0; height = 0; style: Record<string, unknown> = {}; }
  // Filter pipeline stubs — Shape.ts pulls in src/sequences/Base which pulls in
  // src/filters; mock just enough to satisfy the imports.
  class Filter { resources: Record<string, unknown> = {}; constructor(_opts?: unknown) {} apply() {} }
  class GlProgram { constructor(_opts: unknown) {} static from(opts: unknown) { return new GlProgram(opts); } }
  class GpuProgram { constructor(_opts: unknown) {} static from(opts: unknown) { return new GpuProgram(opts); } }
  class UniformGroup { uniforms: Record<string, unknown>; constructor(u: Record<string, { value: unknown }>) { this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value])); } }
  return {
    Container, Graphics, GraphicsPath, Rectangle, Sprite, Text,
    Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '',
    Assets: { get: async () => null },
  };
});

import { ShapeSequence } from '../../src/sequences/Shape';
import type { ShapeSequenceSpec, CompositionShape } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };

beforeEach(() => {
  calls.length = 0;
  nextBounds = { x: 0, y: 0, width: 0, height: 0 };
  lastGraphics = null;
});

function build(spec: ShapeSequenceSpec) {
  const seq = new ShapeSequence(spec, root, root);
  return seq.build().then(() => seq);
}

describe('ShapeSequence — geometry routing', () => {
  it('rect: draws a centred rect and falls back to .rect() with no corner radius', async () => {
    await build({ type: 'shape', shape: 'rect', width: 200, height: 100, duration: 1 });
    const rect = calls.find(c => c.method === 'rect');
    expect(rect?.args).toEqual([-100, -50, 200, 100]);
    expect(calls.some(c => c.method === 'roundRect')).toBe(false);
  });

  it('rect with cornerRadius: routes to .roundRect()', async () => {
    await build({ type: 'shape', shape: 'rect', width: 80, height: 60, cornerRadius: 12, duration: 1 });
    const rr = calls.find(c => c.method === 'roundRect');
    expect(rr?.args).toEqual([-40, -30, 80, 60, 12]);
  });

  it('rect: resolves expressions against the scope (W, H)', async () => {
    await build({ type: 'shape', shape: 'rect', width: 'W * 0.5', height: 'H * 0.25', duration: 1 });
    const rect = calls.find(c => c.method === 'rect');
    // W=1280, H=720 → w=640, h=180 → centred at (-320, -90)
    expect(rect?.args).toEqual([-320, -90, 640, 180]);
  });

  it('circle: uses .circle(0, 0, r)', async () => {
    await build({ type: 'shape', shape: 'circle', radius: 50, duration: 1 });
    expect(calls.find(c => c.method === 'circle')?.args).toEqual([0, 0, 50]);
  });

  it('ellipse: uses .ellipse(0, 0, rx, ry)', async () => {
    await build({ type: 'shape', shape: 'ellipse', radiusX: 80, radiusY: 30, duration: 1 });
    expect(calls.find(c => c.method === 'ellipse')?.args).toEqual([0, 0, 80, 30]);
  });

  it('line: emits moveTo + lineTo', async () => {
    await build({ type: 'shape', shape: 'line', from: [0, 0], to: [100, 50], duration: 1 });
    expect(calls.find(c => c.method === 'moveTo')?.args).toEqual([0, 0]);
    expect(calls.find(c => c.method === 'lineTo')?.args).toEqual([100, 50]);
  });

  it('polygon: flattens points and closes by default', async () => {
    await build({ type: 'shape', shape: 'polygon', points: [[0, 0], [10, 0], [5, 10]], duration: 1 });
    const poly = calls.find(c => c.method === 'poly');
    expect(poly?.args).toEqual([[0, 0, 10, 0, 5, 10], true]);
  });

  it('polygon open: passes false for the closed flag', async () => {
    await build({ type: 'shape', shape: 'polygon', points: [[0, 0], [10, 0]], open: true, duration: 1 });
    expect(calls.find(c => c.method === 'poly')?.args?.[1]).toBe(false);
  });

  it('path: builds a GraphicsPath from the `d` string and adds it via .path()', async () => {
    await build({ type: 'shape', shape: 'path', d: 'M 0 0 L 10 10', duration: 1 });
    const gp = calls.find(c => c.method === 'GraphicsPath');
    expect(gp?.args[0]).toBe('M 0 0 L 10 10');
    expect(calls.some(c => c.method === 'path')).toBe(true);
  });
});

describe('ShapeSequence — initial style', () => {
  it('fillColor only: emits .fill() with that colour, no .stroke()', async () => {
    await build({
      type: 'shape', shape: 'circle', radius: 20, duration: 1,
      initial: { fillColor: '#ff3344' },
    });
    expect(calls.find(c => c.method === 'fill')?.args[0]).toEqual({ color: '#ff3344', alpha: 1 });
    expect(calls.some(c => c.method === 'stroke')).toBe(false);
  });

  it('strokeColor with strokeWidth: emits .stroke() with full opts', async () => {
    await build({
      type: 'shape', shape: 'rect', width: 50, height: 50, duration: 1,
      initial: { strokeColor: '#fff', strokeWidth: 4, strokeAlpha: 0.5 },
    });
    expect(calls.find(c => c.method === 'stroke')?.args[0]).toEqual({ color: '#fff', alpha: 0.5, width: 4 });
  });

  it('strokeColor without width: skips .stroke() (a 0-width stroke is invisible)', async () => {
    await build({
      type: 'shape', shape: 'rect', width: 50, height: 50, duration: 1,
      initial: { strokeColor: '#fff' },
    });
    expect(calls.some(c => c.method === 'stroke')).toBe(false);
  });

  it('fill + stroke together: emits both', async () => {
    await build({
      type: 'shape', shape: 'rect', width: 50, height: 50, duration: 1,
      initial: { fillColor: 0x3399ff, fillAlpha: 0.8, strokeColor: 0xffffff, strokeWidth: 2 },
    });
    expect(calls.find(c => c.method === 'fill')?.args[0]).toEqual({ color: 0x3399ff, alpha: 0.8 });
    expect(calls.find(c => c.method === 'stroke')?.args[0]).toEqual({ color: 0xffffff, alpha: 1, width: 2 });
  });

  it('no style: draws geometry but never fills or strokes', async () => {
    await build({ type: 'shape', shape: 'rect', width: 50, height: 50, duration: 1 });
    expect(calls.some(c => c.method === 'rect')).toBe(true);
    expect(calls.some(c => c.method === 'fill')).toBe(false);
    expect(calls.some(c => c.method === 'stroke')).toBe(false);
  });
});

describe('ShapeSequence — auto-centring via pivot', () => {
  it('symmetrical bbox (rect / circle / ellipse) leaves pivot at (0, 0)', async () => {
    nextBounds = { x: -50, y: -50, width: 100, height: 100 };
    await build({ type: 'shape', shape: 'circle', radius: 50, duration: 1 });
    expect(lastGraphics?.pivot.x).toBe(0);
    expect(lastGraphics?.pivot.y).toBe(0);
  });

  it('off-centre bbox (polygon / path) sets pivot to the bbox centre', async () => {
    // E.g. an SVG-path heart whose bbox happens to sit at x in [-70, 70],
    // y in [-50, 30] → centre is (0, -10).
    nextBounds = { x: -70, y: -50, width: 140, height: 80 };
    await build({ type: 'shape', shape: 'path', d: 'M 0 0 Z', duration: 1 });
    expect(lastGraphics?.pivot.x).toBe(0);
    expect(lastGraphics?.pivot.y).toBe(-10);
  });

  it('non-zero bbox origin (e.g. polygon shifted right) shifts pivot accordingly', async () => {
    nextBounds = { x: 20, y: 0, width: 80, height: 60 };
    await build({ type: 'shape', shape: 'polygon', points: [[20, 0], [100, 0], [60, 60]], duration: 1 });
    expect(lastGraphics?.pivot.x).toBe(60); // 20 + 80/2
    expect(lastGraphics?.pivot.y).toBe(30); // 0 + 60/2
  });
});
