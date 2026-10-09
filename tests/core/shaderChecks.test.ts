import { describe, it, expect } from 'vitest';
import { glslErrors, shaderProblems, uniformDecls, uniformFloats, uniformType, wrapFragment, SHADER_BUILTINS } from '../../src/core/shaderChecks';

const OK = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(fragCoord / iResolution.xy, 0.0, 1.0); }';
const spec = (o: Record<string, unknown> = {}) => ({ type: 'shader', fragment: OK, ...o }) as never;

describe('uniforms', () => {
  it('a number is a float, 2 to 4 numbers a vector, a hex colour a vec3, anything else nothing', () => {
    expect(uniformType(1.5)).toBe('float');
    expect(uniformType([1, 2])).toBe('vec2');
    expect(uniformType([1, 2, 3])).toBe('vec3');
    expect(uniformType([1, 2, 3, 4])).toBe('vec4');
    expect(uniformType('#ff8040')).toBe('vec3');
    expect(uniformType('#f80')).toBe('vec3');
    for (const bad of [[1], [1, 2, 3, 4, 5], 'red', '#ff80', NaN, Infinity, null, undefined, {}, [1, 'a']]) expect(uniformType(bad), String(bad)).toBeNull();
  });
  it('a colour becomes three channels in 0..1', () => {
    expect(uniformFloats('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(uniformFloats('#f00')).toEqual([1, 0, 0]);
    expect(uniformFloats([1, 2])).toEqual([1, 2]);
    expect(uniformFloats(3)).toEqual([3]);
  });
  it('declarations: one line each; a name that is not a GLSL identifier is left out', () => {
    expect(uniformDecls({ speed: 1, tint: '#ff0000', pos: [1, 2], 'bad name': 3, '9x': 1 })).toBe('uniform float speed;\nuniform vec3 tint;\nuniform vec2 pos;\n');
  });
});

describe('wrapFragment', () => {
  it('puts #line 1 right before the user\'s first line, so a compiler error says the line the author wrote', () => {
    const { source, userLine } = wrapFragment('// first\nvoid mainImage(out vec4 c, in vec2 f) { c = vec4(1.0); }', { speed: 1 }, false);
    const lines = source.split('\n');
    expect(lines[userLine - 2]).toBe('#line 1');
    expect(lines[userLine - 1]).toBe('// first');
    expect(source.startsWith('#version 300 es')).toBe(true);
    for (const b of SHADER_BUILTINS) expect(source).toContain(b);
    expect(source).toContain('uniform float speed;');
  });
  it('opaque writes alpha 1; transparent premultiplies by the shader\'s alpha', () => {
    expect(wrapFragment(OK, {}, false).source).toContain('vec4(c.rgb, 1.0)');
    expect(wrapFragment(OK, {}, true).source).toContain('vec4(c.rgb * c.a, c.a)');
  });
});

describe('glslErrors', () => {
  it('reads the ANGLE and the Mesa forms and keeps what it cannot read', () => {
    expect(glslErrors("ERROR: 0:2: 'undefinedThing' : undeclared identifier\n")).toEqual(["line 2: 'undefinedThing' : undeclared identifier"]);
    expect(glslErrors('0:5(10): error: syntax error, unexpected $end')).toEqual(['line 5: syntax error, unexpected $end']);
    expect(glslErrors('something odd')).toEqual(['something odd']);
    expect(glslErrors('')).toEqual([]);
  });
});

describe('shaderProblems', () => {
  it('a good shader says nothing', () => { expect(shaderProblems(spec({ uniforms: { speed: 1, tint: '#fff' }, resolution: 0.5, transparent: true }))).toEqual([]); });
  it('no fragment, or no mainImage, shows the shape to write', () => {
    expect(shaderProblems(spec({ fragment: undefined })).join('\n')).toContain('fragment');
    const p = shaderProblems(spec({ fragment: 'void main() { }' })).join('\n');
    expect(p).toContain('mainImage'); expect(p).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)'); expect(p).toContain('main()');
  });
  it('the habits of other GLSL: gl_FragColor, texture2D, varying, #version, declaring a built-in', () => {
    const p = shaderProblems(spec({ fragment: '#version 300 es\nvarying vec2 uv;\nuniform float iTime;\nvoid mainImage(out vec4 c, in vec2 f) { gl_FragColor = texture2D(t, uv); }' })).join('\n');
    expect(p).toContain('gl_FragColor'); expect(p).toContain('fragColor');
    expect(p).toContain('texture2D'); expect(p).toContain('texture(');
    expect(p).toContain('varying');
    expect(p).toContain('#version');
    expect(p).toContain('iTime'); expect(p).toContain('declared for you');
  });
  it('what this version does not provide: iMouse, iChannel0, iDate', () => {
    const p = shaderProblems(spec({ fragment: OK + ' void f() { vec4 m = iMouse; vec4 d = iDate; vec4 t = texture(iChannel0, vec2(0.0)); }' })).join('\n');
    for (const n of ['iMouse', 'iChannel0', 'iDate']) expect(p).toContain(n);
    expect(p).toContain('not provided');
  });
  it('a loop that may not end: while, or a for with a bound that is not a constant', () => {
    expect(shaderProblems(spec({ fragment: OK + ' void f() { while (true) { } }' })).join('\n')).toContain('while');
    expect(shaderProblems(spec({ fragment: OK + ' void g(int n) { for (int i = 0; i < n; i++) { } }' })).join('\n')).toMatch(/for.*constant/);
    expect(shaderProblems(spec({ fragment: OK + ' void h() { for (int i = 0; i < 8; i++) { } }' }))).toEqual([]);
  });
  it('uniforms: a value that is no number, vector or colour, a name that is not an identifier', () => {
    const p = shaderProblems(spec({ uniforms: { a: 'red', 'b c': 1, d: [1] } })).join('\n');
    expect(p).toContain('"a"'); expect(p).toContain('"b c"'); expect(p).toContain('"d"');
  });
  it('resolution and transparent', () => {
    expect(shaderProblems(spec({ resolution: 0 })).join('\n')).toContain('resolution');
    expect(shaderProblems(spec({ resolution: 3 })).join('\n')).toContain('resolution');
    expect(shaderProblems(spec({ transparent: 'yes' })).join('\n')).toContain('transparent');
  });
});
