/**
 * The shader a lit threeD layer's PerspectiveMesh draws with. It is Pixi's own mesh shader (the same high-shader
 * bits: local uniforms, texture, round pixels) plus one more bit that runs after the texel is read: it rebuilds the fragment's world
 * position from its uv (the plane is flat, so world = origin + u·U + v·V exactly), shades it (ambient + point / spot / parallel,
 * Lambert, falloff, cone, planar shadows of up to MAX_CASTERS other layers) and adds depth fog. No extra pass, no extra texture:
 * the layer's own RenderTexture is sampled once, the casters' RenderTextures (already drawn this frame) are sampled for shadows.
 */
import {
  Shader, UniformGroup, Matrix, Texture, GlProgram, compileHighShaderGpuProgram,
  type GpuProgram, type TextureSource,
} from 'pixi.js';
import { MAX_CASTERS, MAX_LIGHTS, SHADOW_TAPS, type PackedLights, type PlaneFrame } from './lighting';

// Pixi does not export the bits from the package root in every build; they are small, so they are restated (same text as Pixi 8.22).
const localUniformBit = {
  name: 'local-uniform-bit',
  vertex: {
    header: /* wgsl */`
      struct LocalUniforms { uTransformMatrix:mat3x3<f32>, uColor:vec4<f32>, uRound:f32, }
      @group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;`,
    main: /* wgsl */`
      vColor *= localUniforms.uColor;
      modelMatrix *= localUniforms.uTransformMatrix;`,
    end: /* wgsl */`
      if(localUniforms.uRound == 1) { vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw); }`,
  },
};
const textureBit = {
  name: 'texture-bit',
  vertex: {
    header: `struct TextureUniforms { uTextureMatrix:mat3x3<f32>, }
      @group(2) @binding(2) var<uniform> textureUniforms : TextureUniforms;`,
    main: `uv = (textureUniforms.uTextureMatrix * vec3(uv, 1.0)).xy;`,
  },
  fragment: {
    header: `@group(2) @binding(0) var uTexture: texture_2d<f32>;
      @group(2) @binding(1) var uSampler: sampler;`,
    main: `outColor = textureSample(uTexture, uSampler, vUV);`,
  },
};
const roundPixelsBit = {
  name: 'round-pixels-bit',
  vertex: { header: `fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32> { return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0; }` },
};

const ML = MAX_LIGHTS, MC = MAX_CASTERS, TAPS = SHADOW_TAPS;

const STRUCT_WGSL = /* wgsl */`
      struct LightUniforms {
        uOrigin: vec4<f32>, uAxisU: vec4<f32>, uAxisV: vec4<f32>, uCam: vec4<f32>, uCamFwd: vec4<f32>,
        uAmbient: vec4<f32>, uFogColor: vec4<f32>, uFogRange: vec4<f32>,
        uLPos: array<vec4<f32>, ${ML}>, uLDir: array<vec4<f32>, ${ML}>, uLCol: array<vec4<f32>, ${ML}>, uLFall: array<vec4<f32>, ${ML}>, uLShadow: array<vec4<f32>, ${ML}>,
        uCO: array<vec4<f32>, ${MC}>, uCU: array<vec4<f32>, ${MC}>, uCV: array<vec4<f32>, ${MC}>,
      };
      @group(2) @binding(3) var<uniform> lightUniforms : LightUniforms;
`;

