import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const MODE_CODES = {
  'wipe-left':  0,
  'wipe-right': 1,
  'wipe-up':    2,
  'wipe-down':  3,
  'iris-in':    4,
  'iris-out':   5,
} as const;

export type TransitionMode = keyof typeof MODE_CODES;

export interface TransitionMaskOptions {
  mode?: TransitionMode;
  smoothing?: number;
  progress?: number;
  /**
   * If true, the mask is applied as `1 - reveal` so the filter HIDES the
   * sprite as `uProgress` grows from 0 → 1. Used on the outgoing sequence
   * so wipe / iris transitions work for sequences with transparency
   * (otherwise the outgoing sprite's transparent regions would let the
   * incoming sprite's already-revealed pixels show through prematurely).
   */
  invert?: boolean;
}

// ── GLSL fragment (WebGL renderer) ───────────────────────────────────────
const GL_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;     // PIXI-bound: xy = sprite render size in px
uniform float uProgress;
uniform float uSmoothing;
uniform float uMode;
uniform float uInvert;       // 0 or 1 — if 1, returns (1 - reveal)

out vec4 finalColor;

// Aspect-corrected, corner-normalized distance from sprite center.
// Returns 0 at center, 1 at the furthest corner — so p=1 fully reveals.
float irisDist(vec2 uv, vec2 sizePx) {
  vec2 offsetPx = (uv - vec2(0.5)) * sizePx;
  float halfDiag = 0.5 * length(sizePx);
  return length(offsetPx) / max(halfDiag, 1.0);
}

float wipeReveal(vec2 uv, float p, float s, float mode, vec2 sizePx) {
  // mode 0..3 = wipe directions; mode 4..5 = iris.
  if (mode < 0.5) {
    // wipe-left: B reveals from the right edge moving left
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.x);
  } else if (mode < 1.5) {
    // wipe-right: B reveals from the left edge moving right
    return smoothstep(1.0 - p - s, 1.0 - p + s, 1.0 - uv.x);
  } else if (mode < 2.5) {
    // wipe-up
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.y);
  } else if (mode < 3.5) {
    // wipe-down: B reveals from the top edge moving down
    return smoothstep(1.0 - p - s, 1.0 - p + s, 1.0 - uv.y);
  } else if (mode < 4.5) {
    // iris-in: circle grows from center
    float d = irisDist(uv, sizePx);
    return smoothstep(p + s, p - s, d);
  } else {
    // iris-out: circle shrinks toward center
    float d = irisDist(uv, sizePx);
    return smoothstep(p - s, p + s, d);
  }
}

void main(void) {
    vec4 raw = texture(uTexture, vTextureCoord);
    float reveal = wipeReveal(vTextureCoord, uProgress, max(uSmoothing, 0.0001), uMode, uInputSize.xy);
    if (uInvert > 0.5) reveal = 1.0 - reveal;
    finalColor = raw * reveal;
}
`;

// ── WGSL combined source (WebGPU renderer) ───────────────────────────────
const WGSL_SOURCE = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct TransitionUniforms {
  uProgress: f32,
  uMode: f32,
  uSmoothing: f32,
  uInvert: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> transitionUniforms : TransitionUniforms;

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

// NOTE on whitespace: PIXI v8's WGSL attribute extractor is regex-based and
// expects the noise/blur reference format — multi-line param list + space
// before the colon. A compact one-liner with no space before the colon parses
// as having NO vertex attributes, which then causes a "Vertex attribute slot 0
// not present in the VertexState" pipeline validation error.
@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

// Aspect-corrected, corner-normalized distance from sprite center.
// Returns 0 at center, 1 at the furthest corner — so p=1 fully reveals.
fn irisDist(uv: vec2<f32>, sizePx: vec2<f32>) -> f32 {
  let offsetPx = (uv - vec2<f32>(0.5)) * sizePx;
  let halfDiag = 0.5 * length(sizePx);
  return length(offsetPx) / max(halfDiag, 1.0);
}

fn wipeReveal(uv: vec2<f32>, p: f32, s: f32, mode: f32, sizePx: vec2<f32>) -> f32 {
  if (mode < 0.5) {
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.x);
  } else if (mode < 1.5) {
    // wipe-right: B reveals from the left edge moving right
    return smoothstep(1.0 - p - s, 1.0 - p + s, 1.0 - uv.x);
  } else if (mode < 2.5) {
    return smoothstep(1.0 - p - s, 1.0 - p + s, uv.y);
  } else if (mode < 3.5) {
    // wipe-down: B reveals from the top edge moving down
    return smoothstep(1.0 - p - s, 1.0 - p + s, 1.0 - uv.y);
  } else if (mode < 4.5) {
    let d = irisDist(uv, sizePx);
    return smoothstep(p + s, p - s, d);
  } else {
    let d = irisDist(uv, sizePx);
    return smoothstep(p - s, p + s, d);
  }
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  var reveal = wipeReveal(uv, transitionUniforms.uProgress, max(transitionUniforms.uSmoothing, 0.0001), transitionUniforms.uMode, gfu.uInputSize.xy);
  if (transitionUniforms.uInvert > 0.5) { reveal = 1.0 - reveal; }
  return raw * reveal;
}
`;

export class TransitionMaskFilter extends Filter {
  constructor(options: TransitionMaskOptions = {}) {
    const mode = options.mode ?? 'wipe-left';
    const smoothing = options.smoothing ?? 0.02;
    const progress = options.progress ?? 0;
    const invert = options.invert ?? false;

    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: GL_FRAGMENT,
        name: 'transition-mask-filter',
      }),
      gpuProgram: GpuProgram.from({
        vertex: { source: WGSL_SOURCE, entryPoint: 'mainVertex' },
        fragment: { source: WGSL_SOURCE, entryPoint: 'mainFragment' },
      }),
      resources: {
        transitionUniforms: new UniformGroup({
          uProgress:  { value: progress,        type: 'f32' },
          uMode:      { value: MODE_CODES[mode], type: 'f32' },
          uSmoothing: { value: smoothing,        type: 'f32' },
          uInvert:    { value: invert ? 1 : 0,   type: 'f32' },
        }),
      },
    });
  }

  get uProgress(): number { return this.resources.transitionUniforms.uniforms.uProgress as number; }
  set uProgress(v: number) { this.resources.transitionUniforms.uniforms.uProgress = v; }
  get uMode(): number { return this.resources.transitionUniforms.uniforms.uMode as number; }
  set uMode(v: number) { this.resources.transitionUniforms.uniforms.uMode = v; }
  get uSmoothing(): number { return this.resources.transitionUniforms.uniforms.uSmoothing as number; }
  set uSmoothing(v: number) { this.resources.transitionUniforms.uniforms.uSmoothing = v; }
  get uInvert(): number { return this.resources.transitionUniforms.uniforms.uInvert as number; }
  set uInvert(v: number) { this.resources.transitionUniforms.uniforms.uInvert = v; }
}
