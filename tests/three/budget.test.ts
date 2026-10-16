import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockThreeModule } from './mockThree';
mockThreeModule();

import { ThreeSequence } from '../../src/three/ThreeSequence';
import { resetThreeBudget, threeBudget } from '../../src/three/budget';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (over: Record<string, unknown> = {}) => new ThreeSequence({ type: 'three', setup: vi.fn(), ...over } as unknown as SequenceSpec, shape, shape);
const said = (warn: ReturnType<typeof vi.spyOn>) => warn.mock.calls.map((c) => String(c[0])).filter((m) => /live .*contexts|context/.test(m));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetThreeBudget(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('how many three layers a page can hold (a browser keeps about 16 WebGL contexts for the whole page, about 32 for WebGPU; the rest go blank without a word)', () => {
  it('counts the live layers per renderer, and a destroyed layer is given back', async () => {
    const a = make(), b = make({ renderer: 'webgpu' });
    await a.build(); await b.build();
    expect(threeBudget()).toEqual({ webgl: 1, webgpu: 1 });
    a.destroy();
    expect(threeBudget()).toEqual({ webgl: 0, webgpu: 1 });
  });

  it('12 WebGL three layers are fine; the 13th says once, with the numbers and the way out, that the page is near the limit', async () => {
    const layers = Array.from({ length: 13 }, (_, i) => make({ name: `L${i}` }));
    for (const l of layers.slice(0, 12)) await l.build();
    expect(said(warn)).toHaveLength(0);
    await layers[12]!.build();
    const m = said(warn);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/13 three layers/);
    expect(m[0]).toMatch(/16/);
    expect(m[0]).toMatch(/one layer|renderer: 'webgpu'/);
    await make().build();                                        // the 14th: not said again
    expect(said(warn)).toHaveLength(1);
  });

  it("WebGPU layers have their own, larger allowance (28 are fine, the 29th says)", async () => {
    for (let i = 0; i < 28; i++) await make({ renderer: 'webgpu' }).build();
    expect(said(warn)).toHaveLength(0);
    await make({ renderer: 'webgpu' }).build();
    expect(said(warn)).toHaveLength(1);
    expect(said(warn)[0]).toMatch(/29 three layers/);
  });

  it('a WebGL context the browser took away (webglcontextlost) says which layer went blank, once, and why', async () => {
    const seq = make({ name: 'knot' });
    await seq.build();
    const canvas = ((seq as any)._renderer as { domElement: HTMLCanvasElement }).domElement;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    const m = said(warn);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/"knot"/);
    expect(m[0]).toMatch(/WebGL context/);
    expect(m[0]).toMatch(/too many|16/);
  });

  it("a layer that is destroyed (a rebuild: setVars, resize) releases its context on purpose: the loss event that follows is not a warning", async () => {
    const seq = make({ name: 'fox' });
    await seq.build();
    const canvas = ((seq as any)._renderer as { domElement: HTMLCanvasElement }).domElement;
    seq.destroy();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));          // what forceContextLoss() makes the browser send, a moment after
    expect(said(warn)).toHaveLength(0);
  });

  it("a loss event during the destroy itself (sent at once by some browsers) is not a warning either", async () => {
    const seq = make({ name: 'fox' });
    await seq.build();
    const renderer = (seq as any)._renderer as { domElement: HTMLCanvasElement; forceContextLoss: () => void };
    renderer.forceContextLoss = () => { renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); };
    seq.destroy();
    expect(said(warn)).toHaveLength(0);
  });
});