const lightBit = {
  name: 'light-bit',
  vertex: {
    header: /* wgsl */`${STRUCT_WGSL}
      @out vPW: vec4<f32>;`,
    // world position over camera depth, and 1 / depth: interpolated per fragment and divided, they give the exact (perspective-correct) point
    end: /* wgsl */`
      {
        let Pv = lightUniforms.uOrigin.xyz + vUV.x * lightUniforms.uAxisU.xyz + vUV.y * lightUniforms.uAxisV.xyz;
        let zc = max(dot(Pv - lightUniforms.uCam.xyz, lightUniforms.uCamFwd.xyz), 1e-3);
        vPW = vec4<f32>(Pv / zc, 1.0 / zc);
      }`,
  },
  fragment: {
    header: /* wgsl */`
${STRUCT_WGSL}
      @in vPW: vec4<f32>;
      @group(2) @binding(4) var uShadow0: texture_2d<f32>;
      @group(2) @binding(5) var uShadow1: texture_2d<f32>;

      fn casterAlpha(j: i32, uv: vec2<f32>) -> f32 {
        let inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        var a = 0.0;
        if (j == 0) { a = textureSampleLevel(uShadow0, uSampler, uv, 0.0).a; } else { a = textureSampleLevel(uShadow1, uSampler, uv, 0.0).a; }
        return a * inside;
      }

      fn shadowAt(P: vec3<f32>, i: i32) -> f32 {
        let lp = lightUniforms.uLPos[i]; let ld = lightUniforms.uLDir[i];
        let parallel = lp.w > 2.5;
        var occl = 0.0;
        for (var j = 0; j < ${MC}; j++) {
          if (f32(j) >= lightUniforms.uAxisU.w) { break; }
          let Co = lightUniforms.uCO[j].xyz; let Cu = lightUniforms.uCU[j].xyz; let Cv = lightUniforms.uCV[j].xyz;
          let Nc = cross(Cu, Cv);
          var D = lp.xyz - P;
          if (parallel) { D = -ld.xyz * 100000.0; }
          let denom = dot(D, Nc);
          if (abs(denom) < 1e-9) { continue; }
          let t = dot(Co - P, Nc) / denom;
          if (t <= 1e-4 || t >= 1.0) { continue; }
          let H = P + t * D;
          let uv = vec2<f32>(dot(H - Co, Cu) / dot(Cu, Cu), dot(H - Co, Cv) / dot(Cv, Cv));
          let lenD = length(D);
          let far = select((1.0 - t) * lenD, 1000.0, parallel);
          let w = lightUniforms.uLShadow[i].y * (t * lenD) / max(far, 1.0);
          let r = vec2<f32>(w / length(Cu), w / length(Cv));
          var a = 0.0;
          if (w * w > 0.0) {
            for (var k = 0; k < ${TAPS}; k++) {
              let rr = sqrt((f32(k) + 0.5) / ${TAPS}.0);
              let an = f32(k) * 2.39996323;
              a += casterAlpha(j, uv + vec2<f32>(cos(an), sin(an)) * rr * r);
            }
            a = a / ${TAPS}.0;
          } else { a = casterAlpha(j, uv); }
          occl = max(occl, a);
        }
        return 1.0 - occl * lightUniforms.uLShadow[i].x;
      }
    `,
    end: /* wgsl */`
      {
        let P = vPW.xyz / vPW.w;
        if (lightUniforms.uCam.w > 0.5) {
          var N = normalize(cross(lightUniforms.uAxisU.xyz, lightUniforms.uAxisV.xyz));
          if (dot(N, lightUniforms.uCam.xyz - P) < 0.0) { N = -N; }
          var light = lightUniforms.uAmbient.rgb;
          for (var i = 0; i < ${ML}; i++) {
            if (f32(i) >= lightUniforms.uOrigin.w) { break; }
            let lp = lightUniforms.uLPos[i]; let ld = lightUniforms.uLDir[i]; let lc = lightUniforms.uLCol[i]; let lf = lightUniforms.uLFall[i];
            var L = -ld.xyz;
            var dist = 0.0;
            if (lp.w < 2.5) { let d = lp.xyz - P; dist = length(d); L = d / max(dist, 1e-4); }
            let ndl = max(dot(N, L), 0.0);
            var att = 1.0;
            if (lp.w < 2.5) {
              if (lf.x > 0.5 && lf.x < 1.5) { att = 1.0 - smoothstep(lf.y, lf.y + max(lf.z, 1e-3), dist); }
              else if (lf.x > 1.5) { att = min(1.0, (lf.y * lf.y) / max(dist * dist, 1e-6)); }
            }
            var cone = 1.0;
            if (lp.w > 1.5 && lp.w < 2.5) { cone = smoothstep(ld.w, lc.w, dot(-L, ld.xyz)); }
            var sh = 1.0;
            if (lf.w > 0.5 && ndl * att * cone > 0.0) { sh = shadowAt(P, i); }
            light += lc.rgb * (ndl * att * cone * sh);
          }
          finalColor = vec4<f32>(min(finalColor.rgb * light, vec3<f32>(finalColor.a)), finalColor.a);
        }
        if (lightUniforms.uFogRange.w > 0.5) {
          let depth = dot(P - lightUniforms.uCam.xyz, lightUniforms.uCamFwd.xyz);
          let f = clamp((depth - lightUniforms.uFogRange.x) / max(lightUniforms.uFogRange.y - lightUniforms.uFogRange.x, 1e-3), 0.0, 1.0) * lightUniforms.uFogColor.a;
          finalColor = vec4<f32>(mix(finalColor.rgb, lightUniforms.uFogColor.rgb * finalColor.a, f), finalColor.a);
        }
      }
    `,
  },
};

