import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';

/** PROTOTYPE: one-pass disc ("bokeh") blur, golden-angle taps, radius in pixels. Deterministic (no noise). */
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
const TAPS = 48;
const GL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uRadius;
out vec4 finalColor;
void main(void) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < ${TAPS}; i++) {
    float r = sqrt((float(i) + 0.5) / ${TAPS}.0) * uRadius;
    float a = float(i) * 2.39996323;
    acc += texture(uTexture, vTextureCoord + vec2(cos(a), sin(a)) * r * uInputSize.zw);
  }
  finalColor = acc / ${TAPS}.0;
}`;
const WGSL = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>, uInputPixel: vec4<f32>, uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>, uGlobalFrame: vec4<f32>, uOutputTexture: vec4<f32>,
};
struct DiscUniforms { uRadius: f32 };
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> disc : DiscUniforms;
struct VSOutput { @builtin(position) position: vec4<f32>, @location(0) uv : vec2<f32> };
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
fn mainVertex(@location(0) aPosition : vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}
@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  var acc = vec4<f32>(0.0);
  for (var i = 0; i < ${TAPS}; i++) {
    let r = sqrt((f32(i) + 0.5) / ${TAPS}.0) * disc.uRadius;
    let a = f32(i) * 2.39996323;
    acc += textureSampleLevel(uTexture, uSampler, uv + vec2<f32>(cos(a), sin(a)) * r * gfu.uInputSize.zw, 0.0);
  }
  return acc / ${TAPS}.0;
}`;

export class DiscBlurFilter extends Filter {
  constructor(radius = 8) {
    super({
      glProgram: GlProgram.from({ vertex: GL_VERTEX, fragment: GL_FRAGMENT, name: 'disc-blur' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL, entryPoint: 'mainVertex' }, fragment: { source: WGSL, entryPoint: 'mainFragment' } }),
      resources: { disc: new UniformGroup({ uRadius: { value: radius, type: 'f32' } }) },
    });
    this.radius = radius;
  }
  get radius(): number { return (this.resources.disc.uniforms as { uRadius: number }).uRadius; }
  set radius(v: number) { (this.resources.disc.uniforms as { uRadius: number }).uRadius = v; this.padding = Math.ceil(v) + 2; }
}
