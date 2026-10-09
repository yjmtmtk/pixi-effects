import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());

import { extensions } from 'pixi.js';
import { ADVANCED_BLEND_MODES, blendFilterFor, setBlendFilterFactory } from '../../src/core/blend';
import { registerBlendModes, createBlendFilter, OWN_MODES } from '../../src/filters/blendModes';

const added = () => (extensions as unknown as { __added: Array<{ extension: { name: string; type: string } }> }).__added;

beforeEach(() => { setBlendFilterFactory(null); });

describe('the blend filters', () => {
  it('there is one for each advanced mode of the table, and no other', () => {
    expect([...OWN_MODES].sort()).toEqual([...ADVANCED_BLEND_MODES].sort());
  });
  it('registerBlendModes registers each once under its CSS name, and again does nothing', () => {
    registerBlendModes();
    registerBlendModes();
    const names = added().map(c => c.extension.name);
    expect([...names].sort()).toEqual([...ADVANCED_BLEND_MODES].sort());
    expect(added().every(c => c.extension.type === 'blend-mode')).toBe(true);
  });
  it('after registering, blend.ts can make a filter for a mode: a new one each time; none for a basic mode or a typo', () => {
    registerBlendModes();
    const a = blendFilterFor('overlay'), b = blendFilterFor('overlay');
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
    expect(blendFilterFor('add')).toBeNull();
    expect(blendFilterFor('softlight')).toBeNull();
    expect(createBlendFilter('hue')).not.toBeNull();
  });
  it('before registering there is no factory: blend.ts makes nothing', () => {
    expect(blendFilterFor('overlay')).toBeNull();
  });
});
