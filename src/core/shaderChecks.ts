/**
 * What the shader layer says about what it was given, as sentences (the caller puts `pixi-effects: layer "x": ` in front), and the pieces of
 * GLSL it builds around the author's code. Pure: no Pixi, no DOM. Nothing here throws.
 */
import type { SequenceSpec } from '../types';

/** Declared for the author in every shader (Shadertoy names). */
export const SHADER_BUILTINS = ['iResolution', 'iTime', 'iFrame'] as const;
/** Shadertoy names this version does not provide. */
export const SHADER_MISSING = ['iMouse', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'iDate', 'iTimeDelta', 'iSampleRate'] as const;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** GLSL ES 3.00 keywords and the words it reserves: a uniform of this name does not compile. */
const RESERVED = new Set(`attribute const uniform varying break continue do for while if else in out inout float int void bool true false discard return
  mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uvec2 uvec3 uvec4 uint
  sampler2D sampler3D samplerCube sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow isampler2D isampler3D isamplerCube isampler2DArray
  usampler2D usampler3D usamplerCube usampler2DArray struct layout centroid flat smooth precision invariant highp mediump lowp
  sample patch subroutine common partition active asm class union enum typedef template this resource goto inline noinline public static extern external
  interface long short double half fixed unsigned superp input output hvec2 hvec3 hvec4 fvec2 fvec3 fvec4 dvec2 dvec3 dvec4 filter sizeof cast namespace using`.split(/\s+/));
const isIdent = (name: string): boolean =>
  IDENT.test(name) && !name.startsWith('gl_') && !name.includes('__') && !RESERVED.has(name) && !(SHADER_BUILTINS as readonly string[]).includes(name);

export type UniformKind = 'float' | 'vec2' | 'vec3' | 'vec4';

/** The GLSL type of a `uniforms` value, or null when it is not one the layer takes (a number, 2–4 numbers, a hex colour). */
export function uniformType(v: unknown): UniformKind | null {
  if (typeof v === 'number') return Number.isFinite(v) ? 'float' : null;
  if (typeof v === 'string') return HEX.test(v) ? 'vec3' : null;
  if (Array.isArray(v) && v.length >= 2 && v.length <= 4 && v.every(n => typeof n === 'number' && Number.isFinite(n))) return `vec${v.length}` as UniformKind;
  return null;
}

