// A luma ("gradient") wipe: a brightness map covers the whole composition, and as progress goes 0 → 1 a threshold sweeps through the
// map's brightness, dark parts first (After Effects' Gradient Wipe). The three built-in maps are computed in the shader from the
// position on screen (no canvas, no texture, nothing to load); any other name is a grayscale image asset.
import { Assets, Filter, GlProgram, GpuProgram, Texture, UniformGroup, defaultFilterVert } from 'pixi.js';
import { suggestName } from '../core/options';

/** The maps that need no image: left to right, corner to corner, and from the middle out to the corners (a circle on screen). */
export const LUMA_MAPS = ['linear', 'diagonal', 'radial'] as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The brightness of a built-in map at a point of the composition (`u`, `v` in 0..1, `aspect` = width / height): the same formulas as the
 * shader, so a test can say what the picture must be. 0 = changes first, 1 = changes last.
 */
export function builtInLuma(name: string, u: number, v: number, aspect: number): number {
  if (name === 'linear') return clamp01(u);
  if (name === 'diagonal') return clamp01((u + v) / 2);
  if (name === 'radial') return clamp01(Math.hypot((u - 0.5) * aspect, v - 0.5) / (0.5 * Math.hypot(aspect, 1)));
  return 0;
}

const GL = `in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform sampler2D uMap;
uniform highp vec4 uInputClamp;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uGlobalFrame;
uniform float uProgress;
uniform float uSoftness;
uniform float uInvert;
uniform float uFlip;
uniform float uMode;
out vec4 finalColor;
float lumaOf(vec2 cuv, float aspect) {
  if (uMode > 2.5) { vec2 p = (cuv - 0.5) * vec2(aspect, 1.0); return clamp(length(p) / (0.5 * length(vec2(aspect, 1.0))), 0.0, 1.0); }
  if (uMode > 1.5) return clamp((cuv.x + cuv.y) * 0.5, 0.0, 1.0);
  if (uMode > 0.5) return clamp(cuv.x, 0.0, 1.0);
  return dot(texture(uMap, cuv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main(void) {
  vec4 raw = texture(uTexture, vTextureCoord);
  vec2 bboxUV = (vTextureCoord - uInputClamp.xy) / (uInputClamp.zw - uInputClamp.xy);
  vec2 cuv = (uOutputFrame.xy + bboxUV * uOutputFrame.zw) / uGlobalFrame.zw;
  float l = lumaOf(cuv, uGlobalFrame.z / uGlobalFrame.w);
  if (uFlip > 0.5) l = 1.0 - l;
  float s = max(uSoftness, 0.0001);
  float ep = uProgress * (1.0 + 2.0 * s) - s;
  float reveal = 1.0 - smoothstep(ep - s, ep + s, l);
  if (uInvert > 0.5) reveal = 1.0 - step(0.99, reveal);
  finalColor = raw * reveal;
}`;

const WGSL = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>, uInputPixel:vec4<f32>, uInputClamp:vec4<f32>, uOutputFrame:vec4<f32>, uGlobalFrame:vec4<f32>, uOutputTexture:vec4<f32>,
};
struct LumaUniforms { uProgress:f32, uSoftness:f32, uInvert:f32, uFlip:f32, uMode:f32, };
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> lumaUniforms : LumaUniforms;
@group(1) @binding(1) var uMap: texture_2d<f32>;
@group(1) @binding(2) var uMapSampler : sampler;
struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv : vec2<f32>,
};
@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4<f32>(position, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}
fn lumaOf(cuv: vec2<f32>, aspect: f32) -> f32 {
  let mode = lumaUniforms.uMode;
  if (mode > 2.5) {
    let p = (cuv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0);
    return clamp(length(p) / (0.5 * length(vec2<f32>(aspect, 1.0))), 0.0, 1.0);
  }
  if (mode > 1.5) { return clamp((cuv.x + cuv.y) * 0.5, 0.0, 1.0); }
  if (mode > 0.5) { return clamp(cuv.x, 0.0, 1.0); }
  let m = textureSampleLevel(uMap, uMapSampler, cuv, 0.0).rgb;
  return dot(m, vec3<f32>(0.2126, 0.7152, 0.0722));
}
@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  let bboxUV = (uv - gfu.uInputClamp.xy) / (gfu.uInputClamp.zw - gfu.uInputClamp.xy);
  let cuv = (gfu.uOutputFrame.xy + bboxUV * gfu.uOutputFrame.zw) / gfu.uGlobalFrame.zw;
  var l = lumaOf(cuv, gfu.uGlobalFrame.z / gfu.uGlobalFrame.w);
  if (lumaUniforms.uFlip > 0.5) { l = 1.0 - l; }
  let s = max(lumaUniforms.uSoftness, 0.0001);
  let ep = lumaUniforms.uProgress * (1.0 + 2.0 * s) - s;
  var reveal = 1.0 - smoothstep(ep - s, ep + s, l);
  if (lumaUniforms.uInvert > 0.5) { reveal = 1.0 - step(0.99, reveal); }
  return raw * reveal;
}`;

export interface LumaWipeOptions { map: string; softness?: number; progress?: number; invert?: boolean; flip?: boolean }

export class LumaWipeFilter extends Filter {
  private readonly _mapName: string;
  private readonly _builtIn: boolean;
  private _resolved = false;
  private _warned = false;
  constructor({ map, softness = 0.1, progress = 0, invert = false, flip = false }: LumaWipeOptions) {
    const t = Texture.WHITE;
    const mode = (LUMA_MAPS as readonly string[]).indexOf(map) + 1;           // 0 = a texture
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: GL, name: 'pe-luma-wipe' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL, entryPoint: 'mainVertex' }, fragment: { source: WGSL, entryPoint: 'mainFragment' } }),
      resources: {
        lumaUniforms: new UniformGroup({
          uProgress: { value: progress, type: 'f32' }, uSoftness: { value: softness, type: 'f32' },
          uInvert: { value: invert ? 1 : 0, type: 'f32' }, uFlip: { value: flip ? 1 : 0, type: 'f32' }, uMode: { value: mode, type: 'f32' },
        }),
        uMap: t.source,
        uMapSampler: t.source.style,
      },
    });
    this._mapName = map;
    this._builtIn = mode > 0;
  }
  get uProgress(): number { return this.resources.lumaUniforms.uniforms.uProgress as number; }
  set uProgress(v: number) { this.resources.lumaUniforms.uniforms.uProgress = v; }

  override apply(fm: any, input: any, output: any, clear: any): void {
    if (!this._builtIn && !this._resolved) {
      const t = Assets.get<Texture>(this._mapName) as Texture | undefined;
      if (t) { this.resources.uMap = t.source; this.resources.uMapSampler = t.source.style; this._resolved = true; }
      else if (!this._warned) {
        this._warned = true;
        const guess = suggestName(this._mapName, LUMA_MAPS);
        console.warn(`pixi-effects: luma transition map "${this._mapName}" is not a built-in map (${LUMA_MAPS.join(', ')}) and no image asset has that name${guess ? `; did you mean "${guess}"?` : ''}; the wipe follows a white map (everything changes at once)`);
      }
    }
    fm.applyFilter(this, input, output, clear);
  }
}
