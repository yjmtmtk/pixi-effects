import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';
import { suggestName, warnUnknownOptions } from '../core/options';
import { hash32 } from './Grain';

/**
 * `{ type: 'warp' }`: a layer's picture bent by a travelling wave (`wave`) or a drifting noise (`haze`: heat shimmer, water). The offset of a
 * pixel is a pure function of (kind, its position, the frame's time, the options): the integer hash of `grain` (no sin() fed with a large
 * phase), and the time the movie hands every `TimeFilter`. So a frame is the same picture however it was reached.
 */
export const WARP_KINDS = ['wave', 'haze'] as const;
export type WarpKind = (typeof WARP_KINDS)[number];

export interface WarpOptions {
  /** `'wave'` (default) or `'haze'`. */
  kind?: WarpKind;
  /** The largest shift in px (default 6). */
  strength?: number;
  /** Wavelength (`wave`) or size of the noise cells (`haze`) in px (default 80). */
  scale?: number;
  /** Phase cycles per second for `wave`, drift per second in cells for `haze` (default 0.5; 0 stands still). */
  speed?: number;
  /** Direction the wave travels, in degrees (default 0: to the right, so the picture shifts up and down). */
  angle?: number;
  /** Another noise pattern for `haze` (integer, default 0). */
  seed?: number;
}

const OPTION_KEYS = ['kind', 'strength', 'scale', 'speed', 'angle', 'seed'] as const;
const DEG = Math.PI / 180;

const smooth = (f: number): number => f * f * (3 - 2 * f);
/** A random number in 0..1 for the lattice point (x, y): the integer hash of the shader. */
function lattice(x: number, y: number, seed: number): number {
  const k = hash32(seed >>> 0);                                    // the shader: hash(uint(p.x) + hash(uint(p.y) + hash(k))), k = hash(seed)
  const h = hash32(((x >>> 0) + hash32(((y >>> 0) + hash32(k)) >>> 0)) >>> 0);
  return (h >>> 8) / 16777215;
}
/** Smooth value noise in 0..1 at (x, y). */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** The same maths as the shader, in px: where to read the picture instead of at (x, y). The tests compare the GPU picture against it. */
export function warpOffset(kind: WarpKind, x: number, y: number, t: number, o: { strength: number; scale: number; speed: number; angle: number; seed: number }): { dx: number; dy: number } {
  if (kind === 'wave') {
    const a = o.angle * DEG;
    const phase = (x * Math.cos(a) + y * Math.sin(a)) / o.scale - o.speed * t;
    const s = o.strength * Math.sin(2 * Math.PI * phase);
    return { dx: -Math.sin(a) * s, dy: Math.cos(a) * s };
  }
  const px = x / o.scale, py = y / o.scale - o.speed * t;
  return {
    dx: o.strength * (valueNoise(px, py, o.seed) - 0.5) * 2,
    dy: o.strength * (valueNoise(px + 37.2, py + 17.8, o.seed) - 0.5) * 2,
  };
}

const HASH_GL = `
uint hash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float lattice(ivec2 p, uint k) {
  uint h = hash(uint(p.x) + hash(uint(p.y) + hash(k)));
  return float(h >> 8) / 16777215.0;
}
float valueNoise(vec2 q, uint k) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 p = ivec2(i);
  float a = lattice(p, k), b = lattice(p + ivec2(1, 0), k), c = lattice(p + ivec2(0, 1), k), d = lattice(p + ivec2(1, 1), k);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`;

