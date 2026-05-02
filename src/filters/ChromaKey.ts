import { Filter, GlProgram, defaultFilterVert, Color } from 'pixi.js';

const FRAGMENT = `
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
    super({
      glProgram: new GlProgram({ vertex: defaultFilterVert, fragment: FRAGMENT }),
      resources: {
        chromaUniforms: {
          uKeyColor:   { value: toRgb01(keyColor), type: 'vec3<f32>' },
          uThreshold:  { value: threshold,         type: 'f32' },
          uSmoothing:  { value: smoothing,         type: 'f32' },
          uSpill:      { value: spill,             type: 'f32' },
        },
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