const lightBitGl = {
  name: 'light-bit',
  fragment: {
    header: /* glsl */`
      uniform vec4 uOrigin; uniform vec4 uAxisU; uniform vec4 uAxisV; uniform vec4 uCam; uniform vec4 uCamFwd;
      uniform vec4 uAmbient; uniform vec4 uFogColor; uniform vec4 uFogRange;
      uniform vec4 uLPos[${ML}]; uniform vec4 uLDir[${ML}]; uniform vec4 uLCol[${ML}]; uniform vec4 uLFall[${ML}]; uniform vec4 uLShadow[${ML}];
      uniform vec4 uCO[${MC}]; uniform vec4 uCU[${MC}]; uniform vec4 uCV[${MC}];
      uniform sampler2D uShadow0; uniform sampler2D uShadow1;

      float casterAlpha(int j, vec2 uv) {
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float a = j == 0 ? textureLod(uShadow0, uv, 0.0).a : textureLod(uShadow1, uv, 0.0).a;
        return a * inside;
      }

      float shadowAt(vec3 P, int i) {
        vec4 lp = uLPos[i]; vec4 ld = uLDir[i];
        bool parallel = lp.w > 2.5;
        float occl = 0.0;
        for (int j = 0; j < ${MC}; j++) {
          if (float(j) >= uAxisU.w) break;
          vec3 Co = uCO[j].xyz; vec3 Cu = uCU[j].xyz; vec3 Cv = uCV[j].xyz;
          vec3 Nc = cross(Cu, Cv);
          vec3 D = parallel ? -ld.xyz * 100000.0 : lp.xyz - P;
          float denom = dot(D, Nc);
          if (abs(denom) < 1e-9) continue;
          float t = dot(Co - P, Nc) / denom;
          if (t <= 1e-4 || t >= 1.0) continue;
          vec3 H = P + t * D;
          vec2 uv = vec2(dot(H - Co, Cu) / dot(Cu, Cu), dot(H - Co, Cv) / dot(Cv, Cv));
          float lenD = length(D);
          float far = parallel ? 1000.0 : (1.0 - t) * lenD;
          float w = uLShadow[i].y * (t * lenD) / max(far, 1.0);
          vec2 r = vec2(w / length(Cu), w / length(Cv));
          float a = 0.0;
          if (w * w > 0.0) {
            for (int k = 0; k < ${TAPS}; k++) {
              float rr = sqrt((float(k) + 0.5) / ${TAPS}.0);
              float an = float(k) * 2.39996323;
              a += casterAlpha(j, uv + vec2(cos(an), sin(an)) * rr * r);
            }
            a /= ${TAPS}.0;
          } else { a = casterAlpha(j, uv); }
          occl = max(occl, a);
        }
        return 1.0 - occl * uLShadow[i].x;
      }
    `,
    end: /* glsl */`
      {
        vec3 P = vPW.xyz / vPW.w;
        if (uCam.w > 0.5) {
          vec3 N = normalize(cross(uAxisU.xyz, uAxisV.xyz));
          if (dot(N, uCam.xyz - P) < 0.0) N = -N;
          vec3 light = uAmbient.rgb;
          for (int i = 0; i < ${ML}; i++) {
            if (float(i) >= uOrigin.w) break;
            vec4 lp = uLPos[i]; vec4 ld = uLDir[i]; vec4 lc = uLCol[i]; vec4 lf = uLFall[i];
            vec3 L = -ld.xyz;
            float dist = 0.0;
            if (lp.w < 2.5) { vec3 d = lp.xyz - P; dist = length(d); L = d / max(dist, 1e-4); }
            float ndl = max(dot(N, L), 0.0);
            float att = 1.0;
            if (lp.w < 2.5) {
              if (lf.x > 0.5 && lf.x < 1.5) att = 1.0 - smoothstep(lf.y, lf.y + max(lf.z, 1e-3), dist);
              else if (lf.x > 1.5) att = min(1.0, (lf.y * lf.y) / max(dist * dist, 1e-6));
            }
            float cone = 1.0;
            if (lp.w > 1.5 && lp.w < 2.5) cone = smoothstep(ld.w, lc.w, dot(-L, ld.xyz));
            float sh = 1.0;
            if (lf.w > 0.5 && ndl * att * cone > 0.0) sh = shadowAt(P, i);
            light += lc.rgb * (ndl * att * cone * sh);
          }
          finalColor.rgb = min(finalColor.rgb * light, vec3(finalColor.a));
        }
        if (uFogRange.w > 0.5) {
          float depth = dot(P - uCam.xyz, uCamFwd.xyz);
          float f = clamp((depth - uFogRange.x) / max(uFogRange.y - uFogRange.x, 1e-3), 0.0, 1.0) * uFogColor.a;
          finalColor.rgb = mix(finalColor.rgb, uFogColor.rgb * finalColor.a, f);
        }
      }
    `,
  },
};