/** The numbers a uniform value stands for (a colour is three channels in 0..1). */
export function uniformFloats(v: number | number[] | string): number[] {
  if (typeof v === 'number') return [v];
  if (typeof v === 'string') {
    const h = v.length === 4 ? v.slice(1).replace(/./g, c => c + c) : v.slice(1);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  return v.slice();
}

/** One `uniform <type> <name>;` line for every uniform that has a usable name and value. */
export function uniformDecls(uniforms: Record<string, unknown>): string {
  let out = '';
  for (const [name, v] of Object.entries(uniforms ?? {})) {
    const type = uniformType(v);
    if (type && isIdent(name)) out += `uniform ${type} ${name};\n`;
  }
  return out;
}

// the generated parts have line numbers of their own (100001 for the declarations, 200001 for main()), so an error in them is not mistaken for a line of the author's
const HEAD = `#version 300 es
#line 100001
precision highp float;
precision highp int;
uniform vec3 iResolution;
uniform float iTime;
uniform int iFrame;
out vec4 pe_out;
`;
const FOOT = (transparent: boolean): string => `
#line 200001
void main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); ${transparent ? 'pe_out = vec4(c.rgb * c.a, c.a);' : 'pe_out = vec4(c.rgb, 1.0);'} }
`;

/**
 * The whole fragment shader: our header, the declared uniforms, then the author's code starting at `#line 1`, so a compiler error names the
 * line the author wrote. `userLine` is the line (1-based) of the whole source where the author's first line sits.
 */
export function wrapFragment(user: string, uniforms: Record<string, unknown>, transparent: boolean): { source: string; userLine: number } {
  const prefix = HEAD + uniformDecls(uniforms) + '#line 1\n';
  return { source: prefix + user + FOOT(transparent), userLine: prefix.split('\n').length };
}

/** A compiler log as short sentences with the author's line numbers (ANGLE `ERROR: 0:2: …` and Mesa `0:2(10): error: …`); what it cannot read stays. */
export function glslErrors(log: string): string[] {
  const out: string[] = [];
  for (const raw of (log ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const angle = /^ERROR:\s*\d+:(\d+):\s*(.*)$/.exec(line);
    const mesa = /^\d+:(\d+)\(\d+\):\s*(?:error|warning):\s*(.*)$/.exec(line);
    const hit = angle ?? mesa;
    if (!hit) { out.push(line); continue; }
    const n = Number(hit[1]);
    if (n >= 200001) out.push(`in the main() made for you, which calls mainImage: ${hit[2]} (write void mainImage(out vec4 fragColor, in vec2 fragCoord))`);
    else if (n >= 100001) out.push(`in the declarations made from your uniforms: ${hit[2]} (a uniform name GLSL does not allow, such as a reserved word?)`);
    else out.push(`line ${n}: ${hit[2]}`);
  }
  return out;
}

const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

/** What is wrong with a shader layer as written (static: nothing is compiled here). */
export function shaderProblems(spec: SequenceSpec): string[] {
  const out: string[] = [];
  const raw = spec as unknown as { fragment?: unknown; uniforms?: unknown; resolution?: unknown; transparent?: unknown };
  if (typeof raw.fragment !== 'string' || raw.fragment.trim() === '') {
    out.push('fragment is the GLSL of the shader: write { type: \'shader\', fragment: \'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(fragCoord / iResolution.xy, 0.0, 1.0); }\' }');
  } else {
    const code = stripComments(raw.fragment);
    if (!/\bvoid\s+mainImage\s*\(/.test(code)) {
      out.push('there is no mainImage: write void mainImage(out vec4 fragColor, in vec2 fragCoord) { … } (Shadertoy style; the layer calls it for every pixel)' +
        (/\bvoid\s+main\s*\(/.test(code) ? ' and not main()' : ''));
    } else {
      if (/\bvoid\s+main\s*\(/.test(code)) out.push('main() is written for you (it calls your mainImage): remove your main()');
      if (!/\bvoid\s+mainImage\s*\(\s*(?:out|inout)\s+(?:(?:highp|mediump|lowp)\s+)?vec4\s+\w+\s*,\s*(?:in\s+)?(?:(?:highp|mediump|lowp)\s+)?vec2\s+\w+\s*\)/.test(code)) {
        out.push('the signature of mainImage must be void mainImage(out vec4 fragColor, in vec2 fragCoord): the colour parameter is out (without out the layer draws black and nothing says why) and the position is a vec2');
      }
    }
    if (/^\s*#version\b/m.test(code)) out.push('#version is added for you (GLSL ES 3.00): remove it');
    if (/\bgl_FragColor\b/.test(code)) out.push('gl_FragColor does not exist here: write the colour into the fragColor parameter of mainImage');
    if (/\btexture2D\s*\(|\btextureCube\s*\(/.test(code)) out.push('texture2D is GLSL ES 1.00: this is GLSL ES 3.00, write texture(…) (and note that this version has no textures to read)');
    if (/\b(?:varying|attribute)\b/.test(code)) out.push('varying and attribute are not used in a fragment-only shader: remove them');
    for (const b of SHADER_BUILTINS) {
      if (new RegExp(`\\buniform\\s+\\w+\\s+${b}\\b`).test(code)) out.push(`${b} is declared for you: remove your uniform ${b}`);
    }
    const missing = SHADER_MISSING.filter(n => new RegExp(`\\b${n}\\b`).test(code));
    if (missing.length) out.push(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not provided in this version (the shader has iResolution, iTime, iFrame and your uniforms); the shader will not compile`);
    if (/\bwhile\s*\(/.test(code)) out.push('a while loop may never end and a GPU cannot be stopped: use a for loop with a constant bound');
    const consts = new Set([...code.matchAll(/\bconst\s+(?:int|float|uint)\s+(\w+)/g)].map(m => m[1]!).concat([...code.matchAll(/#define\s+(\w+)/g)].map(m => m[1]!)));
    // a bound is constant when it is made of GLSL number literals (1, 1., .5, 1e2, 10u), consts, #defines and + - * / % ( )
    const constant = (expr: string): boolean => {
      const rest = expr.replace(/\d+\.?\d*(?:[eE][-+]?\d+)?[uUfF]?|\.\d+(?:[eE][-+]?\d+)?[fF]?|[A-Za-z_]\w*/g, t => (/^[A-Za-z_]/.test(t) && !consts.has(t) ? '?' : ''));
      return /^[\s+\-*/%()]*$/.test(rest);
    };
    for (const m of code.matchAll(/\bfor\s*\(\s*(?:int|float|uint)\s+\w+\s*=\s*[^;]+;\s*\w+\s*(?:<=|>=|<|>|!=)\s*([^;]+?)\s*;/g)) {
      const bound = m[1]!;
      const ands = bound.split('&&'), ors = bound.split('||');
      const ok = ors.length > 1 ? ors.every(part => constant(part.split('&&')[0]!.replace(/<.*$/, ''))) : ands.length > 1 ? ands.some(constant) || constant(ands[0]!) : constant(bound);
      if (!ok) {
        out.push(`a for loop with the bound "${bound}" may run for ever: use a constant bound (a number or a const) and break out early`);
        break;
      }
    }
  }
  if (raw.uniforms !== undefined) {
    if (raw.uniforms === null || typeof raw.uniforms !== 'object' || Array.isArray(raw.uniforms)) {
      out.push('uniforms is an object of names to values: { speed: 1, tint: \'#ff8040\', pos: [0.5, 0.5] }');
    } else {
      for (const [name, v] of Object.entries(raw.uniforms as Record<string, unknown>)) {
        if (!isIdent(name)) out.push(`uniform "${name}" is not a name GLSL can use (letters, digits and _, not starting with a digit; not a GLSL keyword or reserved word such as sample, smooth, filter, input; not iResolution / iTime / iFrame)`);
        else if (uniformType(v) === null) out.push(`uniform "${name}": ${JSON.stringify(v)} is not a number, 2 to 4 numbers or a '#rrggbb' colour`);
      }
    }
  }
  if (raw.resolution !== undefined && !(typeof raw.resolution === 'number' && raw.resolution > 0 && raw.resolution <= 2)) {
    out.push(`resolution ${JSON.stringify(raw.resolution)} is not a number above 0 and at most 2 (0.5 draws a quarter of the pixels and scales up); 1 is used`);
  }
  if (raw.transparent !== undefined && typeof raw.transparent !== 'boolean') out.push('transparent is true or false (true uses the shader\'s alpha; the default draws opaque)');
  return out;
}
