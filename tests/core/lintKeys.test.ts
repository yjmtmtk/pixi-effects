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

describe("lintKeys: the neutral 'model' layer (a glTF model as data: the spec language's name, drawn by whichever engine is registered)", () => {
  it('knows its keys: a typo gets the did-you-mean, the real keys do not warn', () => {
    expect(warns({ type: 'model', asset: 'a.glb', animaton: 'Run' })[0]).toMatch(/"animaton" is not a model layer key — did you mean "animation"\?/);
    expect(warns({ type: 'model', asset: 'a.glb', animation: 'Run', animationSpeed: 2, animationOffset: 0.5, loop: false, fit: 'contain', camera: { fov: 30 }, light: 'none',
      width: 100, height: 100, resolution: 2, three: { renderer: 'webgpu', antialias: false }, initial: { x: 1 } })).toEqual([]);
  });
  it("an engine's own options live in a block named for the engine: `renderer` at the top is not a model key", () => {
    expect(warns({ type: 'model', asset: 'a.glb', renderer: 'webgpu' })[0]!).toMatch(/"renderer" is not a model layer key/);
  });
});

describe('lintKeys: a property written on the layer instead of in initial', () => {
  it('a path with z: says "put it in initial", and does not guess "did you mean d"', () => {
    const w = warns({ type: 'shape', shape: 'path', d: 'M 0 0 L 10 10', threeD: true, z: -300 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/"z" is a property.*initial: \{ z: -300 \}/s);
    expect(w[0]).not.toMatch(/did you mean/);
  });
  it('the same for x, alpha and rotationX on any kind of layer', () => {
    expect(warns({ type: 'text', text: 'a', alpha: 0.5 })[0]).toMatch(/"alpha" is a property.*initial: \{ alpha: 0\.5 \}/s);
    expect(warns({ type: 'shape', shape: 'rect', width: 1, height: 1, x: 100 })[0]).toMatch(/"x" is a property.*initial/s);
    expect(warns({ type: 'image', asset: 'a', rotationX: 20 })[0]).toMatch(/"rotationX" is a property.*initial/s);
  });
  it('anchorX on a text layer (a shape owns it as a layer key, a text does not) says initial too, not "it belongs to rect shape"', () => {
    const w = warns({ type: 'text', text: 'a', anchorX: 0.5 })[0]!;
    expect(w).toMatch(/"anchorX" is a property.*initial: \{ anchorX: 0\.5 \}/s);
    expect(w).not.toMatch(/belongs to/);
  });
  it('a key that is only a typo still gets its did-you-mean', () => {
    expect(warns({ type: 'text', text: 'a', duraton: 3 })[0]).toMatch(/did you mean "duration"/);
  });
});

describe('lintKeys: maskInverted is gone', () => {
  it('says what to write: mask: { layer: <the mask layer>, invert: true }', () => {
    const w = warns({ type: 'shape', shape: 'rect', width: 1, height: 1, mask: { type: 'shape', shape: 'circle', radius: 1 }, maskInverted: true });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/"maskInverted" is not a rect shape key.*mask: \{ layer: .*invert: true \}/s);
  });
});

describe('lintKeys: a picture key on a layer that is never drawn', () => {
  it('audio, a camera and a light are not drawn: filters, mask, blendMode, threeD … do nothing there, and the warning says so', () => {
    expect(warns({ type: 'audio', asset: 'a', filters: [{ type: 'blur' }] })[0]).toMatch(/"filters" does nothing on an audio layer: it is not drawn/);
    expect(warns({ type: 'camera', blendMode: 'add' })[0]).toMatch(/"blendMode" does nothing on a camera layer: .*initial/s);
    expect(warns({ type: 'light', mask: 'm', threeD: true })).toHaveLength(2);
    expect(warns({ type: 'light', kind: 'point' })).toEqual([]);
  });
  it('a light keeps castsShadows (it is the light\'s own switch, pitfall 86); a layer that is drawn keeps every picture key; an undefined value says nothing', () => {
    expect(warns({ type: 'light', castsShadows: true })).toEqual([]);
    expect(warns({ type: 'text', text: 'a', filters: [{ type: 'blur' }], mask: 'm', blendMode: 'add', threeD: true })).toEqual([]);
    expect(warns({ type: 'audio', asset: 'a', filters: undefined })).toEqual([]);
  });
  it('a null layer is a group: it keeps them too', () => {
    expect(warns({ type: 'null', name: 'g', filters: [{ type: 'blur' }] })).toEqual([]);
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

describe('lintKeys: a canvas layer', () => {
  it('knows the keys of the canvas layer (no warning for the documented ones)', () => {
    expect(warns({ type: 'canvas', name: 'c', width: 800, height: 450, resolution: 2, smoothing: false, seed: 3, params: { a: 1 }, setup: () => 1, draw: () => {}, initial: { x: 5 } })).toEqual([]);
  });

  it('a typo in a canvas key names the closest key, and says what the layer has', () => {
    const w = warns({ type: 'canvas', draws: () => {}, draw: () => {} });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('"draws"');
    expect(w[0]).toContain('canvas');
    expect(w[0]).toMatch(/did you mean "draw"/);
  });
});

