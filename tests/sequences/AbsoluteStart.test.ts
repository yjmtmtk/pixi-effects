import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from '../../src/sequences/Base';
import type { CompositionShape, SequenceSpec } from '../../src/types';

// Mock PIXI for Image/Shape tests
vi.mock('pixi.js', () => {
  class Rectangle { constructor(public x: number, public y: number, public width: number, public height: number) {} }
  class Container {
    cullable = false;
    renderable = true;
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
  class Graphics extends Container {
    constructor(opts?: { label?: string }) { super(opts); }
    clear() { return this; }
    rect(..._a: unknown[]) { return this; }
    roundRect(..._a: unknown[]) { return this; }
    circle(..._a: unknown[]) { return this; }
    ellipse(..._a: unknown[]) { return this; }
    getLocalBounds() { return new Rectangle(0, 0, 100, 100); }
    fill(..._a: unknown[]) { return this; }
    stroke(..._a: unknown[]) { return this; }
  }
  class GraphicsPath { constructor(public svgD: string) {} }
  class Filter { resources: Record<string, unknown> = {}; constructor(_o?: unknown) {} apply() {} }
  class UniformGroup { uniforms: Record<string, unknown>; constructor(u: Record<string, { value: unknown }>) { this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value])); } }
  return {
    Container, Sprite, Graphics, GraphicsPath, Rectangle, Filter, UniformGroup,
    Assets: { get: async (_n: string) => ({ width: 100, height: 100 }) },
  };
});

import { ShapeSequence } from '../../src/sequences/Shape';
import { ImageSequence } from '../../src/sequences/Image';
import type { ShapeSequenceSpec, ImageSequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 100, height: 100, duration: 10 };

class StubSequence extends Sequence {
  async build(): Promise<void> {
    this.target = new Container();
  }
}

function makeSeq(at: number): StubSequence {
  const spec = { type: 'shape', shape: 'rect', width: 1, height: 1, at, duration: 2 } as SequenceSpec;
  return new StubSequence(spec, shape, shape);
}

describe('Sequence.absoluteStart', () => {
  it('is null before bindTimeline', async () => {
    const seq = makeSeq(1);
    await seq.build();
    expect(seq.absoluteStart).toBeNull();
  });

  it('records offset + at when bound', async () => {
    const seq = makeSeq(1);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl, 3); // nested composition starting at t=3
    expect(seq.absoluteStart).toBe(4);
    tl.kill();
  });

  it('equals at when bound with no offset', async () => {
    const seq = makeSeq(1.5);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl);
    expect(seq.absoluteStart).toBe(1.5);
    tl.kill();
  });

  it('ShapeSequence sets absoluteStart in bindTimeline', async () => {
    const root: CompositionShape = { width: 100, height: 100, duration: 10 };
    const spec: ShapeSequenceSpec = {
      type: 'shape',
      shape: 'rect',
      width: 10,
      height: 10,
      at: 1,
      duration: 2,
    };
    const seq = new ShapeSequence(spec, root, root);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl, 3); // offset=3, at=1 → startTime=4
    expect(seq.absoluteStart).toBe(4);
    tl.kill();
  });

  it('ImageSequence with colorSpace="oklab" sets absoluteStart in bindTimeline', async () => {
    const root: CompositionShape = { width: 100, height: 100, duration: 10 };
    const spec: ImageSequenceSpec = {
      type: 'image',
      asset: 'test-asset',
      at: 2,
      duration: 3,
      colorSpace: 'oklab',
    };
    const seq = new ImageSequence(spec, root, root);
    await seq.build();
    const tl = gsap.timeline({ paused: true });
    seq.bindTimeline(tl, 5); // offset=5, at=2 → startTime=7
    expect(seq.absoluteStart).toBe(7);
    tl.kill();
  });
});
