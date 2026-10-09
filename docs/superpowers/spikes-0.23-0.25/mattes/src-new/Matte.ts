// SPIKE 0.23 (throwaway): a track-matte filter. The matte layer is rendered once per frame into a RenderTexture (composition-local
// space); a hidden Sprite showing that texture sits in the composition's inner container, so its worldTransform says where the matte is
// on screen. The filter maps each pixel of its input (the matted layer, already rendered offscreen by Pixi's filter system) to that
// sprite's texture with `calculateSpriteMatrix` (the DisplacementFilter way, which works for any filter of a chain, not only the last),
// reads the matte's alpha or luma there and multiplies the layer by it. Several mattes are several filters (intersect); `invert` is 1 − m
// (so A · (1 − B) is a subtract). The blend filter, when the layer has an advanced mode, goes after it: blend is the last pass.
import { Filter, GlProgram, GpuProgram, Matrix, UniformGroup, type Sprite } from 'pixi.js';

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vMatteUv;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uMatteMatrix;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vMatteUv = (uMatteMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;

const FRAG = `in vec2 vTextureCoord;
in vec2 vMatteUv;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMatteTexture;
uniform float uLuma;
uniform float uInvert;
void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  vec4 m = texture(uMatteTexture, vMatteUv);
  // outside the matte texture there is no matte: the clamp-to-edge sampler would repeat the border
  float inside = step(0.0, vMatteUv.x) * step(0.0, vMatteUv.y) * step(vMatteUv.x, 1.0) * step(vMatteUv.y, 1.0);
  m *= inside;
  // luma of the premultiplied colour = luma(colour) * alpha: a transparent matte counts as black (Rec. 709 weights)
  float v = uLuma > 0.5 ? dot(m.rgb, vec3(0.2126, 0.7152, 0.0722)) : m.a;
  if (uInvert > 0.5) v = 1.0 - v;
  finalColor = src * v;
}`;

const WGSL = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};
struct MatteUniforms {
  uMatteMatrix:mat3x3<f32>,
  uLuma:f32,
  uInvert:f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> matteUniforms : MatteUniforms;
@group(1) @binding(1) var uMatteTexture: texture_2d<f32>;
@group(1) @binding(2) var uMatteSampler : sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) matteUv : vec2<f32>,
  };

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
  let matteUv = (matteUniforms.uMatteMatrix * vec3<f32>(uv, 1.0)).xy;
  return VSOutput(vec4<f32>(position, 0.0, 1.0), uv, matteUv);
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @location(1) matteUv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let src = textureSample(uTexture, uSampler, uv);
  var m = textureSample(uMatteTexture, uMatteSampler, matteUv);
  let inside = step(0.0, matteUv.x) * step(0.0, matteUv.y) * step(matteUv.x, 1.0) * step(matteUv.y, 1.0);
  m = m * inside;
  var v = select(m.a, dot(m.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), matteUniforms.uLuma > 0.5);
  if (matteUniforms.uInvert > 0.5) { v = 1.0 - v; }
  return src * v;
}`;

export interface MatteFilterOptions { sprite: Sprite; channel?: 'alpha' | 'luma'; invert?: boolean }

export class MatteFilter extends Filter {
  private readonly _sprite: Sprite;
  constructor({ sprite, channel = 'alpha', invert = false }: MatteFilterOptions) {
    const source = sprite.texture.source;
    super({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'pe-matte-filter' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL, entryPoint: 'mainVertex' }, fragment: { source: WGSL, entryPoint: 'mainFragment' } }),
      resources: {
        matteUniforms: new UniformGroup({
          uMatteMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uLuma: { value: channel === 'luma' ? 1 : 0, type: 'f32' },
          uInvert: { value: invert ? 1 : 0, type: 'f32' },
        }),
        uMatteTexture: source,
        uMatteSampler: source.style,
      },
    });
    this._sprite = sprite;
  }

  override apply(filterManager: any, input: any, output: any, clearMode: any): void {
    const u = this.resources.matteUniforms.uniforms;
    filterManager.calculateSpriteMatrix(u.uMatteMatrix, this._sprite);
    this.resources.uMatteTexture = this._sprite.texture.source;
    filterManager.applyFilter(this, input, output, clearMode);
  }
}