const GL_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec4 vColor;
out vec2 vUV;
out vec4 vPW;
uniform vec4 uOrigin; uniform vec4 uAxisU; uniform vec4 uAxisV; uniform vec4 uCam; uniform vec4 uCamFwd;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform vec4 uWorldColorAlpha; uniform vec2 uResolution;
uniform mat3 uTransformMatrix; uniform vec4 uColor; uniform float uRound;
uniform mat3 uTextureMatrix;
vec2 roundPixels(vec2 position, vec2 targetSize) { return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0; }
void main(void) {
  mat3 modelMatrix = uTransformMatrix;
  vColor = uColor;
  vUV = (uTextureMatrix * vec3(aUV, 1.0)).xy;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * modelMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor *= uWorldColorAlpha;
  if (uRound == 1.) gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
  vec3 Pv = uOrigin.xyz + vUV.x * uAxisU.xyz + vUV.y * uAxisV.xyz;
  float zc = max(dot(Pv - uCam.xyz, uCamFwd.xyz), 1e-3);
  vPW = vec4(Pv / zc, 1.0 / zc);
}`;

const GL_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vUV;
in vec4 vPW;
out vec4 finalColor;
uniform sampler2D uTexture;
${lightBitGl.fragment.header}
void main(void) {
  vec4 outColor = texture(uTexture, vUV);
  finalColor = outColor * vColor;
  ${lightBitGl.fragment.end}
}`;

let programs: { gl: GlProgram; gpu: GpuProgram } | null = null;
function getPrograms() {
  programs ??= {
    // pixi compiles high-shader GLSL as WebGL1-compatible (no textureLod, no dynamic uniform-array index): the GL program is written as ES 3.00
    gl: GlProgram.from({ name: 'lit-mesh', vertex: GL_VERTEX, fragment: GL_FRAGMENT }),
    gpu: compileHighShaderGpuProgram({ name: 'lit-mesh', bits: [localUniformBit, textureBit, roundPixelsBit, lightBit] as never }),
  };
  return programs;
}

