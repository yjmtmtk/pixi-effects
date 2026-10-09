// SPIKE 0.25 (throwaway): a Shadertoy-style fragment shader as a layer. ONE shared WebGL2 context for every shader layer; each layer draws into the
// shared canvas and copies the result into its own 2D canvas, which is the Pixi texture (so there is no context per layer: Chrome allows ~16).
import { Sprite, Texture } from 'pixi.js';
import { Sequence } from './Base';

let gl: WebGL2RenderingContext | null = null;
let glCanvas: HTMLCanvasElement | null = null;
function ctx(): WebGL2RenderingContext {
  if (gl) return gl;
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false })!;
  return gl;
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 iResolution;
uniform float iTime;
uniform int iFrame;
out vec4 pe_out;
`;
const FOOT = (transparent: boolean) => `
void main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); ${transparent ? 'pe_out = vec4(c.rgb * c.a, c.a);' : 'pe_out = vec4(c.rgb, 1.0);'} }
`;
const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

export class ShaderSequence extends Sequence {
  private prog: WebGLProgram | null = null;
  private w = 0; private h = 0;
  private c2d: HTMLCanvasElement | null = null;
  private uni: Record<string, number | number[]> = {};
  private fps = 30;
  async build(): Promise<void> {
    const spec = this.spec as unknown as { fragment: string; uniforms?: Record<string, number | number[]>; width?: number; height?: number; transparent?: boolean };
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    this.w = spec.width ?? this.parent?.width ?? this.root.width;
    this.h = spec.height ?? this.parent?.height ?? this.root.height;
    const g = ctx();
    const decl = Object.entries(spec.uniforms ?? {}).map(([k, v]) => `uniform ${typeof v === 'number' ? 'float' : 'vec' + v.length} ${k};`).join('\n') + '\n';
    const userLines = (HEAD + decl).split('\n').length - 1;
    const sh = (type: number, src: string) => { const s = g.createShader(type)!; g.shaderSource(s, src); g.compileShader(s); return s; };
    const vs = sh(g.VERTEX_SHADER, VERT), fs = sh(g.FRAGMENT_SHADER, HEAD + decl + '#line 1\n' + spec.fragment + FOOT(!!spec.transparent));
    const p = g.createProgram()!; g.attachShader(p, vs); g.attachShader(p, fs); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) {
      const log = g.getShaderInfoLog(fs) || g.getProgramInfoLog(p) || '';
      console.warn(`pixi-effects: shader layer: the fragment shader did not compile (line numbers are in your code):\n${log.trim()}`);
      this.prog = null;
    } else this.prog = p;
    void userLines;
    this.uni = { ...(spec.uniforms ?? {}) };
    this.c2d = document.createElement('canvas'); this.c2d.width = this.w; this.c2d.height = this.h;
    const sprite = new Sprite({ texture: Texture.from(this.c2d) });
    this.target = sprite; this.intrinsicWidth = this.w; this.intrinsicHeight = this.h;
    this.fps = this.root.frameRate ?? 30;
    this.drawAt(0);
  }
  private drawAt(local: number): void {
    const g = ctx();
    const c = this.c2d!; const ctx2 = c.getContext('2d')!;
    if (!this.prog) {                                  // a loud checkerboard instead of a silent blank
      const s = 32; for (let y = 0; y < this.h; y += s) for (let x = 0; x < this.w; x += s) { ctx2.fillStyle = ((x / s + y / s) & 1) ? '#ff00ff' : '#220022'; ctx2.fillRect(x, y, s, s); }
    } else {
      glCanvas!.width = this.w; glCanvas!.height = this.h;
      g.viewport(0, 0, this.w, this.h);
      g.useProgram(this.prog);
      g.uniform3f(g.getUniformLocation(this.prog, 'iResolution'), this.w, this.h, 1);
      g.uniform1f(g.getUniformLocation(this.prog, 'iTime'), local);
      g.uniform1i(g.getUniformLocation(this.prog, 'iFrame'), Math.round(local * this.fps));
      for (const [k, v] of Object.entries(this.uni)) {
        const loc = g.getUniformLocation(this.prog, k);
        if (typeof v === 'number') g.uniform1f(loc, v); else if (v.length === 2) g.uniform2fv(loc, v); else if (v.length === 3) g.uniform3fv(loc, v); else g.uniform4fv(loc, v);
      }
      g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
      g.drawArrays(g.TRIANGLES, 0, 3);
      ctx2.clearRect(0, 0, this.w, this.h); ctx2.drawImage(glCanvas!, 0, 0);
    }
    (this.target as Sprite).texture.source.update();
  }
  async awaitFrameAt(local: number): Promise<void> { this.drawAt(Math.max(0, Math.min(local, this.duration ?? local))); }
}
