import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';

/**
 * `{ type: 'grain' }` — film grain that is a pure function of (seed, time, pixel). Integer hash (no sin(), no Math.random()),
 * so the same frame is the same picture when reached by seeking forward, backward or by export, and on any GPU.
 * The grain is added to the un-premultiplied colour, weighted to the mid-tones (it fades out toward pure black and white, so it
 * neither lifts blacks nor clips highlights); zero-mean, so the average brightness of the layer does not change.
 */
const HASH_GL = `
uint hash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
// one gaussian-ish value (sum of the four bytes of a hash), mean 0, std 1
float gauss(ivec2 p, uint k) {
  uint h = hash(uint(p.x) + hash(uint(p.y) + hash(k)));
  float s = float(h & 255u) + float((h >> 8) & 255u) + float((h >> 16) & 255u) + float(h >> 24);
  return (s / 255.0 - 2.0) * 1.7320508;
}
// the grain value at a pixel: cells of size pixels, smoothly blended
float cell(vec2 pos, float size, uint k) {
  vec2 q = pos / size - 0.5;
  vec2 i = floor(q);
  vec2 f = fract(q);
  ivec2 p = ivec2(i);
  float a = gauss(p, k), b = gauss(p + ivec2(1, 0), k), c = gauss(p + ivec2(0, 1), k), d = gauss(p + ivec2(1, 1), k);
  float v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  vec2 wx = vec2(1.0 - f.x, f.x), wy = vec2(1.0 - f.y, f.y);
  return v * inversesqrt(dot(wx, wx) * dot(wy, wy));        // blending lowers the spread: keep std exactly 1 at every pixel
}`;

// pixi compiles GLSL as WebGL1-compatible by default (no uint); a shader that starts with `#version 300 es` is kept as ES 3.00,
// and then the vertex shader must be ES 3.00 too.
const GL_VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
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
uniform vec4 uInputSize;
uniform float uAmount;
uniform float uSize;
uniform float uSeed;
uniform float uFrame;
uniform float uColor;
out vec4 finalColor;
${HASH_GL}
void main(void) {
  vec4 raw = texture(uTexture, vTextureCoord);
  vec3 rgb = raw.a > 0.0 ? raw.rgb / raw.a : vec3(0.0);
  float L = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float w = clamp(4.0 * L * (1.0 - L), 0.0, 1.0);
  vec2 pos = vTextureCoord * uInputSize.xy;
  uint k = hash(uint(uSeed) * 0x9E3779B1u + uint(uFrame));
  float n0 = cell(pos, uSize, k);
  vec3 n = vec3(n0);
  if (uColor > 0.0) {
    vec3 nc = vec3(cell(pos, uSize, k + 1u), cell(pos, uSize, k + 2u), cell(pos, uSize, k + 3u));
    n = mix(n, nc, uColor);
  }
  rgb = clamp(rgb + n * (uAmount * w), 0.0, 1.0);
  finalColor = vec4(rgb * raw.a, raw.a);
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
struct GrainUniforms {
  uAmount: f32,
  uSize: f32,
  uSeed: f32,
  uFrame: f32,
  uColor: f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> grainUniforms : GrainUniforms;

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
fn gauss(p: vec2<i32>, k: u32) -> f32 {
  let h = hash(u32(p.x) + hash(u32(p.y) + hash(k)));
  let s = f32(h & 255u) + f32((h >> 8u) & 255u) + f32((h >> 16u) & 255u) + f32(h >> 24u);
  return (s / 255.0 - 2.0) * 1.7320508;
}
fn cell(pos: vec2<f32>, size: f32, k: u32) -> f32 {
  let q = pos / size - vec2<f32>(0.5);
  let i = floor(q);
  let f = fract(q);
  let p = vec2<i32>(i);
  let a = gauss(p, k);
  let b = gauss(p + vec2<i32>(1, 0), k);
  let c = gauss(p + vec2<i32>(0, 1), k);
  let d = gauss(p + vec2<i32>(1, 1), k);
  let v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  let wx = vec2<f32>(1.0 - f.x, f.x);
  let wy = vec2<f32>(1.0 - f.y, f.y);
  return v * inverseSqrt(dot(wx, wx) * dot(wy, wy));
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  var rgb = vec3<f32>(0.0);
  if (raw.a > 0.0) { rgb = raw.rgb / raw.a; }
  let L = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let w = clamp(4.0 * L * (1.0 - L), 0.0, 1.0);
  let pos = uv * gfu.uInputSize.xy;
  let k = hash(u32(grainUniforms.uSeed) * 0x9E3779B1u + u32(grainUniforms.uFrame));
  let n0 = cell(pos, grainUniforms.uSize, k);
  var n = vec3<f32>(n0);
  if (grainUniforms.uColor > 0.0) {
    let nc = vec3<f32>(cell(pos, grainUniforms.uSize, k + 1u), cell(pos, grainUniforms.uSize, k + 2u), cell(pos, grainUniforms.uSize, k + 3u));
    n = mix(n, nc, grainUniforms.uColor);
  }
  rgb = clamp(rgb + n * (grainUniforms.uAmount * w), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(rgb * raw.a, raw.a);
}`;

export interface GrainOptions {
  /** Standard deviation of the grain at mid-grey, 0–1 of full scale (default 0.08). */
  amount?: number;
  /** Grain size in pixels (default 1.5). */
  size?: number;
  /** Another pattern (integer, default 0). */
  seed?: number;
  /** New grain per second (default 24; 0 = a still pattern). */
  fps?: number;
  /** 0 = luminance only, 1 = independent per colour channel (default 0). */
  color?: number;
}

export class GrainFilter extends Filter {
  private _fps: number;
  constructor(options: GrainOptions = {}) {
    const { amount = 0.08, size = 1.5, seed = 0, fps = 24, color = 0 } = options;
    super({
      glProgram: GlProgram.from({ vertex: GL_VERTEX, fragment: GL_FRAGMENT, name: 'grain-filter' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL_SOURCE, entryPoint: 'mainVertex' }, fragment: { source: WGSL_SOURCE, entryPoint: 'mainFragment' } }),
      resources: {
        grainUniforms: new UniformGroup({
          uAmount: { value: amount, type: 'f32' }, uSize: { value: Math.max(size, 0.25), type: 'f32' }, uSeed: { value: Math.floor(seed), type: 'f32' },
          uFrame: { value: 0, type: 'f32' }, uColor: { value: color, type: 'f32' },
        }),
      },
    });
    this._fps = fps;
  }
  private get u(): Record<string, number> { return this.resources.grainUniforms.uniforms as Record<string, number>; }
  get amount(): number { return this.u.uAmount!; }
  set amount(v: number) { this.u.uAmount = v; }
  get size(): number { return this.u.uSize!; }
  set size(v: number) { this.u.uSize = Math.max(v, 0.25); }
  get seed(): number { return this.u.uSeed!; }
  set seed(v: number) { this.u.uSeed = Math.floor(v); }
  get color(): number { return this.u.uColor!; }
  set color(v: number) { this.u.uColor = v; }
  get fps(): number { return this._fps; }
  set fps(v: number) { this._fps = v; }
  /** The movie calls this with the time (s) of the frame it is about to draw: the grain is new every 1/fps s. */
  setTime(t: number): void { this.u.uFrame = this._fps > 0 ? Math.floor(t * this._fps + 1e-6) : 0; }
}
