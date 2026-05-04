import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal PIXI mock — Sprite (for Image) and Text (with style.fill) — plus
// the Filter / Container etc. shims our other code paths import.
const calls: Array<{ method: string; args: unknown[]; on?: string }> = [];

vi.mock('pixi.js', () => {
  class Rectangle { constructor(public x: number, public y: number, public width: number, public height: number) {} }
  class Container {
    cullable = false; cullableChildren = false; renderable = true;
    cullArea: Rectangle | null = null;
    filterArea: Rectangle | null = null;
    filters: unknown[] | null = null;
    label: string | undefined;
    mask: Container | null = null;
    children: Container[] = [];
    pivot = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    addChild(c: Container) { this.children.push(c); return c; }
    constructor(opts?: { label?: string }) { this.label = opts?.label; }
    destroy() {}
  }
  class Sprite extends Container {
    tint: string | number = 0xffffff;
    constructor(opts?: { texture?: { width: number; height: number }; label?: string }) {
      super(opts);
    }
  }
  class Text extends Container {
    width = 100; height = 50;
    text = '';
    style: Record<string, unknown> = { fill: '#000000' };
    constructor(opts?: { text?: string; style?: Record<string, unknown>; label?: string }) {
      super(opts);
      this.text = opts?.text ?? '';
      if (opts?.style) Object.assign(this.style, opts.style);
    }
  }
  class Graphics extends Container {
    context: unknown = null;
    constructor(opts?: { label?: string }) { super(opts); }
    private _record(method: string, ...args: unknown[]) { calls.push({ method, args, on: this.label }); return this; }
    clear() { return this._record('clear'); }
    rect(...a: unknown[]) { return this._record('rect', ...a); }
    roundRect(...a: unknown[]) { return this._record('roundRect', ...a); }
    circle(...a: unknown[]) { return this._record('circle', ...a); }
    ellipse(...a: unknown[]) { return this._record('ellipse', ...a); }
    moveTo(...a: unknown[]) { return this._record('moveTo', ...a); }
    lineTo(...a: unknown[]) { return this._record('lineTo', ...a); }
    poly(...a: unknown[]) { return this._record('poly', ...a); }
    path(...a: unknown[]) { return this._record('path', ...a); }
    fill(...a: unknown[]) { return this._record('fill', ...a); }
    stroke(...a: unknown[]) { return this._record('stroke', ...a); }
    getLocalBounds() { return new Rectangle(0, 0, 0, 0); }
  }
  class GraphicsPath { constructor(public svgD: string) {} }
  class Filter { resources: Record<string, unknown> = {}; constructor(_o?: unknown) {} apply() {} }
  class GlProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GlProgram(o); } }
  class GpuProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GpuProgram(o); } }
  class UniformGroup { uniforms: Record<string, unknown>; constructor(u: Record<string, { value: unknown }>) { this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value])); } }
  return {
    Container, Sprite, Text, Graphics, GraphicsPath, Rectangle,
    Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '',
    Assets: { get: async (_n: string) => ({ width: 100, height: 100 }) },
  };
});

import { gsap } from 'gsap';
import { ImageSequence } from '../../src/sequences/Image';
import { TextSequence } from '../../src/sequences/Text';
import type { ImageSequenceSpec, TextSequenceSpec, CompositionShape } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };

beforeEach(() => { calls.length = 0; });

async function buildImage(spec: ImageSequenceSpec) {
  const seq = new ImageSequence(spec, root, root);
  await seq.build();
  return seq;
}
async function buildText(spec: TextSequenceSpec) {
  const seq = new TextSequence(spec, root, root);
  await seq.build();
  return seq;
}

describe('ImageSequence — colorSpace tint animation', () => {
  it('with colorSpace="oklch", tint at midpoint differs noticeably from sRGB midpoint', async () => {
    const seq = await buildImage({
      type: 'image', asset: 'square', duration: 5,
      colorSpace: 'oklch',
      initial: { tint: '#ff0000' },
      keyframes: [{ at: 0, to: { tint: '#00ff00' }, duration: 2, ease: 'none' }],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    tl.time(1); // midpoint
    const tint = (seq as unknown as { target: { tint: string } }).target.tint;
    // OKLCH red→green midpoint should be a saturated orange — high red,
    // moderate green, no blue.
    const m = tint.match(/rgba\((\d+),(\d+),(\d+),/);
    expect(m).not.toBeNull();
    const r = +m![1]!, g = +m![2]!, b = +m![3]!;
    expect(r).toBeGreaterThan(220);
    expect(g).toBeGreaterThan(120);
    expect(b).toBeLessThan(40);
  });

  it('without colorSpace (default rgb), the standard pipeline runs and tint is left alone here', async () => {
    // Without colorSpace, tint flows through PixiPlugin's native path.
    // We can't fully exercise that without GSAP's PixiPlugin running — but
    // we can prove our custom path is NOT used: target.tint stays at the
    // initial sprite default (0xffffff) until a tween-aware renderer runs.
    const seq = await buildImage({
      type: 'image', asset: 'square', duration: 5,
      initial: { tint: '#ff0000' },
      keyframes: [{ at: 0, to: { tint: '#00ff00' }, duration: 2 }],
    });
    const sprite = (seq as unknown as { target: { tint: number | string } }).target;
    // Initial tint isn't pre-applied by our custom path in the rgb-default
    // branch — it's left for the standard pipeline.
    expect(sprite.tint).toBe(0xffffff);
  });
});

describe('TextSequence — colorSpace fill animation', () => {
  it('animates text.style.fill smoothly through OKLab', async () => {
    const seq = await buildText({
      type: 'text', text: 'hi', duration: 5,
      colorSpace: 'oklab',
      style: { fill: '#ff0000' },
      keyframes: [{ at: 0, to: { fill: '#00ff00' }, duration: 2, ease: 'none' }],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    tl.time(1); // midpoint
    const fill = (seq as unknown as { target: { style: { fill: string } } }).target.style.fill;
    // OKLab red→green midpoint sits in the warm orange / mustard range.
    const m = fill.match(/rgba\((\d+),(\d+),(\d+),/);
    expect(m).not.toBeNull();
    const r = +m![1]!, g = +m![2]!, b = +m![3]!;
    expect(b).toBeLessThan(40);
    expect(r + g).toBeGreaterThan(128 + 128); // brighter than naive sRGB (128, 128, 0)
  });

  it('default (no colorSpace) still permits explicit `fill` keyframes via sRGB', async () => {
    const seq = await buildText({
      type: 'text', text: 'hi', duration: 5,
      style: { fill: '#ff0000' },
      keyframes: [{ at: 0, to: { fill: '#00ff00' }, duration: 2, ease: 'none' }],
    });
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    tl.time(2); // end of tween
    const fill = (seq as unknown as { target: { style: { fill: string } } }).target.style.fill;
    // GSAP's sRGB interp may return either an `rgba(r,g,b,a)` string or a
    // hex `#RRGGBB`. Either way, the endpoint is pure green.
    const rgbaMatch = fill.match(/rgba\((\d+),(\d+),(\d+),/);
    const hexMatch = fill.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (rgbaMatch) {
      expect(+rgbaMatch[2]!).toBeGreaterThan(240);
    } else if (hexMatch) {
      expect(parseInt(hexMatch[2]!, 16)).toBeGreaterThan(240);
    } else {
      throw new Error(`unexpected fill format: ${fill}`);
    }
  });
});
