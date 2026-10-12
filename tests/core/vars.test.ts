import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeVars, applyVars, numericVars, lintVars, RESERVED_NAMES } from '../../src/core/vars';
import { buildScope } from '../../src/expr/Scope';
import { evaluateExpr } from '../../src/expr/Parser';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('normalizeVars: what an author may declare', () => {
  it('numbers and strings are kept; nothing declared is an empty object', () => {
    expect(normalizeVars({ shift: 40, title: 'NORD', accent: '#e5399a' }, 'movie.init()')).toEqual({ shift: 40, title: 'NORD', accent: '#e5399a' });
    expect(normalizeVars(undefined, 'movie.init()')).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('a name that an expression already means is refused with the reason, and the rest are kept', () => {
    const v = normalizeVars({ W: 10, value: 1, sin: 2, PI: 3, ok: 4 }, 'movie.init()');
    expect(v).toEqual({ ok: 4 });
    const said = warn.mock.calls.map(c => String(c[0])).join('\n');
    for (const n of ['W', 'value', 'sin', 'PI']) expect(said, n).toMatch(new RegExp(`"${n}" is reserved`));
    expect(said).toMatch(/choose another name/);
  });

  it('the reserved list holds the expression words, the scope words, the functions, the constant and `value` (the counter placeholder)', () => {
    for (const n of ['w', 'h', 'W', 'H', 'GW', 'GH', 't', 'd', 'T', 'contain', 'cover', 'value', 'PI', 'sin', 'lerp', 'clamp', 'smoothstep', 'rand', 'noise', 'mod', 'step']) expect(RESERVED_NAMES, n).toContain(n);
  });

  it('a name that is not a word, and a value that is not a number or a string (a boolean says what to write), are refused with a sentence', () => {
    expect(normalizeVars({ 'my-var': 1, '2x': 2, flag: true, none: null, list: [1], good: 0 } as never, 'movie.init()')).toEqual({ good: 0 });
    const said = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(said).toMatch(/"my-var" is not a name/);
    expect(said).toMatch(/"flag".*boolean.*0 or 1/s);
    expect(said).toMatch(/"none".*number or a string/);
    expect(normalizeVars({ x: NaN } as never, 'movie.init()')).toEqual({});
  });

  it('vars that is not an object is said once', () => {
    expect(normalizeVars([1, 2] as never, 'movie.init()')).toEqual({});
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/vars must be an object/);
  });
});

describe('applyVars: {name} in any string of the spec becomes the value', () => {
  it('replaces declared names only, anywhere in the spec (text, colour, asset, nested layers, arrays), and leaves the input alone', () => {
    const spec = { sequences: [{ type: 'text', text: '{title} / {value}', style: { fill: '{accent}' }, keyframes: [{ at: 0, to: { x: '{shift}' } }] }, { type: 'image', asset: '{lang}-logo' }] };
    const frozen = JSON.stringify(spec);
    const out = applyVars(spec, { title: 'NORD', accent: '#e5399a', shift: 40, lang: 'ja' }) as typeof spec;
    expect(out.sequences[0]).toEqual({ type: 'text', text: 'NORD / {value}', style: { fill: '#e5399a' }, keyframes: [{ at: 0, to: { x: '40' } }] });
    expect(out.sequences[1]).toEqual({ type: 'image', asset: 'ja-logo' });
    expect(JSON.stringify(spec)).toBe(frozen);                              // never mutated
    expect(out).not.toBe(spec);
  });

  it('a name that is not declared stays as written ({value} is the counter), several in one string are all replaced, and nothing declared returns the same spec', () => {
    expect(applyVars({ a: '{x}-{x}-{y}' }, { x: 1 })).toEqual({ a: '1-1-{y}' });
    const spec = { a: '{x}' };
    expect(applyVars(spec, {})).toBe(spec);
  });

  it('keeps what is not plain data by reference (a filter instance, a function, an AudioBuffer-like), and does not recurse into it', () => {
    class Filter { label = '{title}'; apply() {} }
    const filter = new Filter();
    const fn = () => 1;
    const out = applyVars({ filters: [{ type: 'custom', filter }], setup: fn }, { title: 'X' }) as { filters: Array<{ filter: unknown }>; setup: unknown };
    expect(out.filters[0]!.filter).toBe(filter);
    expect(filter.label).toBe('{title}');
    expect(out.setup).toBe(fn);
  });
});

describe('numeric variables in expressions', () => {
  it('numericVars keeps the numbers only', () => {
    expect(numericVars({ shift: 40, title: 'NORD', k: 0.5 })).toEqual({ shift: 40, k: 0.5 });
  });

  it('a declared number is an identifier in an expression, beside W / GW / t; the built-in words win', () => {
    const root = { width: 1280, height: 720, duration: 10, frameRate: 30, vars: { shift: 40, W: 5 } as never };
    const scope = buildScope({ intrinsicWidth: 100, intrinsicHeight: 50, at: 2, duration: 4 }, null, root as never) as unknown as Record<string, number>;
    expect(scope.shift).toBe(40);
    expect(scope.W).toBe(1280);                                              // never shadowed
    expect(evaluateExpr('W/2 + shift', scope)).toBe(680);
    expect(evaluateExpr('shift * 2 - w', scope)).toBe(-20);
  });

  it('with no vars the scope is the one it always was', () => {
    const root = { width: 1280, height: 720, duration: 10, frameRate: 30 };
    const scope = buildScope({ intrinsicWidth: 0, intrinsicHeight: 0 }, null, root as never);
    expect(Object.keys(scope).sort()).toEqual(['GH', 'GW', 'H', 'T', 'W', 'contain', 'cover', 'd', 'h', 't', 'w']);
  });
});

describe('lintVars: what the composition says about its variables', () => {
  const lint = (spec: unknown, vars: Record<string, number | string>) => lintVars(spec, vars);

  it('a variable that nothing uses is said (the usual cause is a typo on one side)', () => {
    const w = lint({ sequences: [{ type: 'text', text: '{title}', initial: { x: 'W/2' } }] }, { title: 'a', unused: 1 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/variable "unused" is declared but nothing uses it/);
  });

  it('a variable is used by {name} in any string, or by name as a whole word in an expression', () => {
    expect(lint({ a: { fill: '{accent}' } }, { accent: '#fff' })).toEqual([]);
    expect(lint({ a: { x: 'W/2 + shift' } }, { shift: 4 })).toEqual([]);
    expect(lint({ a: { x: 'W/2 + shifty' } }, { shift: 4 })).toHaveLength(1);              // "shifty" is another word
    expect(lint({ a: { keyframes: [{ to: { x: 'shift*2' } }] } }, { shift: 4 })).toEqual([]);
  });

  it('a {name} that was not declared says which declared name it looks like ({value} and other counter words are left alone)', () => {
    const w = lint({ a: { text: '{titel} and {value}' } }, { title: 'x' });
    expect(w.some(m => /\{titel\} is not a declared variable — did you mean "title"\?/.test(m))).toBe(true);
    expect(w.some(m => /\{value\}/.test(m))).toBe(false);
  });

  it('with nothing declared and no {name} that looks like a typo there is nothing to say', () => {
    expect(lint({ a: { text: 'plain {value}' } }, {})).toEqual([]);
  });

  it('each problem is said once, however many times it occurs', () => {
    const w = lint({ a: [{ text: '{nope}' }, { text: '{nope}' }, { text: '{nope}' }] }, { yes: 1 });
    expect(w.filter(m => /\{nope\}/.test(m))).toHaveLength(1);
  });
});
