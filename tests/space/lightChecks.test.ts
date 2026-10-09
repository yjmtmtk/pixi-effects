import { describe, it, expect } from 'vitest';
import { lightKindProblem, lightLayerProblems, lightSetProblems, fogProblems } from '../../src/space/lightChecks';
import type { SequenceSpec } from '../../src/types';
const S = (o: Record<string, unknown>) => o as unknown as SequenceSpec;

describe('lightKindProblem', () => {
  it('a good kind is fine; an alias says what it means; a typo gets did-you-mean', () => {
    for (const k of ['ambient', 'point', 'spot', 'parallel', undefined]) expect(lightKindProblem(k)).toBeNull();
    expect(lightKindProblem('directional')).toContain('did you mean "parallel"');
    expect(lightKindProblem('sun')).toContain('"parallel"');
    expect(lightKindProblem('omni')).toContain('"point"');
    expect(lightKindProblem('spotlite')).toContain('did you mean "spot"');
    expect(lightKindProblem('lava')).toContain('ambient, point, spot, parallel');
  });
});

describe('lightLayerProblems', () => {
  it('a clean light says nothing', () => {
    expect(lightLayerProblems(S({ type: 'light', kind: 'spot', initial: { x: 1, intensity: 0.8, coneAngle: 40 } }))).toEqual([]);
  });
  it('aliases and misplaced keys name the right key', () => {
    const p = lightLayerProblems(S({ type: 'light', kind: 'spot', intensity: 1, castShadows: true, initial: { pointOfInterest: [0, 0, 0], angle: 30 } })).join('\n');
    expect(p).toContain('"intensity" must go inside initial / keyframes');
    expect(p).toContain('"castShadows"'); expect(p).toContain('castsShadows');
    expect(p).toContain('"pointOfInterest"'); expect(p).toContain('lookAtX');
    expect(p).toContain('"angle"'); expect(p).toContain('coneAngle');
  });
  it('a feather above 1, an intensity above 10 (written as a percentage) and a threeD light', () => {
    const p = lightLayerProblems(S({ type: 'light', threeD: true, initial: { coneFeather: 50, intensity: 80 } })).join('\n');
    expect(p).toContain('coneFeather'); expect(p).toContain('0..1');
    expect(p).toContain('intensity 80'); expect(p).toContain('percent');
    expect(p).toContain('threeD');
  });
});

describe('lightSetProblems', () => {
  const light = (o: Record<string, unknown> = {}) => S({ type: 'light', kind: 'point', ...o });
  const card = (o: Record<string, unknown> = {}) => S({ type: 'shape', shape: 'rect', threeD: true, ...o });
  it('no lights: nothing to say (a composition without light is untouched)', () => {
    expect(lightSetProblems([card(), card({ castsShadows: true })])).toEqual([]);
  });
  it('a light without any ambient light warns that what no light reaches is black', () => {
    expect(lightSetProblems([light(), card()]).join('\n')).toContain('ambient');
    expect(lightSetProblems([light({ kind: 'ambient' }), light(), card()])).toEqual([]);
  });
  it('castsShadows on layers but on no light, or on a light but on no layer, says which half is missing', () => {
    expect(lightSetProblems([light({ kind: 'ambient' }), light(), card({ castsShadows: true })]).join('\n')).toContain('no light has castsShadows');
    expect(lightSetProblems([light({ kind: 'ambient' }), light({ castsShadows: true }), card()]).join('\n')).toContain('no layer has castsShadows');
  });
  it('castsShadows or lit on a layer that is not threeD', () => {
    const p = lightSetProblems([light({ kind: 'ambient' }), light(), S({ type: 'text', text: 'a', castsShadows: true, lit: false })]).join('\n');
    expect(p).toContain('castsShadows'); expect(p).toContain('lit'); expect(p).toContain('threeD');
  });
  it('more lights or casters than there is room for says which are dropped', () => {
    const many = Array.from({ length: 9 }, (_, i) => light({ name: 'l' + i }));
    expect(lightSetProblems([light({ kind: 'ambient' }), ...many, card()]).join('\n')).toMatch(/9 lights.*8.*"l8"/);
    const casters = [0, 1, 2].map(i => card({ name: 'c' + i, castsShadows: true }));
    expect(lightSetProblems([light({ kind: 'ambient' }), light({ castsShadows: true }), ...casters, card()]).join('\n')).toMatch(/3 layers cast shadows.*2.*"c2"/);
  });
});

describe('fogProblems', () => {
  it('fogFar at or below fogNear, and an amount outside 0..1', () => {
    const cam = (initial: Record<string, unknown>) => S({ type: 'camera', initial });
    expect(fogProblems(cam({ fogNear: 600, fogFar: 2400, fogAmount: 1 }))).toEqual([]);
    expect(fogProblems(cam({ fogNear: 600, fogFar: 600 })).join('\n')).toContain('fogFar');
    expect(fogProblems(cam({ fogAmount: 5 })).join('\n')).toContain('0..1');
  });
});
