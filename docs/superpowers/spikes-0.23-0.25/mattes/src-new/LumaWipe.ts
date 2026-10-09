// SPIKE 0.23 (throwaway): a luma ("gradient") wipe. A grayscale map covers the whole composition; as progress goes 0 → 1 the threshold
// sweeps the map's luminance, dark first (After Effects' Gradient Wipe). `softness` is the width of the soft band in luminance units.
// The incoming scene is revealed with a soft edge; the outgoing one holds until the incoming has fully covered (hard cutoff, as the
// existing wipe / iris / dissolve do, so nothing behind bleeds through). The map is a Texture, or an asset name resolved on first use.
import { Assets, Filter, GlProgram, GpuProgram, Texture, UniformGroup, defaultFilterVert } from 'pixi.js';

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
out vec4 finalColor;
void main(void) {
  vec4 raw = texture(uTexture, vTextureCoord);
  vec2 bboxUV = (vTextureCoord - uInputClamp.xy) / (uInputClamp.zw - uInputClamp.xy);
  vec2 cuv = (uOutputFrame.xy + bboxUV * uOutputFrame.zw) / uGlobalFrame.zw;
  vec3 m = texture(uMap, cuv).rgb;
  float l = dot(m, vec3(0.2126, 0.7152, 0.0722));
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
struct LumaUniforms { uProgress:f32, uSoftness:f32, uInvert:f32, uFlip:f32, };
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
@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  let bboxUV = (uv - gfu.uInputClamp.xy) / (gfu.uInputClamp.zw - gfu.uInputClamp.xy);
  let cuv = (gfu.uOutputFrame.xy + bboxUV * gfu.uOutputFrame.zw) / gfu.uGlobalFrame.zw;
  let m = textureSample(uMap, uMapSampler, cuv).rgb;
  var l = dot(m, vec3<f32>(0.2126, 0.7152, 0.0722));
  if (lumaUniforms.uFlip > 0.5) { l = 1.0 - l; }
  let s = max(lumaUniforms.uSoftness, 0.0001);
  let ep = lumaUniforms.uProgress * (1.0 + 2.0 * s) - s;
  var reveal = 1.0 - smoothstep(ep - s, ep + s, l);
  if (lumaUniforms.uInvert > 0.5) { reveal = 1.0 - step(0.99, reveal); }
  return raw * reveal;
}`;

const builtIn = new Map<string, Texture>();
/** Built-in maps, drawn once per page on a canvas (deterministic): 'linear' (left dark), 'radial' (centre dark), 'diagonal'. */
function builtInMap(name: string): Texture | null {
  if (builtIn.has(name)) return builtIn.get(name)!;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  let grad: CanvasGradient | null = null;
  if (name === 'linear') grad = g.createLinearGradient(0, 0, 256, 0);
  else if (name === 'diagonal') grad = g.createLinearGradient(0, 0, 256, 256);
  else if (name === 'radial') grad = g.createRadialGradient(128, 128, 0, 128, 128, 181);
  if (!grad) return null;
  grad.addColorStop(0, '#000'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = Texture.from(c);
  builtIn.set(name, t);
  return t;
}

export interface LumaWipeOptions { map: string; softness?: number; progress?: number; invert?: boolean; flip?: boolean }

export class LumaWipeFilter extends Filter {
  private readonly _mapName: string;
  private _resolved = false;
  constructor({ map, softness = 0.1, progress = 0, invert = false, flip = false }: LumaWipeOptions) {
    const t = Texture.WHITE;
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: GL, name: 'pe-luma-wipe' }),
      gpuProgram: GpuProgram.from({ vertex: { source: WGSL, entryPoint: 'mainVertex' }, fragment: { source: WGSL, entryPoint: 'mainFragment' } }),
      resources: {
        lumaUniforms: new UniformGroup({
          uProgress: { value: progress, type: 'f32' }, uSoftness: { value: softness, type: 'f32' },
          uInvert: { value: invert ? 1 : 0, type: 'f32' }, uFlip: { value: flip ? 1 : 0, type: 'f32' },
        }),
        uMap: t.source,
        uMapSampler: t.source.style,
      },
    });
    this._mapName = map;
  }
  get uProgress(): number { return this.resources.lumaUniforms.uniforms.uProgress as number; }
  set uProgress(v: number) { this.resources.lumaUniforms.uniforms.uProgress = v; }

  override apply(fm: any, input: any, output: any, clear: any): void {
    if (!this._resolved) {
      const t = builtInMap(this._mapName) ?? (Assets.get<Texture>(this._mapName) as Texture | undefined);
      if (t) { this.resources.uMap = t.source; this.resources.uMapSampler = t.source.style; this._resolved = true; }
    }
    fm.applyFilter(this, input, output, clear);
  }
}
