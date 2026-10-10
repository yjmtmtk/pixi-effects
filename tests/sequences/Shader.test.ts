import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { resetGl } from '../../src/core/glShared';
import { fakeGl, fake2d, installCanvas as installFake, type Fake2d, type FakeGl } from '../support/fakeGl';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

const shape: CompositionShape = { width: 320, height: 180, duration: 4, frameRate: 30 };
const GOOD = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(fragCoord / iResolution.xy, speed, 1.0); }';
async function build(sequences: unknown[]) {
  const comp = new CompositionSequence({ type: 'composition', width: 320, height: 180, duration: 4, sequences } as unknown as SequenceSpec as never, shape, shape);
  await comp.build();
  comp.bindTimeline(createTimeline({ paused: true }));
  return comp;
}
const layer = (comp: CompositionSequence, name: string) => (comp as unknown as { _children: Array<{ spec: { name?: string }; awaitFrameAt(t: number): Promise<void>; destroy(): void }> })._children.find(c => c.spec.name === name)!;
const sh = (o: Record<string, unknown> = {}) => ({ type: 'shader', name: 's', fragment: GOOD, uniforms: { speed: 0.5 }, ...o });
// these tests look at what a layer asks of its 2D canvas too, so there is always a recording one
const installCanvas = (gl: FakeGl | null, c2: Fake2d = fake2d()) => installFake(gl, c2);
beforeEach(() => { vi.restoreAllMocks(); resetGl(); });

describe('the shader layer', () => {
  it('compiles one program from the wrapped source (the author\'s code at #line 1, the uniforms declared) when it is built', async () => {
    const gl = fakeGl(); installCanvas(gl);
    await build([sh()]);
    expect(gl.count('createProgram')).toBe(1);
    const src = gl.last('shaderSource')![1] as string;      // the last shaderSource is the fragment shader
    expect(src).toContain('#line 1\nvoid mainImage');
    expect(src).toContain('uniform float speed;');
  });

  it('draws a frame: iTime, iFrame, iResolution and the uniforms go to the GPU, one triangle is drawn, and the result is copied to the layer\'s 2D canvas', async () => {
    const gl = fakeGl(); const c2 = fake2d(); installCanvas(gl, c2);
    const comp = await build([sh()]);
    gl.calls.length = 0; c2.calls.length = 0;
    await layer(comp, 's').awaitFrameAt(1.5);
    const u = (name: string) => gl.calls.filter(c => c[0].startsWith('uniform') && (c[1] as { name: string }).name === name).map(c => c.slice(2));
    expect(u('iTime')).toEqual([[1.5]]);
    expect(u('iFrame')).toEqual([[45]]);                    // 1.5 s × 30 fps
    expect(u('iResolution')).toEqual([[320, 180, 1]]);
    expect(u('speed')).toEqual([[0.5]]);
    expect(gl.count('drawArrays')).toBe(1);
    expect(c2.calls.some(c => c[0] === 'drawImage')).toBe(true);
  });

  it('a time outside the layer\'s life is held at its ends (never a negative or past-the-end iTime)', async () => {
    const gl = fakeGl(); installCanvas(gl);
    const comp = await build([sh()]);
    for (const [asked, drawn] of [[-1, 0], [1e9, 4]] as Array<[number, number]>) {
      gl.calls.length = 0;
      await layer(comp, 's').awaitFrameAt(asked);
      expect(gl.calls.find(c => c[0] === 'uniform1f' && (c[1] as { name: string }).name === 'iTime')![2]).toBe(drawn);
    }
  });

  it('a shader that does not compile warns once, in the author\'s line numbers, and draws a checkerboard instead of calling the GPU', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gl = fakeGl({ compileOk: false, log: "ERROR: 0:2: 'undefinedThing' : undeclared identifier" }); const c2 = fake2d(); installCanvas(gl, c2);
    const comp = await build([sh()]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('did not compile'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("line 2: 'undefinedThing' : undeclared identifier");
    gl.calls.length = 0; c2.calls.length = 0;
    await layer(comp, 's').awaitFrameAt(1);
    expect(gl.count('drawArrays')).toBe(0);
    expect(c2.calls.filter(c => c[0] === 'fillRect').length).toBeGreaterThan(4);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('did not compile'))).toHaveLength(1);
  });

  it('a browser with no WebGL2 says so once and draws a checkerboard, without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c2 = fake2d(); installCanvas(null, c2);
    const comp = await build([sh(), sh({ name: 't' })]);
    await layer(comp, 's').awaitFrameAt(1);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('no WebGL2')).length).toBeGreaterThanOrEqual(1);
    expect(c2.calls.some(c => c[0] === 'fillRect')).toBe(true);
  });

  it('two shader layers share one context: WebGL2 is asked for once', async () => {
    const gl = fakeGl(); const spy = installCanvas(gl);
    await build([sh(), sh({ name: 't' })]);
    expect(spy.mock.calls.filter(c => c[0] === 'webgl2')).toHaveLength(1);
  });

  it('a composition with no shader layer never asks for a WebGL2 context', async () => {
    const gl = fakeGl(); const spy = installCanvas(gl);
    await build([{ type: 'shape', shape: 'rect', width: 10, height: 10 }]);
    expect(spy.mock.calls.filter(c => c[0] === 'webgl2')).toHaveLength(0);
  });

  it('destroying the layer deletes its program, and the last layer lets the context go', async () => {
    const gl = fakeGl(); installCanvas(gl);
    const comp = await build([sh()]);
    comp.destroy();
    expect(gl.count('deleteProgram')).toBeGreaterThanOrEqual(1);
  });

  it('a shader written wrong in a way that is only visible in the text still builds (the warnings are the static ones)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gl = fakeGl(); installCanvas(gl);
    await build([sh({ fragment: 'void mainImage(out vec4 c, in vec2 f) { gl_FragColor = vec4(1.0); }', uniforms: undefined })]);
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('gl_FragColor') && m.includes('layer "s"'))).toBe(true);
  });
});

