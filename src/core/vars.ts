import { EXPRESSION_NAMES } from '../expr/Parser';

/** A variable holds a number (read as an identifier in an expression) or a string (read as `{name}` in any string of the spec). */
export type VarValue = number | string;
export type Vars = Record<string, VarValue>;

/** Names a variable cannot have: what an expression already means (scope words, functions, PI) and `value` (the counter placeholder `{value}`). */
export const RESERVED_NAMES: readonly string[] = ['w', 'h', 'W', 'H', 'GW', 'GH', 't', 'd', 'T', 'contain', 'cover', 'value', ...EXPRESSION_NAMES];

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** What an author declared (`vars` in `movie.init`, or a `setVars` call), checked: a name that is refused or a value of the wrong kind is said and left out. */
export function normalizeVars(raw: unknown, where: string, warn: (message: string) => void = m => console.warn(m)): Vars {
  if (raw === undefined) return {};
  if (!isPlain(raw)) { warn(`pixi-effects: ${where}: vars must be an object of names and values ({ title: 'NORD', shift: 40 }); ignored`); return {}; }
  const out: Vars = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!NAME.test(name)) { warn(`pixi-effects: ${where}: "${name}" is not a name for a variable (letters, digits and _, not starting with a digit); ignored`); continue; }
    if (RESERVED_NAMES.includes(name)) { warn(`pixi-effects: ${where}: "${name}" is reserved (an expression word, a function, PI or the {value} counter); choose another name; ignored`); continue; }
    if (typeof value === 'boolean') { warn(`pixi-effects: ${where}: variable "${name}" is a boolean; write 0 or 1 (a variable is a number or a string); ignored`); continue; }
    if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
    else if (typeof value === 'string') out[name] = value;
    else warn(`pixi-effects: ${where}: variable "${name}" must be a number or a string, got ${JSON.stringify(value)}; ignored`);
  }
  return out;
}

/** The numbers among the variables: what the expression scope gets. */
export function numericVars(vars: Vars): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vars)) if (typeof v === 'number') out[k] = v;
  return out;
}

const TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function substitute(s: string, vars: Vars): string {
  return s.replace(TOKEN, (whole, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole));
}

/**
 * The spec with every `{name}` of a declared variable replaced by its value, in any string anywhere (text, colours, asset names, nested layers).
 * A new object: the input is never changed, and what is not plain data (a filter object, a function, a buffer) is kept as it is. A name that was
 * not declared stays as written (`{value}` is the counter). With nothing declared the same spec comes back.
 */
export function applyVars<T>(spec: T, vars: Vars): T {
  if (Object.keys(vars).length === 0) return spec;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return substitute(v, vars);
    if (Array.isArray(v)) return v.map(walk);
    if (isPlain(v)) { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x); return o; }
    return v;
  };
  return walk(spec) as T;
}
