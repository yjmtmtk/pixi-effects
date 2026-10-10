import { Sprite, Texture } from 'pixi.js';
import { Sequence } from './Base';
import { evaluateExpr } from '../expr/Parser';
import { buildScope } from '../expr/Scope';
import { describeLayer } from '../core/lint';
import { suggestName } from '../core/options';
import { acquireGl, currentGl, releaseGl } from '../core/glShared';
import { glslErrors, shaderProblems, uniformFloats, uniformType, wrapFragment } from '../core/shaderChecks';
import type { PathRouters } from '../core/Timeline';
import type { PropValue, ShaderSequenceSpec } from '../types';

const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// A vector is an object with the keys '0', '1', … and not an array: a keyframe on 'uniforms.pos.1' addresses one component by its key
type UniformSlot = number | Record<string, number>;

/**
 * `type: 'shader'`: a Shadertoy `mainImage` drawn into a picture. Like the `three` layer it is a sprite whose texture is a canvas that is redrawn
 * for every frame (`awaitFrameAt`, the one frame path playback and export share), but every shader layer draws with ONE shared WebGL2 context
 * and copies the result into a 2D canvas of its own, so the number of layers is not limited by the browser's number of contexts.
 */
export class ShaderSequence extends Sequence {
  private prog: WebGLProgram | null = null;
  private progGeneration = -1;
  private w = 1;
  private h = 1;
  private c2d: HTMLCanvasElement | null = null;
  private fps = 30;
  private failed = false;
  private warnedNoGl = false;
  private acquired = false;
  private warnedPaths = new Set<string>();
  /** The current value of every uniform: what keyframes move (`uniforms.speed`, `uniforms.tint.0`). */
  private carrier: Record<string, UniformSlot> = {};
  /** How many components each vector uniform has (a scalar is not listed). */
  private dims: Record<string, number> = {};

  private get shaderSpec(): ShaderSequenceSpec { return this.spec as unknown as ShaderSequenceSpec; }

  protected override pathRouters(): PathRouters {
    return { uniforms: (path) => this.resolveUniform(path) };
  }

  async build(): Promise<void> {
    const spec = this.shaderSpec;
    const who = describeLayer(spec);
    for (const m of shaderProblems(spec)) console.warn(`pixi-effects: ${who}: ${m}`);
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = resolveDim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = resolveDim(spec.height, scope) ?? this.parent?.height ?? this.root.height;
    const res = typeof spec.resolution === 'number' && spec.resolution > 0 && spec.resolution <= 2 ? spec.resolution : 1;
    this.w = Math.max(1, Math.round(width * res));
    this.h = Math.max(1, Math.round(height * res));
    this.fps = this.root.frameRate ?? 30;
    for (const [name, v] of Object.entries(spec.uniforms ?? {})) {
      if (uniformType(v) === null) continue;
      if (typeof v === 'number') this.carrier[name] = v;
      else { const f = uniformFloats(v); this.carrier[name] = Object.fromEntries(f.map((x, i) => [String(i), x])); this.dims[name] = f.length; }
    }
    this.c2d = document.createElement('canvas');
    this.c2d.width = this.w; this.c2d.height = this.h;
    const sprite = new Sprite({ texture: Texture.from(this.c2d), label: spec.name });
    sprite.width = width; sprite.height = height;
    this.target = sprite;
    this.intrinsicWidth = width; this.intrinsicHeight = height;
    this.buildFilters();
    if (typeof spec.fragment === 'string' && spec.fragment.trim() !== '') this.acquire();
    else this.failed = true;
    this.drawAt(0);
  }

  async awaitFrameAt(local: number): Promise<void> {
    this.drawAt(Math.max(0, Math.min(local, this.duration ?? local)));
  }

