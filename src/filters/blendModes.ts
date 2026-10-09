import { BlendModeFilter, ExtensionType, extensions } from 'pixi.js';
import { setBlendFilterFactory, type BlendFilterLike } from '../core/blend';

/**
 * The W3C compositing blend modes as our own `BlendModeFilter`s, registered on the SAME pixi instance the movie uses (this file imports
 * 'pixi.js' like the rest of the library; `import 'pixi.js/advanced-blend-modes'` would register on its own copy of `extensions` when
 * the page maps pixi.js to an esm.sh bundle, and then nothing is registered and the layer silently draws as `normal`). It also avoids
 * what pixi 8.22's own versions get wrong: the source colour is premultiplied (a half-transparent layer was blended with its darkened
 * colour and then faded again), the backdrop's alpha is ignored, soft-light is inverted on WebGPU (`select` arguments swapped),
 * linear-light and saturation are wrong. Loaded by `Movie.init` only when a layer uses one of these (see `usesAdvancedBlend`).
 */
type Sep = { gl: string; gpu: string };   // a separable blend: the body of  B(b, s)  for one channel

const SEPARABLE: Record<string, Sep> = {
  overlay:       { gl: 'return b <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s);', gpu: 'return select(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, b <= 0.5);' },
  'hard-light':  { gl: 'return s <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s);', gpu: 'return select(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, s <= 0.5);' },
  'soft-light':  {
    gl: 'if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b); float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return b + (2.0 * s - 1.0) * (d - b);',
    gpu: 'let d = select(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, b <= 0.25); return select(b + (2.0 * s - 1.0) * (d - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), s <= 0.5);',
  },
  'color-dodge': { gl: 'if (b <= 0.0) return 0.0; return s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s));', gpu: 'if (b <= 0.0) { return 0.0; } return select(min(1.0, b / (1.0 - s)), 1.0, s >= 1.0);' },
  'color-burn':  { gl: 'if (b >= 1.0) return 1.0; return s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s);', gpu: 'if (b >= 1.0) { return 1.0; } return select(1.0 - min(1.0, (1.0 - b) / s), 0.0, s <= 0.0);' },
  darken:        { gl: 'return min(b, s);', gpu: 'return min(b, s);' },
  lighten:       { gl: 'return max(b, s);', gpu: 'return max(b, s);' },
  difference:    { gl: 'return abs(b - s);', gpu: 'return abs(b - s);' },
  exclusion:     { gl: 'return b + s - 2.0 * b * s;', gpu: 'return b + s - 2.0 * b * s;' },
  'linear-burn': { gl: 'return max(0.0, b + s - 1.0);', gpu: 'return max(0.0, b + s - 1.0);' },
};

const GL_NONSEP = `
float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
vec3 clipColor(vec3 c) { float l = lum(c); float n = min(c.r, min(c.g, c.b)); float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n); if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l); return c; }
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 setSat(vec3 c, float s) { float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b)); return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.0); }`;
const GPU_NONSEP = `
fn lum(c: vec3<f32>) -> f32 { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
fn clipColor(c0: vec3<f32>) -> vec3<f32> { var c = c0; let l = lum(c); let n = min(c.r, min(c.g, c.b)); let x = max(c.r, max(c.g, c.b));
  if (n < 0.0) { c = l + (c - l) * l / (l - n); } if (x > 1.0) { c = l + (c - l) * (1.0 - l) / (x - l); } return c; }
fn setLum(c: vec3<f32>, l: f32) -> vec3<f32> { return clipColor(c + (l - lum(c))); }
fn sat(c: vec3<f32>) -> f32 { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
fn setSat(c: vec3<f32>, s: f32) -> vec3<f32> { let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b)); if (mx > mn) { return (c - vec3<f32>(mn)) * s / (mx - mn); } return vec3<f32>(0.0); }`;
const NONSEP: Record<string, { gl: string; gpu: string }> = {
  hue:        { gl: 'return setLum(setSat(cs, sat(cb)), lum(cb));', gpu: 'return setLum(setSat(cs, sat(cb)), lum(cb));' },
  saturation: { gl: 'return setLum(setSat(cb, sat(cs)), lum(cb));', gpu: 'return setLum(setSat(cb, sat(cs)), lum(cb));' },
  color:      { gl: 'return setLum(cs, lum(cb));', gpu: 'return setLum(cs, lum(cb));' },
  luminosity: { gl: 'return setLum(cb, lum(cs));', gpu: 'return setLum(cb, lum(cs));' },
};

const GL_MAIN = `
  vec3 cs = front.a > 0.0 ? front.rgb / front.a : vec3(0.0);
  vec3 cb = back.a > 0.0 ? back.rgb / back.a : vec3(0.0);
  vec3 mixed = front.rgb * (1.0 - back.a) + front.a * back.a * blendRGB(cb, cs) + (1.0 - front.a) * back.rgb;
  finalColor = vec4(mixed, blendedAlpha) * uBlend;`;
const GPU_MAIN = `
  let cs = select(vec3<f32>(0.0), front.rgb / front.a, front.a > 0.0);
  let cb = select(vec3<f32>(0.0), back.rgb / back.a, back.a > 0.0);
  let mixed = front.rgb * (1.0 - back.a) + front.a * back.a * blendRGB(cb, cs) + (1.0 - front.a) * back.rgb;
  out = vec4<f32>(mixed, blendedAlpha) * blendUniforms.uBlend;`;

const CLASSES = new Map<string, new () => BlendModeFilter>();

/** A fresh blend filter for a layer that has filters of its own (it goes last in the chain and reads the backdrop). */
export function createBlendFilter(name: string): BlendFilterLike | null {
  const C = CLASSES.get(name);
  return C ? (new C() as unknown as BlendFilterLike) : null;
}

function make(name: string, gl: string, gpu: string): void {
  const C = class extends BlendModeFilter {
    static extension = { name, type: ExtensionType.BlendMode };
    constructor() { super({ gl: { functions: gl, main: GL_MAIN }, gpu: { functions: gpu, main: GPU_MAIN } }); }
  };
  CLASSES.set(name, C);
  extensions.add(C as never);
}

export const OWN_MODES: readonly string[] = [...Object.keys(SEPARABLE), ...Object.keys(NONSEP)];

let done = false;
/** Register the blends (once per page), and give `core/blend.ts` the maker for the filter chain case. */
export function registerBlendModes(): void {
  setBlendFilterFactory(createBlendFilter);          // every call: the registration below is once per page, the maker is cheap to hand over again
  if (done) return;
  done = true;
  for (const [name, s] of Object.entries(SEPARABLE)) {
    make(name,
      `float B(float b, float s) { ${s.gl} }\nvec3 blendRGB(vec3 cb, vec3 cs) { return vec3(B(cb.r, cs.r), B(cb.g, cs.g), B(cb.b, cs.b)); }`,
      `fn B(b: f32, s: f32) -> f32 { ${s.gpu} }\nfn blendRGB(cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> { return vec3<f32>(B(cb.r, cs.r), B(cb.g, cs.g), B(cb.b, cs.b)); }`);
  }
  for (const [name, s] of Object.entries(NONSEP)) {
    make(name, `${GL_NONSEP}\nvec3 blendRGB(vec3 cb, vec3 cs) { ${s.gl} }`, `${GPU_NONSEP}\nfn blendRGB(cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> { ${s.gpu} }`);
  }
}