// pixi compiles GLSL as WebGL1-compatible by default (no uint); a shader that starts with `#version 300 es` is kept as ES 3.00,
// and then the vertex shader must be ES 3.00 too.
const GL_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const GL_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;
uniform float uStrength;
uniform float uScale;
uniform float uSpeed;
uniform float uAngle;
uniform float uSeed;
uniform float uMode;
uniform float uTime;
out vec4 finalColor;
${HASH_GL}
void main(void) {
  vec2 pos = vTextureCoord * uInputSize.xy;
  vec2 off;
  if (uMode < 0.5) {
    float phase = dot(pos, vec2(cos(uAngle), sin(uAngle))) / uScale - uSpeed * uTime;
    float s = uStrength * sin(6.28318530718 * phase);
    off = vec2(-sin(uAngle), cos(uAngle)) * s;
  } else {
    uint k = hash(uint(uSeed));
    vec2 p = vec2(pos.x / uScale, pos.y / uScale - uSpeed * uTime);
    off = uStrength * 2.0 * vec2(valueNoise(p, k) - 0.5, valueNoise(p + vec2(37.2, 17.8), k) - 0.5);
  }
  vec2 suv = clamp(vTextureCoord + off * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  finalColor = texture(uTexture, suv);
}`;

const WGSL_SOURCE = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};
struct WarpUniforms {
  uStrength: f32,
  uScale: f32,
  uSpeed: f32,
  uAngle: f32,
  uSeed: f32,
  uMode: f32,
  uTime: f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> warpUniforms : WarpUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv : vec2<f32>,
};
fn filterVertexPosition(aPosition : vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4<f32>(position, 0.0, 1.0);
}
fn filterTextureCoord(aPosition : vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}
@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(
    filterVertexPosition(aPosition),
    filterTextureCoord(aPosition),
  );
}

fn hash(xIn: u32) -> u32 {
  var x = xIn;
  x = x ^ (x >> 16u); x = x * 0x7feb352du; x = x ^ (x >> 15u); x = x * 0x846ca68bu; x = x ^ (x >> 16u);
  return x;
}
fn lattice(p: vec2<i32>, k: u32) -> f32 {
  let h = hash(u32(p.x) + hash(u32(p.y) + hash(k)));
  return f32(h >> 8u) / 16777215.0;
}
fn valueNoise(q: vec2<f32>, k: u32) -> f32 {
  let i = floor(q);
  let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  let p = vec2<i32>(i);
  let a = lattice(p, k);
  let b = lattice(p + vec2<i32>(1, 0), k);
  let c = lattice(p + vec2<i32>(0, 1), k);
  let d = lattice(p + vec2<i32>(1, 1), k);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let pos = uv * gfu.uInputSize.xy;
  var off = vec2<f32>(0.0);
  if (warpUniforms.uMode < 0.5) {
    let phase = dot(pos, vec2<f32>(cos(warpUniforms.uAngle), sin(warpUniforms.uAngle))) / warpUniforms.uScale - warpUniforms.uSpeed * warpUniforms.uTime;
    let s = warpUniforms.uStrength * sin(6.28318530718 * phase);
    off = vec2<f32>(-sin(warpUniforms.uAngle), cos(warpUniforms.uAngle)) * s;
  } else {
    let k = hash(u32(warpUniforms.uSeed));
    let p = vec2<f32>(pos.x / warpUniforms.uScale, pos.y / warpUniforms.uScale - warpUniforms.uSpeed * warpUniforms.uTime);
    off = warpUniforms.uStrength * 2.0 * vec2<f32>(valueNoise(p, k) - 0.5, valueNoise(p + vec2<f32>(37.2, 17.8), k) - 0.5);
  }
  let suv = clamp(uv + off * gfu.uInputSize.zw, gfu.uInputClamp.xy, gfu.uInputClamp.zw);
  return textureSampleLevel(uTexture, uSampler, suv, 0.0);
}`;

export class WarpFilter extends Filter {
  constructor(options: WarpOptions = {}) {
    warnUnknownOptions('warp filter', options, OPTION_KEYS);
    let { kind = 'wave', strength = 6, scale = 80, speed = 0.5, angle = 0, seed = 0 } = options;
    if (!(WARP_KINDS as readonly string[]).includes(kind)) {
      const guess = suggestName(String(kind), WARP_KINDS);
      console.warn(`pixi-effects: warp: kind ${JSON.stringify(kind)} is not supported${guess ? `; did you mean "${guess}"?` : ''} (use ${WARP_KINDS.join(' or ')}); wave is used`);
      kind = 'wave';
    }
    if (!(strength >= 0 && strength <= 200)) {
      console.warn(`pixi-effects: warp: strength ${strength} is not a number from 0 to 200: it is the largest shift in pixels (8 is a clear ripple); ${strength > 200 ? '200' : '0'} is used`);
      strength = strength > 200 ? 200 : 0;
    }
    if (!(scale > 0)) {
      console.warn(`pixi-effects: warp: scale ${scale} must be above 0: it is the wavelength in pixels (80 is the default); 1 is used`);
      scale = 1;
    }
    super({
      glProgram: GlProgram.from({ vertex: GL_VERTEX, fragment: GL_FRAGMENT, name: 'warp-filter' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL_SOURCE, entryPoint: 'mainVertex' }, fragment: { source: WGSL_SOURCE, entryPoint: 'mainFragment' } }),
      resources: {
        warpUniforms: new UniformGroup({
          uStrength: { value: strength, type: 'f32' }, uScale: { value: scale, type: 'f32' }, uSpeed: { value: speed, type: 'f32' },
          uAngle: { value: angle * DEG, type: 'f32' }, uSeed: { value: Math.floor(seed), type: 'f32' },
          uMode: { value: kind === 'haze' ? 1 : 0, type: 'f32' }, uTime: { value: 0, type: 'f32' },
        }),
      },
    });
    this.padding = Math.ceil(strength);                            // the shifted read may come from outside the layer
  }
  private get u(): Record<string, number> { return this.resources.warpUniforms.uniforms as Record<string, number>; }
  get kind(): WarpKind { return this.u.uMode === 1 ? 'haze' : 'wave'; }
  set kind(v: WarpKind) { this.u.uMode = v === 'haze' ? 1 : 0; }
  get strength(): number { return this.u.uStrength!; }
  set strength(v: number) { this.u.uStrength = v; this.padding = Math.ceil(Math.max(0, v)); }
  get scale(): number { return this.u.uScale!; }
  set scale(v: number) { this.u.uScale = Math.max(v, 1e-3); }
  get speed(): number { return this.u.uSpeed!; }
  set speed(v: number) { this.u.uSpeed = v; }
  get angle(): number { return this.u.uAngle! / DEG; }
  set angle(v: number) { this.u.uAngle = v * DEG; }
  get seed(): number { return this.u.uSeed!; }
  set seed(v: number) { this.u.uSeed = Math.floor(v); }
  /** The movie calls this with the time (s) of the frame it is about to draw. */
  setTime(t: number): void { this.u.uTime = t; }
}