  /** Resolve `uniforms.speed` / `uniforms.tint.0` for the keyframe pipeline; a name or index nobody has is said once and dropped. */
  private resolveUniform(path: string): { target: object; prop: string } | null {
    const segs = path.split('.');
    const name = segs[0]!;
    const slot = this.carrier[name];
    const warn = (why: string) => {
      if (this.warnedPaths.has(path)) return;
      this.warnedPaths.add(path);
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: keyframe path uniforms.${path} ${why}; skipped`);
    };
    if (slot === undefined) {
      const guess = suggestName(name, Object.keys(this.carrier));
      warn(`names no uniform "${name}"${guess ? `; did you mean "${guess}"?` : ''} (declare it in uniforms with a starting value)`);
      return null;
    }
    if (typeof slot === 'number') {
      if (segs.length !== 1) { warn(`has more than a name, but "${name}" is a single number`); return null; }
      return { target: this.carrier, prop: name };
    }
    const n = this.dims[name]!;
    const index = segs.length === 2 ? Number(segs[1]) : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      warn(`must name a component of "${name}" (0 to ${n - 1}): 'uniforms.${name}.0'`);
      return null;
    }
    return { target: slot, prop: String(index) };
  }

  private acquire(): void {
    const sh = acquireGl();
    this.acquired = true;
    if (!sh) { this.noGl(); return; }
    this.compile();
  }

  private noGl(): void {
    this.failed = true;
    if (!this.warnedNoGl) {
      this.warnedNoGl = true;
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: this browser has no WebGL2, so the shader cannot run; the layer is drawn as a checkerboard`);
    }
  }

  private compile(): void {
    const sh = currentGl();
    if (!sh) { this.noGl(); return; }
    const { gl } = sh;
    const spec = this.shaderSpec;
    const make = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = make(gl.VERTEX_SHADER, VERT);
    const fs = make(gl.FRAGMENT_SHADER, wrapFragment(spec.fragment, spec.uniforms ?? {}, !!spec.transparent).source);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
    const log = ok ? '' : (gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(p) || '');
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!ok) {
      gl.deleteProgram(p);
      this.failed = true;
      this.prog = null;
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: the fragment shader did not compile (the line numbers are the lines of your code):\n${glslErrors(log).join('\n')}\nThe layer is drawn as a checkerboard until it is fixed.`);
      return;
    }
    this.prog = p;
    this.progGeneration = sh.generation;
  }

  private drawAt(local: number): void {
    const c = this.c2d;
    if (!c) return;
    const ctx2 = c.getContext('2d');
    if (!ctx2) return;
    let sh = this.failed ? null : currentGl();
    if (sh && this.progGeneration !== sh.generation) { this.compile(); sh = this.failed ? null : currentGl(); }
    if (!sh || !this.prog) {
      const s = 32;                                           // a loud checkerboard, not a silent blank
      for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) { ctx2.fillStyle = (((x / s) + (y / s)) & 1) ? '#ff00ff' : '#220022'; ctx2.fillRect(x, y, s, s); }
    } else {
      const { gl, canvas } = sh;
      if (canvas.width !== this.w || canvas.height !== this.h) { canvas.width = this.w; canvas.height = this.h; }   // changing it empties the buffer: only when this layer's size differs
      gl.viewport(0, 0, this.w, this.h);
      gl.useProgram(this.prog);
      gl.uniform3f(gl.getUniformLocation(this.prog, 'iResolution'), this.w, this.h, 1);
      gl.uniform1f(gl.getUniformLocation(this.prog, 'iTime'), local);
      gl.uniform1i(gl.getUniformLocation(this.prog, 'iFrame'), Math.round(local * this.fps));
      for (const [name, v] of Object.entries(this.carrier)) {
        const loc = gl.getUniformLocation(this.prog, name);
        if (typeof v === 'number') { gl.uniform1f(loc, v); continue; }
        const n = this.dims[name]!;
        const comps = Array.from({ length: n }, (_, i) => v[String(i)] ?? 0);
        if (n === 2) gl.uniform2fv(loc, comps);
        else if (n === 3) gl.uniform3fv(loc, comps);
        else gl.uniform4fv(loc, comps);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx2.clearRect(0, 0, c.width, c.height);
      ctx2.drawImage(canvas, 0, 0);
    }
    (this.target as Sprite | null)?.texture.source.update();
  }

  override destroy(): void {
    const texture = (this.target as Sprite | null)?.texture;
    if (this.prog) {
      const sh = currentGl();
      if (sh && this.progGeneration === sh.generation) sh.gl.deleteProgram(this.prog);
      this.prog = null;
    }
    if (this.acquired) { this.acquired = false; releaseGl(); }
    if (this.c2d) { this.c2d.width = this.c2d.height = 1; this.c2d = null; }
    super.destroy();
    texture?.destroy(true);                                    // the canvas source is this layer's own
  }
}

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}
