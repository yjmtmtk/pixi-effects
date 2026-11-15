import { describe, it, expect } from 'vitest';
import { expandComponents } from '../../src/core/components';

// A component is a composition written once (`components` on the root) and placed many times (`use`), each time with its own `params`.
// The expansion is a pure function of the spec: what is built is ordinary compositions.
const lowerThird = {
  params: { title: 'Name', role: '', accent: '#ff4f8b', shift: 0 },
  width: 600, height: 120, duration: 3,
  sequences: [
    { type: 'shape', shape: 'rect', width: 600, height: 120, initial: { fillColor: '{accent}' } },
    { type: 'text', name: 'title', text: '{title}', initial: { x: '20 + shift', y: 40 } },
    { type: 'text', name: 'role', text: '{role} · {title}', initial: { x: 20, y: 90 } },
  ],
};
const movieWith = (sequences: unknown[], components: Record<string, unknown> = { lowerThird }) => ({ components, sequences });
type Layer = { type?: string; name?: string; at?: number; text?: string; width?: number; params?: Record<string, unknown>; sequences?: Layer[]; initial?: Record<string, unknown>; use?: unknown; mask?: Layer };

describe('expandComponents', () => {
  it('places the definition where `use` is: an ordinary composition with the definition\'s size, time and layers, and the instance\'s own keys on top', () => {
    const { spec, warnings } = expandComponents(movieWith([{ use: 'lowerThird', name: 'host', at: 2, params: { title: 'Aiko', role: 'Host' }, initial: { x: 100, y: 900 } }]));
    expect(warnings).toEqual([]);
    const s = spec as { components?: unknown; sequences: Layer[] };
    expect(s.components).toBeUndefined();
    const host = s.sequences[0]!;
    expect(host).toMatchObject({ type: 'composition', name: 'host', at: 2, width: 600, height: 120, duration: 3, initial: { x: 100, y: 900 } });
    expect(host.use).toBeUndefined();
    expect(host.sequences!.map(l => l.text ?? null)).toEqual([null, 'Aiko', 'Host · Aiko']);
    expect(host.sequences![0]!.initial).toEqual({ fillColor: '#ff4f8b' });       // a default fills what the instance does not give
    expect(host.params).toEqual({ title: 'Aiko', role: 'Host', accent: '#ff4f8b', shift: 0 });   // kept for the expressions inside (shift)
  });

  it('every instance gets its own values; the definition is not changed', () => {
    const { spec } = expandComponents(movieWith([{ use: 'lowerThird', params: { title: 'A' } }, { use: 'lowerThird', params: { title: 'B', accent: '#000000' } }]));
    const [a, b] = (spec as { sequences: Layer[] }).sequences;
    expect(a!.sequences![1]!.text).toBe('A');
    expect(b!.sequences![1]!.text).toBe('B');
    expect(b!.sequences![0]!.initial).toEqual({ fillColor: '#000000' });
    expect(lowerThird.sequences[1]!.text).toBe('{title}');
  });

  it('the instance may also be written with type: composition, and nested in compositions and in other components (whose params reach it)', () => {
    const card = { params: { label: 'x' }, width: 100, height: 40, sequences: [{ use: 'lowerThird', params: { title: '{label}!' } }] };
    const { spec, warnings } = expandComponents(movieWith([{ type: 'composition', width: 10, height: 10, sequences: [{ type: 'composition', use: 'card', params: { label: 'Hi' } }] }], { lowerThird, card }));
    expect(warnings).toEqual([]);
    const inner = (spec as { sequences: Layer[] }).sequences[0]!.sequences![0]!;
    expect(inner).toMatchObject({ type: 'composition', width: 100 });
    expect(inner.sequences![0]!.sequences![1]!.text).toBe('Hi!');
  });

  it('a spec with no components and no use comes back as it is', () => {
    const plain = { sequences: [{ type: 'text', text: '{title}' }] };
    expect(expandComponents(plain).spec).toBe(plain);
  });

  it('says what is wrong, in sentences an author can act on', () => {
    const say = (sequences: unknown[], components: Record<string, unknown> = { lowerThird }, vars: string[] = []) => expandComponents(movieWith(sequences, components), vars).warnings;
    expect(say([{ use: 'lowerThrid' }])[0]).toMatch(/use: "lowerThrid": no component of that name — did you mean "lowerThird"\?/);
    expect(say([{ use: 'lowerThird', params: { titel: 'A' } }])[0]).toMatch(/params: "titel" is not a param of component "lowerThird" — did you mean "title"\? \(its params: title, role, accent, shift\)/);
    expect(say([{ use: 'lowerThird', params: { title: true } }])[0]).toMatch(/param "title" must be a number or a string/);
    expect(say([{ use: 'lowerThird', sequences: [{ type: 'text', text: 'x' }] }])[0]).toMatch(/has use: "lowerThird" and sequences of its own: the component's layers are used, its own sequences are ignored/);
    expect(say([], { lowerThird })[0]).toMatch(/component "lowerThird" is declared but nothing uses it/);
    const loop = { a: { sequences: [{ use: 'b' }] }, b: { sequences: [{ use: 'a' }] } };
    expect(say([{ use: 'a' }], loop).some(w => /component "a" uses itself \(a → b → a\)/.test(w))).toBe(true);
    const unused = { c: { params: { size: 1, colour: '#fff' }, sequences: [{ type: 'shape', shape: 'circle', radius: 'size * 2' }] } };
    expect(say([{ use: 'c' }], unused)).toEqual([expect.stringMatching(/component "c": param "colour" is declared but nothing in it uses it/)]);
    const typo = { d: { params: { title: '' }, sequences: [{ type: 'text', text: '{tilte}' }] } };
    expect(say([{ use: 'd' }], typo)[0]).toMatch(/component "d": \{tilte\} is not one of its params — did you mean "title"\?/);
    expect(say([{ use: 'd' }], { d: { params: { title: '' }, sequences: [{ type: 'text', text: '{title} {brand}' }] } }, ['brand'])).toEqual([]);   // a movie variable is fine
    expect(say([{ use: 'd' }], { d: { params: { W: 1, title: '' }, sequences: [{ type: 'text', text: '{title}' }] } })[0]).toMatch(/param "W" is reserved/);
    expect(say([{ use: 'lowerThird' }], { lowerThird: 'oops' })[0]).toMatch(/component "lowerThird" must be an object/);
    expect(say([{ use: 'x' }], {})[0]).toMatch(/use: "x": no component of that name \(none are declared: add components: \{ x: \{ width, height, sequences \} \} to the root composition\)/);
  });
});