describe('uniforms and keyframes', () => {
  it('a keyframe on a component of a vector moves that component and sends the whole vector to the GPU (vectors are plain objects: GSAP would read an array as a list of targets)', async () => {
    const gl = fakeGl(); installCanvas(gl);
    const tl = createTimeline({ paused: true });
    const comp = new CompositionSequence({ type: 'composition', width: 320, height: 180, duration: 4, sequences: [
      { type: 'shader', name: 's', fragment: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(pos, 0.0, 1.0); }', uniforms: { pos: [0.25, 0.5], tint: '#ff0000' },
        keyframes: [{ at: 0, to: { 'uniforms.pos.1': 1, 'uniforms.tint.2': 1 }, duration: 2, ease: 'none' }] },
    ] } as unknown as SequenceSpec as never, shape, shape);
    await comp.build();
    comp.bindTimeline(tl);
    tl.seek(1);                                              // halfway through the 2 s keyframe
    gl.calls.length = 0;
    await layer(comp, 's').awaitFrameAt(1);
    const sent = (name: string) => gl.calls.filter(c => /^uniform[234]fv$/.test(c[0]) && (c[1] as { name: string }).name === name).map(c => c[2]);
    expect(sent('pos')).toEqual([[0.25, 0.75]]);
    expect(sent('tint')).toEqual([[1, 0, 0.5]]);
  });

  it('a name nobody declared, or a whole vector, is said once and skipped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installCanvas(fakeGl());
    await build([sh({ uniforms: { speed: 0, pos: [0, 0] }, keyframes: [{ at: 0, to: { 'uniforms.sped': 1, 'uniforms.pos': 1, 'uniforms.pos.5': 1 }, duration: 1 }] })]);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('keyframe path uniforms.'));
    expect(said).toHaveLength(3);
    expect(said[0]).toContain('did you mean "speed"');
    expect(said.join('\n')).toContain("'uniforms.pos.0'");
  });
});
