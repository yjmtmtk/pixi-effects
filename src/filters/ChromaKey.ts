import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert, Color } from 'pixi.js';

// ── Fragment shader ─ GLSL (WebGL renderer) ──────────────────────────────
const GL_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec3 uKeyColor;
uniform float uThreshold;
uniform float uSmoothing;
uniform float uSpill;

out vec4 finalColor;

void main(void) {
    vec4 raw = texture(uTexture, vTextureCoord);

    // Pixi passes pre-multiplied alpha into filters. Un-premultiply so the
    // chromakey distance is computed against the source color, not a darkened
    // version that drifts away from the key as sprite.alpha drops.
    vec3 rgb = raw.a > 0.0 ? raw.rgb / raw.a : vec3(0.0);

    vec3 ycbcr = vec3(
        0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
        -0.169 * rgb.r - 0.331 * rgb.g + 0.5 * rgb.b + 0.5,
        0.5 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5
    );
    vec3 keyYcbcr = vec3(
        0.299 * uKeyColor.r + 0.587 * uKeyColor.g + 0.114 * uKeyColor.b,
        -0.169 * uKeyColor.r - 0.331 * uKeyColor.g + 0.5 * uKeyColor.b + 0.5,
        0.5 * uKeyColor.r - 0.419 * uKeyColor.g - 0.081 * uKeyColor.b + 0.5
    );

    float dist = length(ycbcr - keyYcbcr);
    float alpha = smoothstep(uThreshold - uSmoothing, uThreshold + uSmoothing, dist);

    vec3 despilled = rgb;
    if (uSpill > 0.0) {
        float spillAmount = max(0.0, rgb.g - max(rgb.r, rgb.b));
        despilled.g -= spillAmount * uSpill;
    }

    float outA = raw.a * alpha;
    finalColor = vec4(despilled * outA, outA);
}
`;

// ── Combined vertex+fragment ─ WGSL (WebGPU renderer) ────────────────────
// Layout follows PIXI v8's built-in filter pattern (see NoiseFilter.wgsl):
//   group(0): global filter uniforms + uTexture + uSampler
//   group(1): the filter's own uniform block — name MUST match the resource
//             key passed to the Filter constructor (`chromaUniforms`).
const WGSL_SOURCE = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct ChromaUniforms {
  uKeyColor: vec3<f32>,
  uThreshold: f32,
  uSmoothing: f32,
  uSpill: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> chromaUniforms : ChromaUniforms;

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
  return VSOutput(
    filterVertexPosition(aPosition),
    filterTextureCoord(aPosition),
  );
}

@fragment
fn mainFragment(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let raw = textureSample(uTexture, uSampler, uv);

  // Un-premultiply (see comment in the GLSL version above).
  var rgb: vec3<f32>;
  if (raw.a > 0.0) {
    rgb = raw.rgb / raw.a;
  } else {
    rgb = vec3<f32>(0.0);
  }

  let key = chromaUniforms.uKeyColor;

  let ycbcr = vec3<f32>(
    0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
    -0.169 * rgb.r - 0.331 * rgb.g + 0.5 * rgb.b + 0.5,
    0.5 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5,
  );
  let keyYcbcr = vec3<f32>(
    0.299 * key.r + 0.587 * key.g + 0.114 * key.b,
    -0.169 * key.r - 0.331 * key.g + 0.5 * key.b + 0.5,
    0.5 * key.r - 0.419 * key.g - 0.081 * key.b + 0.5,
  );

  let dist = length(ycbcr - keyYcbcr);
  let alpha = smoothstep(
    chromaUniforms.uThreshold - chromaUniforms.uSmoothing,
    chromaUniforms.uThreshold + chromaUniforms.uSmoothing,
    dist,
  );

  var despilled = rgb;
  if (chromaUniforms.uSpill > 0.0) {
    let spillAmount = max(0.0, rgb.g - max(rgb.r, rgb.b));
    despilled.g = despilled.g - spillAmount * chromaUniforms.uSpill;
  }

  let outA = raw.a * alpha;
  return vec4<f32>(despilled * outA, outA);
}
`;

export interface ChromaKeyOptions {
  keyColor?: string | [number, number, number];
  threshold?: number;
  smoothing?: number;
  spill?: number;
}

function toRgb01(input: string | [number, number, number]): [number, number, number] {
  if (Array.isArray(input)) return [input[0], input[1], input[2]];
  const c = new Color(input);
  return [c.red, c.green, c.blue];
}

export class ChromaKeyFilter extends Filter {
  constructor(options: ChromaKeyOptions = {}) {
    const {
      keyColor = '#00ff00',
      threshold = 0.4,
      smoothing = 0.1,
      spill = 0.2,
    } = options;

    const glProgram = GlProgram.from({
      vertex: defaultFilterVert,
      fragment: GL_FRAGMENT,
      name: 'chroma-key-filter',
    });

    const gpuProgram = GpuProgram.from({
      vertex: { source: WGSL_SOURCE, entryPoint: 'mainVertex' },
      fragment: { source: WGSL_SOURCE, entryPoint: 'mainFragment' },
    });

    super({
      glProgram,
      gpuProgram,
      resources: {
        chromaUniforms: new UniformGroup({
          uKeyColor:   { value: toRgb01(keyColor), type: 'vec3<f32>' },
          uThreshold:  { value: threshold,         type: 'f32' },
          uSmoothing:  { value: smoothing,         type: 'f32' },
          uSpill:      { value: spill,             type: 'f32' },
        }),
      },
    });
  }

  get threshold(): number { return this.resources.chromaUniforms.uniforms.uThreshold as number; }
  set threshold(v: number) { this.resources.chromaUniforms.uniforms.uThreshold = v; }
  get smoothing(): number { return this.resources.chromaUniforms.uniforms.uSmoothing as number; }
  set smoothing(v: number) { this.resources.chromaUniforms.uniforms.uSmoothing = v; }
  get spill(): number { return this.resources.chromaUniforms.uniforms.uSpill as number; }
  set spill(v: number) { this.resources.chromaUniforms.uniforms.uSpill = v; }

  setKeyColor(input: string | [number, number, number]): void {
    const rgb = toRgb01(input);
    const u = this.resources.chromaUniforms.uniforms.uKeyColor as [number, number, number];
    u[0] = rgb[0]; u[1] = rgb[1]; u[2] = rgb[2];
  }
}
