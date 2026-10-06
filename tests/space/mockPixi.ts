/**
 * Minimal pixi.js stand-in for the 2.5D tests (no GPU, no DOM).
 * Use as: vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());
 */
export function createPixiMock() {
  class Rectangle {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  }
  class Matrix {
    a = 1; b = 0; c = 0; d = 1; tx = 0; ty = 0;
    translate(x: number, y: number) { this.tx += x; this.ty += y; return this; }
  }
  class Container {
    x = 0; y = 0; rotation = 0; alpha = 1;
    visible = true; renderable = true; zIndex = 0;
    cullable = false; cullableChildren = false; sortableChildren = false;
    cullArea: Rectangle | null = null;
    filterArea: Rectangle | null = null;
    filters: unknown[] | null = null;
    label: string | undefined;
    mask: Container | null = null;
    children: Container[] = [];
    destroyed = false;
    scale = { x: 1, y: 1 };
    pivot = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
    constructor(opts?: { label?: string }) { this.label = opts?.label; }
    addChild(c: Container) { this.children.push(c); return c; }
    setMask(opts: { mask: Container | null }) { this.mask = opts.mask; }
    getLocalBounds() { return new Rectangle(0, 0, 200, 100); }
    // global bounds: a 200x100 box at the container's position (tests place layers with x / y)
    getBounds() { return new Rectangle(this.x, this.y, 200, 100); }
    destroy() { this.destroyed = true; }
  }
  class Texture {
    static WHITE = new Texture(1, 1);
    static from(source: unknown) { const t = new Texture(1, 1) as Texture & { source?: unknown }; t.source = source; return t; }
    destroyed = false;
    constructor(public width = 1, public height = 1) {}
    destroy() { this.destroyed = true; }
  }
  class RenderTexture extends Texture {
    resolution = 1;
    static create(o: { width: number; height: number; resolution?: number }) {
      const rt = new RenderTexture(o.width, o.height);
      rt.resolution = o.resolution ?? 1;
      return rt;
    }
    resize(width: number, height: number, resolution?: number) {
      this.width = width; this.height = height;
      if (resolution !== undefined) this.resolution = resolution;
      return this;
    }
  }
  class PerspectiveMesh extends Container {
    texture: Texture;
    corners: number[] = [];
    geometry = { setCorners: (...c: number[]) => { this.corners = c; } };
    constructor(o: { texture: Texture; label?: string }) {
      super();
      this.texture = o.texture;
    }
  }
  class Sprite extends Container {}
  class Text extends Container {
    width = 0; height = 0; style: Record<string, unknown> = {}; text = '';
    constructor(opts: Record<string, unknown> = {}) { super(); this.text = String(opts.text ?? ''); }
  }
  class Graphics extends Container {
    clear() { return this; }
    getLocalBounds() { return new Rectangle(0, 0, 0, 0); }
  }
  // Drawing calls are chainable no-ops (tests only care about timing / scene wiring).
  for (const m of ['rect', 'roundRect', 'circle', 'ellipse', 'moveTo', 'lineTo', 'arc', 'poly', 'path', 'closePath', 'beginPath', 'fill', 'stroke', 'svg']) {
    (Graphics.prototype as unknown as Record<string, unknown>)[m] = function (this: unknown) { return this; };
  }
  class GraphicsPath { shapePath = { shapePrimitives: [] as unknown[] }; constructor(public svgD: string) {} }
  /** Text measuring: every character is `fontSize / 2 + letterSpacing` wide, a line is `fontSize * 1.2` tall. */
  class TextStyle { constructor(public options: Record<string, unknown> = {}) {} }
  const CanvasTextMetrics = {
    measureText(text: string, style: TextStyle) {
      const fs = Number(style.options.fontSize ?? 26), ls = Number(style.options.letterSpacing ?? 0);
      const lines = text.split('\n');
      return { width: Math.max(...lines.map(l => l.length * (fs / 2 + ls))), height: lines.length * fs * 1.2, lines, lineHeight: fs * 1.2 };
    },
  };
  class FillGradient { constructor(public options: Record<string, unknown>) {} }
  class Filter { resources: Record<string, unknown> = {}; constructor(_opts?: unknown) {} apply() {} }
  class GlProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GlProgram(o); } }
  class GpuProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GpuProgram(o); } }
  class UniformGroup {
    uniforms: Record<string, unknown>;
    constructor(u: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
    }
  }
  return {
    Container, Rectangle, Matrix, Texture, RenderTexture, PerspectiveMesh,
    Sprite, Text, Graphics, GraphicsPath, FillGradient, TextStyle, CanvasTextMetrics,
    Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '',
    Assets: { get: async () => null },
  };
}
