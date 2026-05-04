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
    clear() { return this._record('clear'); }
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

describe('ShapeSequence — anchor', () => {
  it('rect default anchor (0.5, 0.5) draws the rect centred on the local origin', async () => {
    await build({ type: 'shape', shape: 'rect', width: 100, height: 50, duration: 1, initial: { fillColor: '#fff' } });
    // No anchor specified → x = -0.5 * 100 = -50, y = -0.5 * 50 = -25.
    const rect = calls.find(c => c.method === 'rect');
    expect(rect?.args).toEqual([-50, -25, 100, 50]);
  });

  it('rect anchorX:0 draws from the local origin rightward (x=0)', async () => {
    await build({ type: 'shape', shape: 'rect', width: 100, height: 50, anchorX: 0, duration: 1, initial: { fillColor: '#fff' } });
    const rect = calls.find(c => c.method === 'rect');
    // anchorX:0 → x = -0 * 100 = 0; anchorY default 0.5 → y = -25.
    expect(rect?.args).toEqual([0, -25, 100, 50]);
  });

  it('rect anchorX:1 draws to the LEFT of the origin (x = -width)', async () => {
    await build({ type: 'shape', shape: 'rect', width: 100, height: 50, anchorX: 1, duration: 1, initial: { fillColor: '#fff' } });
    const rect = calls.find(c => c.method === 'rect');
    expect(rect?.args).toEqual([-100, -25, 100, 50]);
  });

  it('progress-bar pattern: width animates 0 → W with anchorX:0; live state reflects the live width', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'rect', width: 0, height: 18, anchorX: 0, duration: 4,
      initial: { x: 0, y: 0, fillColor: '#5599ff' },
      keyframes: [{ at: 0, to: { width: 200 }, duration: 1, ease: 'none' }],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const g = (seq as unknown as { target: { onRender: () => void } }).target;
    const state = (seq as unknown as { _state: { width: number; anchorX: number } })._state;
    expect(state.anchorX).toBe(0);

    tl.time(0.5);
    expect(state.width).toBeCloseTo(100, 1);

    calls.length = 0;
    g.onRender();
    // anchorX:0 with width:100 → drawn from (0, -9) to (100, 9).
    const rect = calls.find(c => c.method === 'rect');
    expect(rect?.args[0]).toBe(0); // left edge stays at 0
    expect(rect?.args[2]).toBeCloseTo(100, 1);
  });

  it('anchored shapes (rect/circle/ellipse) skip the build-time auto-pivot', async () => {
    nextBounds = { x: 10, y: 20, width: 80, height: 60 };
    await build({ type: 'shape', shape: 'rect', width: 80, height: 60, duration: 1, initial: { fillColor: '#fff' } });
    // Without anchor, default 0.5/0.5 still draws around origin → bounds
    // would be symmetric. But even if bounds aren't symmetric (mocked here),
    // we deliberately skip the auto-pivot for anchored shape kinds.
    expect(lastGraphics?.pivot.x).toBe(0);
    expect(lastGraphics?.pivot.y).toBe(0);
  });
});

describe('ShapeSequence — geometry animation', () => {
  it('circle radius is keyframable; onRender re-issues the new radius', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'circle', radius: 50, duration: 5,
      initial: { fillColor: '#fff' },
      keyframes: [
        { at: 0, to: { radius: 100 }, duration: 1, ease: 'none' },
      ],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const g = (seq as unknown as { target: { onRender: () => void } }).target;
    const state = (seq as unknown as { _state: { radius: number } })._state;

    expect(state.radius).toBe(50);
    tl.time(0.5);
    expect(state.radius).toBeCloseTo(75, 1);

    // onRender should re-issue .circle() with the LIVE radius — not the
    // baked initial value.
    calls.length = 0;
    g.onRender();
    expect(calls.find(c => c.method === 'circle')?.args).toEqual([0, 0, state.radius]);
  });

  it('rect width / height / cornerRadius all animate independently', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'rect',
      width: 100, height: 50, cornerRadius: 0,
      duration: 5,
      initial: { fillColor: '#fff' },
      keyframes: [
        { at: 0, to: { width: 200, height: 100, cornerRadius: 20 }, duration: 1, ease: 'none' },
      ],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const state = (seq as unknown as { _state: { width: number; height: number; cornerRadius: number } })._state;

    tl.time(0);   expect(state.width).toBe(100);
    tl.time(0.5); expect(state.width).toBeCloseTo(150, 1); expect(state.height).toBeCloseTo(75, 1); expect(state.cornerRadius).toBeCloseTo(10, 1);
    tl.time(1);   expect(state.width).toBe(200);
  });

  it('ellipse radiusX / radiusY animate', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'ellipse', radiusX: 80, radiusY: 30, duration: 5,
      initial: { fillColor: '#fff' },
      keyframes: [
        { at: 0, to: { radiusX: 40, radiusY: 60 }, duration: 1, ease: 'none' },
      ],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const state = (seq as unknown as { _state: { radiusX: number; radiusY: number } })._state;
    tl.time(0.5);
    expect(state.radiusX).toBeCloseTo(60, 1);
    expect(state.radiusY).toBeCloseTo(45, 1);
  });
});

