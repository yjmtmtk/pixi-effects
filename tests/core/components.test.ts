import { describe, it, expect } from 'vitest';
import { expandComponents } from '../../src/core/components';

// A component is a composition written once (`components` on the root) and placed many times (`use`), each time with its own `params`.
// The expansion is a pure function of the spec: what is built is ordinary compositions.
const lowerThird = {
  params: { title: 'Name', role: '', accent: '#ff4f8b', shift: 0 },
  width: 600, height: 120, duration: 3,
  layers: [
    { type: 'shape', shape: 'rect', width: 600, height: 120, initial: { fill: '{accent}' } },
    { type: 'text', name: 'title', text: '{title}', initial: { x: '20 + shift', y: 40 } },
    { type: 'text', name: 'role', text: '{role} · {title}', initial: { x: 20, y: 90 } },
  ],
};
const movieWith = (layers: unknown[], components: Record<string, unknown> = { lowerThird }) => ({ components, layers });
type Layer = { type?: string; name?: string; at?: number; text?: string; width?: number; params?: Record<string, unknown>; layers?: Layer[]; initial?: Record<string, unknown>; use?: unknown; mask?: Layer };

describe('expandComponents', () => {
  it('places the definition where `use` is: an ordinary composition with the definition\'s size, time and layers, and the instance\'s own keys on top', () => {
    const { spec, warnings } = expandComponents(movieWith([{ use: 'lowerThird', name: 'host', at: 2, params: { title: 'Aiko', role: 'Host' }, initial: { x: 100, y: 900 } }]));
    expect(warnings).toEqual([]);
    const s = spec as { components?: unknown; layers: Layer[] };
    expect(s.components).toBeUndefined();
    const host = s.layers[0]!;
    expect(host).toMatchObject({ type: 'composition', name: 'host', at: 2, width: 600, height: 120, duration: 3, initial: { x: 100, y: 900 } });
    expect(host.use).toBeUndefined();
    expect(host.layers!.map(l => l.text ?? null)).toEqual([null, 'Aiko', 'Host · Aiko']);
    expect(host.layers![0]!.initial).toEqual({ fill: '#ff4f8b' });       // a default fills what the instance does not give
    expect(host.params).toEqual({ title: 'Aiko', role: 'Host', accent: '#ff4f8b', shift: 0 });   // kept for the expressions inside (shift)
  });

  it('every instance gets its own values; the definition is not changed', () => {
    const { spec } = expandComponents(movieWith([{ use: 'lowerThird', params: { title: 'A' } }, { use: 'lowerThird', params: { title: 'B', accent: '#000000' } }]));
    const [a, b] = (spec as { layers: Layer[] }).layers;
    expect(a!.layers![1]!.text).toBe('A');
    expect(b!.layers![1]!.text).toBe('B');
    expect(b!.layers![0]!.initial).toEqual({ fill: '#000000' });
    expect(lowerThird.layers[1]!.text).toBe('{title}');
  });

  it('the instance may also be written with type: composition, and nested in compositions and in other components (whose params reach it)', () => {
    const card = { params: { label: 'x' }, width: 100, height: 40, layers: [{ use: 'lowerThird', params: { title: '{label}!' } }] };
    const { spec, warnings } = expandComponents(movieWith([{ type: 'composition', width: 10, height: 10, layers: [{ type: 'composition', use: 'card', params: { label: 'Hi' } }] }], { lowerThird, card }));
    expect(warnings).toEqual([]);
    const inner = (spec as { layers: Layer[] }).layers[0]!.layers![0]!;
    expect(inner).toMatchObject({ type: 'composition', width: 100 });
    expect(inner.layers![0]!.layers![1]!.text).toBe('Hi!');
  });

  it('a placement inside a mask written as { layer, invert } is placed too', () => {
    const blob = { params: { r: 10 }, width: 50, height: 50, layers: [{ type: 'shape', shape: 'circle', radius: 'r' }] };
    const { spec, warnings } = expandComponents(movieWith([{ type: 'shape', shape: 'rect', width: 10, height: 10, mask: { layer: { use: 'blob', params: { r: 20 } }, invert: true } }], { blob }));
    expect(warnings).toEqual([]);
    const m = (spec as { layers: Array<{ mask: { layer: Layer; invert: boolean } }> }).layers[0]!.mask;
    expect(m.invert).toBe(true);
    expect(m.layer).toMatchObject({ type: 'composition', width: 50, params: { r: 20 } });
  });

  it('the component\'s own initial, keyframes and filters are kept and the placement\'s are added (initial key by key, the lists one after the other)', () => {
    const card = { width: 10, height: 10, initial: { alpha: 0, scale: 0.9 }, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }], filters: [{ type: 'blur', strength: 1 }], layers: [{ type: 'shape', shape: 'rect', width: 10, height: 10 }] };
    const { spec } = expandComponents(movieWith([{ use: 'card', initial: { x: 5, scale: 1 }, keyframes: [{ at: -0.3, to: { alpha: 0 }, duration: 0.3 }], filters: [{ type: 'grain' }] }], { card }));
    const placed = (spec as { layers: Array<Record<string, unknown>> }).layers[0]!;
    expect(placed.initial).toEqual({ alpha: 0, scale: 1, x: 5 });
    expect((placed.keyframes as unknown[]).length).toBe(2);
    expect((placed.filters as Array<{ type: string }>).map(f => f.type)).toEqual(['blur', 'grain']);
  });

  it('the component\'s markers come with it; a placement may add or move one', () => {
    const card = { width: 10, height: 10, duration: 3, markers: { in: 0.6, out: 2.4 }, layers: [{ type: 'shape', shape: 'rect', width: 10, height: 10 }] };
    const { spec } = expandComponents(movieWith([{ use: 'card', markers: { out: 2, hit: 1 } }], { card }));
    expect((spec as { layers: Array<Record<string, unknown>> }).layers[0]!.markers).toEqual({ in: 0.6, out: 2, hit: 1 });
  });

  it('a number param given a string: a number written as text becomes the number; anything else is said', () => {
    const { spec, warnings } = expandComponents(movieWith([{ use: 'lowerThird', params: { shift: '12' } }]));
    expect(warnings).toEqual([]);
    expect((spec as { layers: Layer[] }).layers[0]!.params!.shift).toBe(12);
    expect(expandComponents(movieWith([{ use: 'lowerThird', params: { shift: '{gap}' } }]), ['gap']).warnings).toEqual([]);     // a movie variable: a number after {vars}
    expect(expandComponents(movieWith([{ use: 'lowerThird', params: { shift: 'W * 0.1' } }])).warnings[0]).toMatch(/param "shift" is a number \(its default is 0\): give a number, or a \{variable\} that holds one; "W \* 0\.1" is not evaluated here; the default is used/);
  });

  it('a spec with no components and no use comes back as it is', () => {
    const plain = { layers: [{ type: 'text', text: '{title}' }] };
    expect(expandComponents(plain).spec).toBe(plain);
  });

  it('says what is wrong, in sentences an author can act on', () => {
    const say = (layers: unknown[], components: Record<string, unknown> = { lowerThird }, vars: string[] = []) => expandComponents(movieWith(layers, components), vars).warnings;
    expect(say([{ use: 'lowerThrid' }])[0]).toMatch(/use: "lowerThrid": no component of that name — did you mean "lowerThird"\?/);
    expect(say([{ use: 'lowerThird', params: { titel: 'A' } }])[0]).toMatch(/params: "titel" is not a param of component "lowerThird" — did you mean "title"\? \(its params: title, role, accent, shift\)/);
    expect(say([{ use: 'lowerThird', params: { title: true } }])[0]).toMatch(/param "title" must be a number or a string/);
    expect(say([{ use: 'lowerThird', layers: [{ type: 'text', text: 'x' }] }])[0]).toMatch(/has use: "lowerThird" and layers of its own: the component's layers are used, its own layers are ignored/);
    expect(say([], { lowerThird })[0]).toMatch(/component "lowerThird" is declared but nothing uses it/);
    const loop = { a: { layers: [{ use: 'b' }] }, b: { layers: [{ use: 'a' }] } };
    expect(say([{ use: 'a' }], loop).some(w => /component "a" uses itself \(a → b → a\)/.test(w))).toBe(true);
    const unused = { c: { params: { size: 1, colour: '#fff' }, layers: [{ type: 'shape', shape: 'circle', radius: 'size * 2' }] } };
    expect(say([{ use: 'c' }], unused)).toEqual([expect.stringMatching(/component "c": param "colour" is declared but nothing in it uses it/)]);
    const typo = { d: { params: { title: '' }, layers: [{ type: 'text', text: '{tilte}' }] } };
    expect(say([{ use: 'd' }], typo)[0]).toMatch(/component "d": \{tilte\} is not one of its params — did you mean "title"\?/);
    expect(say([{ use: 'd' }], { d: { params: { title: '' }, layers: [{ type: 'text', text: '{title} {brand}' }] } }, ['brand'])).toEqual([]);   // a movie variable is fine
    expect(say([{ use: 'd' }], { d: { params: { W: 1, title: '' }, layers: [{ type: 'text', text: '{title}' }] } })[0]).toMatch(/param "W" is reserved/);
    expect(say([{ use: 'lowerThird' }], { lowerThird: 'oops' })[0]).toMatch(/component "lowerThird" must be an object/);
    expect(say([{ use: 'x' }], {})[0]).toMatch(/use: "x": no component of that name \(none are declared: add components: \{ x: \{ width, height, layers \} \} to the root composition\)/);
  });
});
