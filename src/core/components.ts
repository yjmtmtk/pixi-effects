import { RESERVED_NAMES, type VarValue } from './vars';
import { suggestName } from './options';
import { describeLayer } from './lint';
import type { SequenceSpec } from '../types';

/**
 * Components: a composition written once and placed many times, each time with its own values (After Effects: a precomp used in several places,
 * with its Essential properties; React: a component and its props).
 *
 *   composition: {
 *     components: { lowerThird: { params: { title: 'Name' }, width: 600, height: 120, sequences: [ … '{title}' … ] } },
 *     sequences: [ { use: 'lowerThird', at: 2, params: { title: 'Aiko' }, initial: { x: 100, y: 900 } } ],
 *   }
 *
 * The params are read as the movie's variables are: `{title}` in any string of the definition, a number param as a word in its expressions.
 * Expanding is a pure function of the spec: what is built is ordinary compositions, so inspect, check and pick see every layer.
 */

type Plain = Record<string, unknown>;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every string in a value (a definition), at any depth. */
function stringsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (isPlain(v)) for (const x of Object.values(v)) stringsOf(x, out);
  return out;
}

/** A copy of `v` with each `{name}` of `values` replaced, in every string (what is not plain data, a function or a filter object, is kept). */
function substitute(v: unknown, values: Record<string, VarValue>): unknown {
  if (typeof v === 'string') return v.replace(TOKEN, (whole, name: string) => (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole));
  if (Array.isArray(v)) return v.map(x => substitute(x, values));
  if (isPlain(v)) { const o: Plain = {}; for (const [k, x] of Object.entries(v)) o[k] = substitute(x, values); return o; }
  return v;
}

interface Definition { params: Record<string, VarValue>; body: Plain }

/**
 * The spec with every `use` replaced by the component it names (and `components` taken off the root), plus what is wrong with it, as sentences.
 * `varNames` are the movie's variables: a `{name}` of one of them inside a definition is not a typo. With no `components` and no `use` the same
 * spec comes back.
 */
