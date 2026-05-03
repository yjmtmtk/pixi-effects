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
uniform vec4 uInputSize;     // PIXI-bound: xy = sprite render texture size (with padding)
uniform vec4 uInputClamp;    // PIXI-bound: xy = min uv of unpadded content, zw = max uv
uniform vec4 uOutputFrame;   // PIXI-bound: xy = sprite top-left on output, zw = bbox size in px
uniform vec4 uGlobalFrame;   // PIXI-bound: xy = global frame offset, zw = canvas size in px
uniform float uProgress;
uniform float uSmoothing;
uniform float uMode;
uniform float uInvert;

out vec4 finalColor;

// Map sprite-local vTextureCoord → canvas-pixel position. We do this in two
// steps: first un-pad vTextureCoord (it spans 0..bbox/inputSize because the
// filter target has padding) into a true 0..1 across the bbox, then offset
// and scale by uOutputFrame to get canvas pixels. Operating in canvas space
// (rather than sprite-uv space) is what makes the wipe / iris edge land at
// the same canvas position for sprites of any size: at uProgress=0.25 the
// wipe edge is at canvas x = 0.75 * canvasW for every sprite, regardless of
// each sprite's bbox.
vec2 toCanvasPx(vec2 uv) {
  vec2 bboxUV = (uv - uInputClamp.xy) / (uInputClamp.zw - uInputClamp.xy);
  return uOutputFrame.xy + bboxUV * uOutputFrame.zw;
}

vec2 toCanvasUV(vec2 uv) {
  return toCanvasPx(uv) / uGlobalFrame.zw;
}

// Aspect-corrected, corner-normalized distance from canvas center.
// Returns 0 at canvas center, 1 at the canvas corner — so iris is a true
// circle in pixel space and p=1 reveals the entire canvas.
float irisDistCanvas(vec2 uv) {
  vec2 px = toCanvasPx(uv);
  vec2 canvasSize = uGlobalFrame.zw;
  vec2 offsetPx = px - canvasSize * 0.5;
  float halfDiag = 0.5 * length(canvasSize);
  return length(offsetPx) / max(halfDiag, 1.0);
}

float wipeReveal(vec2 uv, float p, float s, float mode) {
  // Remap p so the smoothstep edge lies fully outside [0,1] at p=0 / p=1
  // (otherwise smoothstep returns 0.5 at the very edge instead of 0 or 1).
  float ep = p * (1.0 + 2.0 * s) - s;
  vec2 cuv = toCanvasUV(uv);
  if (mode < 0.5) {
    // wipe-left: B reveals from the right edge moving left
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, cuv.x);
  } else if (mode < 1.5) {
    // wipe-right: B reveals from the left edge moving right
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, 1.0 - cuv.x);
  } else if (mode < 2.5) {
    // wipe-up
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, cuv.y);
  } else if (mode < 3.5) {
    // wipe-down: B reveals from the top edge moving down
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, 1.0 - cuv.y);
  } else if (mode < 4.5) {
    // iris-in: circle grows from center
    float d = irisDistCanvas(uv);
    return 1.0 - smoothstep(ep - s, ep + s, d);
  } else {
    // iris-out: circle shrinks toward center
    float d = irisDistCanvas(uv);
    return smoothstep(ep - s, ep + s, d);
  }
}

void main(void) {
    vec4 raw = texture(uTexture, vTextureCoord);
    float reveal = wipeReveal(vTextureCoord, uProgress, max(uSmoothing, 0.0001), uMode);
    // Inverted mode uses a HARD binary cutoff: A stays at alpha=1 across
    // B's smoothstep zone and snaps off only where B has fully revealed.
    if (uInvert > 0.5) reveal = 1.0 - step(0.99, reveal);
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
// Map sprite-local uv → canvas-pixel position (see GLSL note).
fn toCanvasPx(uv: vec2<f32>) -> vec2<f32> {
  let bboxUV = (uv - gfu.uInputClamp.xy) / (gfu.uInputClamp.zw - gfu.uInputClamp.xy);
  return gfu.uOutputFrame.xy + bboxUV * gfu.uOutputFrame.zw;
}

fn toCanvasUV(uv: vec2<f32>) -> vec2<f32> {
  return toCanvasPx(uv) / gfu.uGlobalFrame.zw;
}

fn irisDistCanvas(uv: vec2<f32>) -> f32 {
  let px = toCanvasPx(uv);
  let canvasSize = gfu.uGlobalFrame.zw;
  let offsetPx = px - canvasSize * 0.5;
  let halfDiag = 0.5 * length(canvasSize);
  return length(offsetPx) / max(halfDiag, 1.0);
}

fn wipeReveal(uv: vec2<f32>, p: f32, s: f32, mode: f32) -> f32 {
  let ep = p * (1.0 + 2.0 * s) - s;
  let cuv = toCanvasUV(uv);
  if (mode < 0.5) {
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, cuv.x);
  } else if (mode < 1.5) {
    // wipe-right: B reveals from the left edge moving right
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, 1.0 - cuv.x);
  } else if (mode < 2.5) {
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, cuv.y);
  } else if (mode < 3.5) {
    // wipe-down: B reveals from the top edge moving down
    return smoothstep(1.0 - ep - s, 1.0 - ep + s, 1.0 - cuv.y);
  } else if (mode < 4.5) {
    let d = irisDistCanvas(uv);
    return 1.0 - smoothstep(ep - s, ep + s, d);
  } else {
    let d = irisDistCanvas(uv);
    return smoothstep(ep - s, ep + s, d);
  }
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);
  var reveal = wipeReveal(uv, transitionUniforms.uProgress, max(transitionUniforms.uSmoothing, 0.0001), transitionUniforms.uMode);
  if (transitionUniforms.uInvert > 0.5) { reveal = 1.0 - step(0.99, reveal); }
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
