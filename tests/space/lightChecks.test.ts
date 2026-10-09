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
    const casters = [0, 1, 2, 3, 4].map(i => card({ name: 'c' + i, castsShadows: true }));
    expect(lightSetProblems([light({ kind: 'ambient' }), light({ castsShadows: true }), ...casters, card()]).join('\n')).toMatch(/5 layers cast shadows.*4.*"c4"/);
  });
});

describe('soft shadows from many lights', () => {
  const soft = (name: string, diffusion = 30) => S({ type: 'light', kind: 'point', name, castsShadows: true, initial: { shadowDiffusion: diffusion } });
  const base = [S({ type: 'light', kind: 'ambient' }), S({ type: 'shape', shape: 'rect', threeD: true, castsShadows: true })];
  it('three or more lights with soft shadows warn that they are costly; hard ones, or two soft ones, do not', () => {
    expect(lightSetProblems([...base, soft('a'), soft('b'), soft('c')]).join('\n')).toMatch(/3 lights make soft shadows.*costly/);
    expect(lightSetProblems([...base, soft('a'), soft('b')]).join('\n')).not.toContain('soft shadows');
    expect(lightSetProblems([...base, soft('a', 0), soft('b', 0), soft('c', 0)]).join('\n')).not.toContain('soft shadows');
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

describe('settings that do nothing', () => {
  const L2 = (o: Record<string, unknown>) => lightLayerProblems(S({ type: 'light', ...o })).join('\n');
  it('an ambient light cannot cast shadows (and does not count as the light that does)', () => {
    expect(L2({ kind: 'ambient', castsShadows: true })).toContain('ambient light has no direction');
    const set = lightSetProblems([S({ type: 'light', kind: 'ambient', castsShadows: true }), S({ type: 'light', kind: 'point' }), S({ type: 'shape', shape: 'rect', threeD: true, castsShadows: true })]).join('\n');
    expect(set).toContain('no light has castsShadows');
  });
  it('radius and falloffDistance need a falloff; shadowDarkness and shadowDiffusion need castsShadows; cone numbers need a spot', () => {
    expect(L2({ kind: 'point', initial: { radius: 300 } })).toMatch(/radius.*falloff: 'smooth' or 'inverseSquare'/);
    expect(L2({ kind: 'point', falloff: 'smooth', initial: { radius: 300 } })).not.toContain('falloff:');
    expect(L2({ kind: 'point', initial: { shadowDiffusion: 20 } })).toMatch(/shadowDiffusion.*castsShadows/);
    expect(L2({ kind: 'point', castsShadows: true, initial: { shadowDiffusion: 20 } })).not.toContain('castsShadows: true on the light');
    expect(L2({ kind: 'point', initial: { coneAngle: 30 } })).toMatch(/coneAngle.*spot/);
    expect(L2({ kind: 'spot', initial: { coneAngle: 30 } })).not.toContain('only for');
    expect(L2({ kind: 'parallel', falloff: 'smooth' })).toContain('parallel light has no distance');
  });
  it('a spot or parallel light that looks at its own position has no direction and lights nothing', () => {
    const at = { x: 100, y: 100, z: 300, lookAtX: 100, lookAtY: 100, lookAtZ: 300 };
    expect(L2({ kind: 'spot', initial: at })).toContain('lookAt equals the position');
    expect(L2({ kind: 'point', initial: at })).not.toContain('lookAt equals');
    expect(L2({ kind: 'spot', initial: { ...at, lookAtZ: 0 } })).not.toContain('lookAt equals');
  });
});