export function expandComponents<T>(spec: T, varNames: readonly string[] = []): { spec: T; warnings: string[] } {
  const warnings: string[] = [];
  if (!isPlain(spec)) return { spec, warnings };
  const raw = spec.components;
  if (raw === undefined && !usesAny(spec.sequences)) return { spec, warnings };
  const say = (m: string) => warnings.push(`pixi-effects: ${m}`);

  const defs = new Map<string, Definition>();
  if (raw !== undefined && !isPlain(raw)) say(`components must be an object of names and compositions ({ lowerThird: { width, height, sequences } }); ignored`);
  else if (raw) {
    for (const [name, def] of Object.entries(raw)) {
      if (!isPlain(def)) { say(`component "${name}" must be an object (a composition: { params?, width, height, sequences }); ignored`); continue; }
      const { params: p, ...body } = def;
      const params: Record<string, VarValue> = {};
      if (p !== undefined && !isPlain(p)) say(`component "${name}": params must be an object of names and default values ({ title: 'Name', size: 40 }); ignored`);
      for (const [k, v] of Object.entries(isPlain(p) ? p : {})) {
        if (!NAME.test(k)) { say(`component "${name}": "${k}" is not a name for a param (letters, digits and _, not starting with a digit); ignored`); continue; }
        if (RESERVED_NAMES.includes(k)) { say(`component "${name}": param "${k}" is reserved (an expression word, a function, PI or the {value} counter); choose another name; ignored`); continue; }
        if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
        else if (typeof v === 'string') params[k] = v;
        else say(`component "${name}": param "${k}" must have a default that is a number or a string, got ${JSON.stringify(v)}; ignored`);
      }
      defs.set(name, { params, body });
      // what the definition says about its own params: one nothing reads, a {name} that is none of them (nor a movie variable)
      const strings = stringsOf(body);
      const guessed = new Set<string>();                              // a param a typo points at is said once, by the typo
      const said = new Set<string>();
      for (const s of strings) for (const m of s.matchAll(TOKEN)) {
        const t = m[1]!;
        if (said.has(t) || t in params || varNames.includes(t) || RESERVED_NAMES.includes(t)) continue;
        said.add(t);
        const guess = suggestName(t, Object.keys(params));
        if (guess) guessed.add(guess);
        say(`component "${name}": {${t}} is not one of its params${guess ? ` — did you mean "${guess}"?` : Object.keys(params).length ? ` (its params: ${Object.keys(params).join(', ')})` : ` (it declares none: params: { ${t}: '…' })`} (it stays as written)`);
      }
      for (const k of Object.keys(params)) {
        if (guessed.has(k)) continue;
        const word = new RegExp(`(?<![A-Za-z0-9_.])${escapeRe(k)}(?![A-Za-z0-9_])`);
        if (!strings.some(s => word.test(s))) say(`component "${name}": param "${k}" is declared but nothing in it uses it (write {${k}} in a string, or "${k}" in an expression)`);
      }
    }
  }

  const used = new Set<string>();
  const expandList = (list: unknown, stack: string[]): unknown => (Array.isArray(list) ? list.map(l => expandLayer(l, stack)) : list);
  const expandLayer = (layer: unknown, stack: string[]): unknown => {
    if (!isPlain(layer)) return layer;
    if (layer.use === undefined) {
      let out: Plain = layer;
      if (Array.isArray(layer.sequences)) out = { ...out, sequences: expandList(layer.sequences, stack) };
      if (isPlain(layer.mask)) out = { ...out, mask: expandLayer(layer.mask, stack) };
      return out;
    }
    const { use, params: given, sequences: own, ...rest } = layer;
    const who = describeLayer(layer as unknown as SequenceSpec);
    const empty = { ...rest, type: 'composition', sequences: [] };
    if (typeof use !== 'string') { say(`${who}: use must be the name of a component (a string), got ${JSON.stringify(use)}; drawn empty`); return empty; }
    const def = defs.get(use);
    if (!def) {
      const guess = suggestName(use, [...defs.keys()]);
      say(`${who}: use: "${use}": no component of that name${guess ? ` — did you mean "${guess}"?` : defs.size ? ` (components: ${[...defs.keys()].join(', ')})` : ` (none are declared: add components: { ${use}: { width, height, sequences } } to the root composition)`}; drawn empty`);
      return empty;
    }
    used.add(use);
    if (stack.includes(use)) { say(`component "${stack[0]}" uses itself (${[...stack, use].join(' → ')}); the inner one is drawn empty`); return empty; }
    if (own !== undefined) say(`${who} has use: "${use}" and sequences of its own: the component's layers are used, its own sequences are ignored`);
    if (layer.type !== undefined && layer.type !== 'composition') say(`${who}: use: "${use}" makes a composition; type "${String(layer.type)}" is ignored`);
    const values: Record<string, VarValue> = { ...def.params };
    if (given !== undefined && !isPlain(given)) say(`${who}: params must be an object of names and values ({ title: 'Aiko' }); ignored`);
    for (const [k, v] of Object.entries(isPlain(given) ? given : {})) {
      if (!(k in def.params)) {
        const guess = suggestName(k, Object.keys(def.params));
        say(`${who}: params: "${k}" is not a param of component "${use}"${guess ? ` — did you mean "${guess}"?` : ''} (its params: ${Object.keys(def.params).join(', ') || 'none'}); ignored`);
        continue;
      }
      if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string') values[k] = v;
      else say(`${who}: param "${k}" must be a number or a string, got ${JSON.stringify(v)}; the default ${JSON.stringify(def.params[k])} is used`);
    }
    const body = substitute(def.body, values) as Plain;
    const placed: Plain = { ...body, ...rest, type: 'composition', params: values };
    placed.sequences = expandList(body.sequences ?? [], [...stack, use]);
    if (isPlain(placed.mask)) placed.mask = expandLayer(placed.mask, stack);
    return placed;
  };

  const { components: _drop, ...root } = spec;
  void _drop;
  const out = { ...root, sequences: expandList(root.sequences, []) } as Plain;
  if (root.sequences === undefined) delete out.sequences;
  for (const name of defs.keys()) if (!used.has(name)) say(`component "${name}" is declared but nothing uses it (place it with { use: '${name}', params: { … } })`);
  return { spec: out as T, warnings };
}

/** Is there a `use` anywhere in these layers (nested compositions and inline masks included)? */
function usesAny(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.some(l => isPlain(l) && (l.use !== undefined || usesAny(l.sequences) || (isPlain(l.mask) && usesAny([l.mask]))));
}
