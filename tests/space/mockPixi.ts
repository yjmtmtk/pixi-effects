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
    setMask(opts: { mask?: Container | null; inverse?: boolean }) { if (opts.mask !== undefined) this.mask = opts.mask; }
    effects: unknown[] = [];
    addEffect(effect: unknown) { this.effects.push(effect); }
    localTransform = { clone() { return { prepend() {} }; } };
    updateLocalTransform() {}
    getLocalBounds() { return new Rectangle(0, 0, 200, 100); }
    // global bounds: a 200x100 box at the container's position (tests place layers with x / y)
    getBounds() { return new Rectangle(this.x, this.y, 200, 100); }
    destroy() { this.destroyed = true; }
  }
  class Texture {
    static WHITE = new Texture(1, 1);
    static EMPTY = new Texture(1, 1);
    static from(source: unknown) { const t = new Texture(1, 1) as Texture & { source?: unknown }; t.source = { resource: source, update() {} }; return t; }
    destroyed = false;
    source: { style: Record<string, unknown> } = { style: {} };
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
  class Sprite extends Container { texture: Texture; constructor(t?: Texture) { super(); this.texture = t ?? new Texture(1, 1); } }
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
  /** Reads absolute M L H V C Q Z (curves sampled in 12 steps) into the sub-paths Pixi's own flattening gives. */
  class GraphicsPath {
    shapePath = { shapePrimitives: [] as Array<{ shape: { points: number[]; closePath: boolean } }> };
    constructor(public svgD: string) {
      const toks = svgD.match(/[MLHVCQZ]|-?\d*\.?\d+/g) ?? [];
      let cur: number[] = [];
      let i = 0;
      const num = () => Number(toks[i++]);
      const flush = (closed: boolean) => {
        if (cur.length >= 4) this.shapePath.shapePrimitives.push({ shape: { points: cur, closePath: closed } });
        cur = [];
      };
      const curve = (pts: number[][]) => {
        const [x0, y0] = [cur[cur.length - 2]!, cur[cur.length - 1]!];
        const all = [[x0, y0], ...pts];
        for (let s = 1; s <= 12; s++) {
          const u = s / 12;
          let level = all;
          while (level.length > 1) level = level.slice(1).map((q, k) => [level[k]![0]! + (q[0]! - level[k]![0]!) * u, level[k]![1]! + (q[1]! - level[k]![1]!) * u]);
          cur.push(level[0]![0]!, level[0]![1]!);
        }
      };
      while (i < toks.length) {
        const c = toks[i++]!;
        if (c === 'M') { flush(false); cur.push(num(), num()); }
        else if (c === 'L') cur.push(num(), num());
        else if (c === 'H') cur.push(num(), cur[cur.length - 1]!);
        else if (c === 'V') cur.push(cur[cur.length - 2]!, num());
        else if (c === 'C') curve([[num(), num()], [num(), num()], [num(), num()]]);
        else if (c === 'Q') curve([[num(), num()], [num(), num()]]);
        else if (c === 'Z') flush(true);
      }
      flush(false);
    }
  }
  /** Text measuring: every character is `fontSize / 2 + letterSpacing` wide, a line is `fontSize * 1.2` tall. */
  class TextStyle { constructor(public options: Record<string, unknown> = {}) {} }
  const CanvasTextMetrics = {
    measureText(text: string, style: TextStyle) {
      const fs = Number(style.options.fontSize ?? 26), ls = Number(style.options.letterSpacing ?? 0);
      const lines = text.split('\n');
      return { width: Math.max(...lines.map(l => l.length * (fs / 2 + ls))), height: lines.length * fs * 1.2, lines, lineHeight: fs * 1.2 };
    },
  };
  class AlphaMask { inverse = false; mask: unknown; constructor(o?: { mask?: unknown }) { this.mask = o?.mask; } }
  class FillGradient { destroyed = false; constructor(public options: Record<string, unknown>) {} destroy() { this.destroyed = true; } }
  class Filter { resources: Record<string, unknown> = {}; padding = 0; blendMode = 'normal'; constructor(opts?: { resources?: Record<string, unknown> }) { if (opts?.resources) this.resources = opts.resources; } apply() {} destroy() {} }
  class AlphaFilter extends Filter { alpha = 1; constructor(o?: { alpha?: number }) { super(); if (o?.alpha !== undefined) this.alpha = o.alpha; } }
  class BlendModeFilter extends Filter { options: unknown; constructor(options: unknown) { super(); this.options = options; } }
  const ExtensionType = { BlendMode: 'blend-mode' };
  const added: unknown[] = [];
  const extensions = { add(c: unknown) { added.push(c); }, __added: added };
  class GlProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GlProgram(o); } }
  class GpuProgram { constructor(_o: unknown) {} static from(o: unknown) { return new GpuProgram(o); } }
  class Shader { resources: Record<string, unknown>; destroyed = false; constructor(o: { resources?: Record<string, unknown> }) { this.resources = o.resources ?? {}; } destroy() { this.destroyed = true; } }
  const compileHighShaderGpuProgram = (_o: unknown) => ({});
  class UniformGroup {
    uniforms: Record<string, unknown>;
    update() {}
    constructor(u: Record<string, { value: unknown }>) {
      this.uniforms = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
    }
  }
  /** Just enough of Pixi's Color for the light layer: '#rgb', '#rrggbb' and 0xRRGGBB; anything else throws like Pixi does. */
  class Color {
    private rgb: [number, number, number] = [1, 1, 1];
    setValue(v: unknown) {
      let n: number | null = null;
      if (typeof v === 'number') n = v;
      else if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) n = parseInt(v.slice(1), 16);
      else if (typeof v === 'string' && /^#[0-9a-f]{3}$/i.test(v)) n = parseInt(v.slice(1).replace(/./g, c => c + c), 16);
      if (n === null || !Number.isFinite(n)) throw new Error('Unable to convert color ' + String(v));
      this.rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
      return this;
    }
    toArray() { return [this.rgb[0], this.rgb[1], this.rgb[2], 1]; }
  }
  return {
    Container, Rectangle, Matrix, Color, Texture, RenderTexture, PerspectiveMesh, AlphaMask,
    Sprite, Text, Graphics, GraphicsPath, FillGradient, TextStyle, CanvasTextMetrics,
    Filter, GlProgram, GpuProgram, UniformGroup, Shader, compileHighShaderGpuProgram, BlendModeFilter, AlphaFilter, ExtensionType, extensions, defaultFilterVert: '',
    Assets: { get: async () => null },
  };
}
