import { describe, it, expect } from 'vitest';
import { lintKeys } from '../../src/core/lint';
import { layerKeys, PROP_KEYS, STYLE_KEYS } from '../../src/core/layerKeys';
import type { SequenceSpec } from '../../src/types';

const warns = (spec: unknown): string[] => { const out: string[] = []; lintKeys(spec as SequenceSpec, m => out.push(m)); return out; };

describe('lintKeys: a layer key that does not exist', () => {
  it('says which key, what kind of layer, and what was probably meant', () => {
    expect(warns({ type: 'text', text: 'a', bogus: 1 })[0]).toMatch(/unnamed text layer: "bogus" is not a text layer key/);
    expect(warns({ type: 'text', text: 'a', duraton: 3 })[0]).toMatch(/"duraton" is not a text layer key — did you mean "duration"\?/);
    expect(warns({ type: 'shape', shape: 'rect', name: 'r', width: 1, height: 1, cornerradius: 4 })[0]).toMatch(/layer "r": "cornerradius" is not a rect shape key — did you mean "cornerRadius"\?/);
  });
  it("a key that belongs to another kind of layer says so (a rect has no radius; a circle has)", () => {
    const w = warns({ type: 'shape', shape: 'rect', width: 1, height: 1, radius: 5 })[0]!;
    expect(w).toMatch(/"radius" is not a rect shape key/);
    expect(w).toMatch(/circle/);
  });
  it('one warning per wrong key', () => {
    expect(warns({ type: 'text', text: 'a', bogus: 1, other: 2 })).toHaveLength(2);
  });
  it('a layer of a kind registered elsewhere (three) is not checked: nothing is known about its keys here', () => {
    expect(warns({ type: 'three', setup() {}, anything: 1 })).toEqual([]);
  });
});

describe('lintKeys: animatable property names (initial, set, to, from)', () => {
  it('a mistyped property says which one was meant', () => {
    expect(warns({ type: 'shape', shape: 'rect', width: 1, height: 1, keyframes: [{ at: 0, to: { alhpa: 1 }, duration: 1 }] })[0]).toMatch(/"alhpa" is not an animatable property — did you mean "alpha"\?/);
    expect(warns({ type: 'text', text: 'a', initial: { rotaton: 3 } })[0]).toMatch(/"rotaton" is not an animatable property — did you mean "rotation"\?/);
  });
  it('the usual ones are quiet, for every kind of layer', () => {
    const ok = (spec: object, props: string[]) => expect(warns({ ...spec, initial: Object.fromEntries(props.map(p => [p, 1])) })).toEqual([]);
    ok({ type: 'text', text: 'a' }, ['x', 'y', 'alpha', 'rotation', 'scale', 'scaleX', 'scaleY', 'skewX', 'tint', 'anchorX', 'anchorY', 'pivotX', 'value', 'visibleChars', 'fill']);
    ok({ type: 'shape', shape: 'rect', width: 1, height: 1 }, ['fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth', 'cornerRadius', 'width', 'height', 'trimStart', 'trimEnd', 'z', 'rotationX', 'rotationY']);
    ok({ type: 'camera' }, ['x', 'y', 'z', 'lookAtX', 'lookAtY', 'lookAtZ', 'fov', 'offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ']);
    ok({ type: 'audio', sfx: 'pop' }, ['volume']);
    ok({ type: 'image', asset: 'a' }, ['x', 'y', 'tint', 'alpha', 'scale']);
  });
  it("routed paths ('filters.g.amount', 'three.box.x') are for their routers: not checked here", () => {
    expect(warns({ type: 'image', asset: 'a', keyframes: [{ at: 0, to: { 'filters.g.amount': 1, 'three.box.x': 2 }, duration: 1 }] })).toEqual([]);
  });
  it("fillGradient's own mistakes are said by its own check, not twice", () => {
    expect(warns({ type: 'shape', shape: 'rect', width: 1, height: 1, fillGradient: { stops: [[0, '#fff'], [1, '#000']] }, keyframes: [{ at: 0, to: { gradientAngle: 90, fillGradient: { angle: 1 } }, duration: 1 }] })).toEqual([]);
  });
  it('is said once per key, even if many keyframes repeat it', () => {
    const kf = Array.from({ length: 5 }, (_, i) => ({ at: i, to: { alhpa: 1 }, duration: 1 }));
    expect(warns({ type: 'text', text: 'a', keyframes: kf })).toHaveLength(1);
  });
});

describe('lintKeys: text style keys', () => {
  it('a mistyped style key says which one was meant; real ones are quiet', () => {
    expect(warns({ type: 'text', text: 'a', style: { fontSzie: 20 } })[0]).toMatch(/style\.fontSzie is not a text style key — did you mean "fontSize"\?/);
    expect(warns({ type: 'text', text: 'a', style: { fontSize: 20, fontFamily: 'Arial', fontWeight: 'bold', fill: '#fff', letterSpacing: 2, align: 'center', wordWrap: true, wordWrapWidth: 300, lineHeight: 40, stroke: { color: '#000', width: 2 }, dropShadow: { color: '#000' }, padding: 4 } })).toEqual([]);
  });
});

describe('lintKeys: no warning for what is correct', () => {
  it('a key whose value is undefined is not there (a spread that sets it only when it applies)', () => {
    expect(warns({ type: 'text', text: 'a', anchorX: undefined, initial: { x: 1, alhpa: undefined } })).toEqual([]);
    expect(warns({ type: 'text', text: 'a', bogus: 1 })).toHaveLength(1);                       // a real wrong key still is
  });
  it('PixiJS text style keys that work are accepted: filters and tagStyles', () => {
    expect(warns({ type: 'text', text: 'a', style: { filters: [], tagStyles: {} } })).toEqual([]);
  });
});

describe('the tables cover the type (compile time) and what they list is sane', () => {
  it('every kind has keys that include `type`, and a shape has its own', () => {
    for (const spec of [{ type: 'text' }, { type: 'image' }, { type: 'video' }, { type: 'audio' }, { type: 'composition' }, { type: 'camera' }, { type: 'null' }, { type: 'shape', shape: 'path' }]) {
      expect(layerKeys(spec as never), JSON.stringify(spec)).toContain('type');
    }
    expect(layerKeys({ type: 'shape', shape: 'circle' } as never)).toContain('radius');
    expect(layerKeys({ type: 'shape', shape: 'circle' } as never)).not.toContain('width');
    expect(layerKeys({ type: 'three' } as never)).toBeNull();
    expect(PROP_KEYS.has('alpha')).toBe(true);
    expect(STYLE_KEYS).toContain('fontSize');
  });
});