export interface FogState { r: number; g: number; b: number; near: number; far: number; amount: number }
export interface CasterInput { frame: PlaneFrame; source: TextureSource }

/** One per lit layer: its own uniforms and its own shadow textures. */
export class LitMaterial {
  readonly shader: Shader;
  private readonly u: UniformGroup;

  constructor() {
    const { gl, gpu } = getPrograms();
    const v4 = () => ({ value: new Float32Array(4), type: 'vec4<f32>' as const });
    const arr = (n: number) => ({ value: new Float32Array(4 * n), type: 'vec4<f32>' as const, size: n });
    this.u = new UniformGroup({
      uOrigin: v4(), uAxisU: v4(), uAxisV: v4(), uCam: v4(), uCamFwd: v4(), uAmbient: v4(), uFogColor: v4(), uFogRange: v4(),
      uLPos: arr(ML), uLDir: arr(ML), uLCol: arr(ML), uLFall: arr(ML), uLShadow: arr(ML),
      uCO: arr(MC), uCU: arr(MC), uCV: arr(MC),
    });
    this.shader = new Shader({
      glProgram: gl, gpuProgram: gpu,
      resources: {
        uTexture: Texture.EMPTY.source,
        uSampler: Texture.EMPTY.source.style,
        textureUniforms: { uTextureMatrix: { type: 'mat3x3<f32>', value: new Matrix() } },
        lightUniforms: this.u,
        uShadow0: Texture.EMPTY.source,
        uShadow1: Texture.EMPTY.source,
      },
    });
  }

  setTexture(src: TextureSource): void {
    if (this.shader.resources.uTexture !== src) {
      this.shader.resources.uTexture = src;
      this.shader.resources.uSampler = src.style;
    }
  }

  update(frame: PlaneFrame, cam: { x: number; y: number; z: number; fx: number; fy: number; fz: number }, lights: PackedLights | null, fog: FogState | null, casters: readonly CasterInput[]): void {
    const U = this.u.uniforms as Record<string, Float32Array>;
    const nc = Math.min(casters.length, MC);
    U.uOrigin!.set([frame.o.x, frame.o.y, frame.o.z, lights ? lights.count : 0]);
    U.uAxisU!.set([frame.u.x, frame.u.y, frame.u.z, nc]);
    U.uAxisV!.set([frame.v.x, frame.v.y, frame.v.z, 0]);
    U.uCam!.set([cam.x, cam.y, cam.z, lights ? 1 : 0]);
    U.uCamFwd!.set([cam.fx, cam.fy, cam.fz, 0]);
    if (lights) {
      U.uAmbient!.set([lights.ambient[0], lights.ambient[1], lights.ambient[2], 0]);
      U.uLPos!.set(lights.pos); U.uLDir!.set(lights.dir); U.uLCol!.set(lights.col); U.uLFall!.set(lights.fall); U.uLShadow!.set(lights.shadow);
    }
    if (fog) { U.uFogColor!.set([fog.r, fog.g, fog.b, fog.amount]); U.uFogRange!.set([fog.near, fog.far, 0, 1]); }
    else U.uFogRange!.set([0, 0, 0, 0]);
    const keys = ['uShadow0', 'uShadow1'] as const;
    for (let j = 0; j < MC; j++) {
      const c = casters[j];
      if (c && j < nc) {
        U.uCO!.set([c.frame.o.x, c.frame.o.y, c.frame.o.z, 0], 4 * j);
        U.uCU!.set([c.frame.u.x, c.frame.u.y, c.frame.u.z, 0], 4 * j);
        U.uCV!.set([c.frame.v.x, c.frame.v.y, c.frame.v.z, 0], 4 * j);
        if (this.shader.resources[keys[j]] !== c.source) this.shader.resources[keys[j]] = c.source;
      } else if (this.shader.resources[keys[j]] !== Texture.EMPTY.source) this.shader.resources[keys[j]] = Texture.EMPTY.source;
    }
    this.u.update();
  }

  destroy(): void { this.shader.destroy(); }
}