describe('ShapeSequence — keyframe chaining', () => {
  // Regression for the "fromValue locked at bind time" bug: when a
  // keyframe omits `from`, the tween must read the live state at tween
  // start (not capture the initial value at bind time and snap back).
  it('a strokeWidth tween chained 4→8→4 stays continuous (no snap-back)', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'circle', radius: 30, duration: 5,
      initial: { strokeColor: '#fff', strokeWidth: 4 },
      keyframes: [
        { at: 0, to: { strokeWidth: 8 }, duration: 1, ease: 'none' },
        { at: 1, to: { strokeWidth: 4 }, duration: 1, ease: 'none' },
      ],
    });

    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const state = (seq as unknown as { _state: { strokeWidth: number } })._state;

    tl.time(0);   expect(state.strokeWidth).toBeCloseTo(4, 1);
    tl.time(1);   expect(state.strokeWidth).toBeCloseTo(8, 1); // peak after the 4→8 ramp
    tl.time(1.5); expect(state.strokeWidth).toBeCloseTo(6, 1); // mid-tween of the 8→4 ramp
    tl.time(2);   expect(state.strokeWidth).toBeCloseTo(4, 1); // returned to 4
  });

  it('a colour tween chained #cc66ff → #88ccff → #cc66ff sweeps both directions', async () => {
    const { gsap } = await import('gsap');
    const seq = await build({
      type: 'shape', shape: 'circle', radius: 30, duration: 5,
      initial: { strokeColor: '#cc66ff', strokeWidth: 4 },
      keyframes: [
        { at: 0, to: { strokeColor: '#88ccff' }, duration: 1, ease: 'none' },
        { at: 1, to: { strokeColor: '#cc66ff' }, duration: 1, ease: 'none' },
      ],
    });

    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    const state = (seq as unknown as { _state: { strokeColor: string } })._state;

    // Spot-check: the second tween's midpoint must NOT equal the start
    // colour — it should be midway back from #88ccff toward #cc66ff.
    tl.time(1);   const peak = state.strokeColor;
    tl.time(1.5); const back = state.strokeColor;
    expect(back).not.toBe(peak);
    expect(back).not.toBe('#cc66ff');
  });
});

describe('ShapeSequence — animated style', () => {
  // The redraw closure is set on `target.onRender` and reads from the
  // shape's `_state`. Manually invoking it lets us prove that mutating
  // `_state` between renders changes what the next .fill() / .stroke()
  // would receive — which is exactly what the GSAP tween path does.
  it('onRender re-issues geometry + fill/stroke from the live _state', async () => {
    const seq = await build({
      type: 'shape', shape: 'circle', radius: 30, duration: 1,
      initial: { fillColor: '#ff0000', strokeColor: '#ffffff', strokeWidth: 2 },
    });
    const g = (seq as unknown as { target: { onRender: () => void } }).target;
    const state = (seq as unknown as { _state: { fillColor: unknown; strokeWidth: number } })._state;
    expect(state.fillColor).toBe('#ff0000');

    calls.length = 0;
    state.fillColor = '#00ff00';
    g.onRender();

    // Re-issued: clear → geometry → fill (with new colour) → stroke.
    expect(calls[0]?.method).toBe('clear');
    expect(calls.find(c => c.method === 'circle')?.args).toEqual([0, 0, 30]);
    expect(calls.find(c => c.method === 'fill')?.args[0]).toEqual({ color: '#00ff00', alpha: 1 });
    expect(calls.find(c => c.method === 'stroke')?.args[0]).toEqual({ color: '#ffffff', alpha: 1, width: 2 });
  });

  it('onRender skips stroke when strokeWidth is 0 (live)', async () => {
    const seq = await build({
      type: 'shape', shape: 'rect', width: 40, height: 40, duration: 1,
      initial: { fillColor: '#444', strokeColor: '#fff', strokeWidth: 4 },
    });
    const g = (seq as unknown as { target: { onRender: () => void } }).target;
    const state = (seq as unknown as { _state: { strokeWidth: number } })._state;

    state.strokeWidth = 0;
    calls.length = 0;
    g.onRender();
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
