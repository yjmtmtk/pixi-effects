import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reuse the same minimal PIXI mock pattern as Shape.test — we only need
// Container / Graphics / Rectangle, plus a tiny shim for `mask` and
// `addChild` so we can prove the wiring.
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
    // Mirror PIXI v8's setMask({ mask, inverse }) so we can verify the
    // wiring picks the right path when `maskInverted` is on the spec.
    maskInverseSetting = false;
    children: Container[] = [];
    pivot = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    addChild(c: Container) { this.children.push(c); return c; }
    setMask(opts: { mask: Container | null; inverse?: boolean }) {
      this.mask = opts.mask;
      this.maskInverseSetting = !!opts.inverse;
    }
    constructor(opts?: { label?: string }) { this.label = opts?.label; }
    destroy() {}
  }
  class Graphics extends Container {
    context: unknown = null;
    constructor(opts?: { label?: string }) { super(opts); }
    private _record(method: string, ...args: unknown[]) { calls.push({ method, args, on: this.label }); return this; }
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
    getLocalBounds() { return new Rectangle(0, 0, 0, 0); }
  }
  class GraphicsPath { constructor(public svgD: string) {} }
  class Sprite extends Container {}
  class Text extends Container { width = 0; height = 0; style: Record<string, unknown> = {}; }
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

import { CompositionSequence } from '../../src/sequences/Composition';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';

const root: CompositionShape = { width: 1280, height: 720, duration: 10 };

beforeEach(() => { calls.length = 0; });

describe('Sequence — inline mask', () => {
  it('child with `mask` spec gets a `maskSequence` and `target.mask` wired', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        {
          type: 'shape', shape: 'rect', width: 200, height: 200,
          name: 'box',
          initial: { x: 'W/2', y: 'H/2', fillColor: '#ff0000' },
          mask: {
            type: 'shape', shape: 'circle', radius: 80,
            initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' },
          },
        },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();

    const child = seq._children[0]!;
    expect(child.spec.name).toBe('box');
    expect(child.maskSequence).not.toBeNull();
    expect(child.maskSequence?.spec.type).toBe('shape');
    expect((child.target as unknown as { mask: unknown }).mask).toBe(child.maskSequence?.target);
  });

  it('mask sequence is added to the same parent container as the child', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        {
          type: 'shape', shape: 'rect', width: 100, height: 100,
          initial: { x: 'W/2', y: 'H/2', fillColor: '#ff0000' },
          mask: { type: 'shape', shape: 'circle', radius: 50, initial: { x: 'W/2', y: 'H/2', fillColor: '#ffffff' } },
        },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();

    const inner = (seq.target as unknown as { children: unknown[] }).children[0] as { children: unknown[] };
    // Both the child (rect) and its mask (circle) sit in inner — that's
    // what gives them a shared coordinate space.
    expect(inner.children.length).toBe(2);
  });

  it('no mask spec → maskSequence stays null', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        { type: 'shape', shape: 'rect', width: 100, height: 100, initial: { x: 0, y: 0, fillColor: '#ff0000' } },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();
    const child = seq._children[0]!;
    expect(child.maskSequence).toBeNull();
    expect((child.target as unknown as { mask: unknown }).mask).toBeNull();
  });

  it('maskInverted: true routes through PIXI setMask({ inverse: true })', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        {
          type: 'shape', shape: 'rect', width: 100, height: 100,
          maskInverted: true,
          initial: { x: 0, y: 0, fillColor: '#ff0000' },
          mask: { type: 'shape', shape: 'circle', radius: 30, initial: { x: 0, y: 0, fillColor: '#ffffff' } },
        },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();
    const child = seq._children[0]!;
    expect((child.target as unknown as { maskInverseSetting: boolean }).maskInverseSetting).toBe(true);
    expect((child.target as unknown as { mask: unknown }).mask).toBe(child.maskSequence?.target);
  });

  it('maskInverted defaults to false (normal masking)', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        {
          type: 'shape', shape: 'rect', width: 100, height: 100,
          initial: { x: 0, y: 0, fillColor: '#ff0000' },
          mask: { type: 'shape', shape: 'circle', radius: 30, initial: { x: 0, y: 0, fillColor: '#ffffff' } },
        },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();
    const child = seq._children[0]!;
    expect((child.target as unknown as { maskInverseSetting: boolean }).maskInverseSetting).toBe(false);
  });

  it('destroy() also tears down the mask sequence', async () => {
    const spec: CompositionSequenceSpec = {
      type: 'composition',
      width: 1280, height: 720,
      sequences: [
        {
          type: 'shape', shape: 'rect', width: 50, height: 50,
          initial: { x: 0, y: 0, fillColor: '#ff0000' },
          mask: { type: 'shape', shape: 'circle', radius: 25, initial: { x: 0, y: 0, fillColor: '#ffffff' } },
        },
      ],
    };
    const seq = new CompositionSequence(spec, root, root);
    await seq.build();
    const child = seq._children[0]!;
    const maskTarget = child.maskSequence?.target;
    expect(maskTarget).not.toBeNull();

    child.destroy();
    expect(child.maskSequence).toBeNull();
    expect(child.target).toBeNull();
  });
});
