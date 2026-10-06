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
    destroy() { this.destroyed = true; }
  }
  class Texture {
    static WHITE = new Texture(1, 1);
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
  class Text extends Container { width = 0; height = 0; style: Record<string, unknown> = {}; }
  class Graphics extends Container {
    clear() { return this; }
    getLocalBounds() { return new Rectangle(0, 0, 0, 0); }
  }
  class GraphicsPath { constructor(public svgD: string) {} }
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
    Sprite, Text, Graphics, GraphicsPath,
    Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '',
    Assets: { get: async () => null },
  };
}
