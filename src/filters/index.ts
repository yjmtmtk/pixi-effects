import type { Filter } from 'pixi.js';
import type { FilterSpec, CustomFilterSpec } from '../types';
import { ChromaKeyFilter } from './ChromaKey';
import { createNamedFilter } from './named';
import { isPlain } from '../core/isPlain';

interface FilterCtor {
  new (params: Record<string, unknown>): Filter;
}

const registry: Record<string, FilterCtor> = {
  chromaKey: ChromaKeyFilter as unknown as FilterCtor,
};

/** Internal marker we set on filter instances so partition path resolution finds them. */
export interface NamedFilter extends Filter {
  _name?: string;
}

/**
 * Duck-type check for a PIXI Filter. We can't use `instanceof Filter` because
 * filters loaded from a different bundled copy of `pixi.js` (e.g. via esm.sh
 * or a duplicated install) won't share the same class reference. PIXI's
 * `Filter` exposes an `apply` method on its prototype; check for that instead.
 */
function looksLikePixiFilter(x: unknown): x is Filter {
  return !!x && typeof x === 'object' && typeof (x as { apply?: unknown }).apply === 'function';
}

/**
 * A copy of plain objects and arrays, all the way down: a filter keeps the object it is given (`red: { x, y }` is its uniform), and a keyframe on
 * `'filters.s.red.x'` writes the leaf in place, so without a copy the author's spec would change with the last frame that was drawn.
 */
function copyPlain<T>(v: T): T {
  if (Array.isArray(v)) return v.map(copyPlain) as unknown as T;
  if (isPlain(v)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, copyPlain(x)])) as T;
  }
  return v;
}

/**
 * A grain filter's `loop` in a layer: `true` is the movie's length (a clip made to loop has no jump in its grain at the seam), `{ duration: n }`
 * any other; a number alone says the new form (it read as a count). The filter itself takes seconds.
 */
export function grainLoop(spec: FilterSpec, movieDuration: number): FilterSpec {
  const f = spec as unknown as Record<string, unknown>;
  if (typeof f.type !== 'string' || f.type.toLowerCase() !== 'grain' || !('loop' in f)) return spec;
  const { loop, ...rest } = f;
  if (loop === true) return { ...rest, loop: movieDuration } as unknown as FilterSpec;
  const d = loop && typeof loop === 'object' ? (loop as { duration?: unknown }).duration : undefined;
  if (typeof d === 'number') return { ...rest, loop: d } as unknown as FilterSpec;
  if (typeof loop === 'number') console.warn(`pixi-effects: grain: loop: ${loop} is now loop: { duration: ${loop} } (or loop: true for the movie's length); ignored`);
  else if (loop !== undefined && loop !== false) console.warn(`pixi-effects: grain: loop must be true (the movie's length) or { duration: seconds }, got ${JSON.stringify(loop)}; ignored`);
  return rest as unknown as FilterSpec;
}

export function createFilter(spec: FilterSpec): NamedFilter {
  if (spec.type === 'custom') {
    const inst = (spec as CustomFilterSpec).filter;
    if (!looksLikePixiFilter(inst)) {
      throw new Error('pixi-effects: { type: "custom" } requires a `filter` that is a PIXI Filter instance (duck-typed: must have an `apply` method).');
    }
    const named = inst as NamedFilter;
    named._name = spec.name;
    return named;
  }
  const { type, name, ...given } = spec as Record<string, unknown> & { type: string; name?: string };
  const unset = Object.keys(given).filter(k => given[k] === undefined);
  if (unset.length > 0) {                                                  // an explicit undefined would overwrite the filter's own default (bloom: "reading 'x'" at init)
    console.warn(`pixi-effects: the "${type}" filter has ${unset.map(k => `"${k}"`).join(', ')} set to undefined (a misspelt variable or a missing field?): the filter's default is used instead.`);
    for (const k of unset) delete given[k];
  }
  const params = copyPlain(given);
  const Cls = registry[type];
  const inst = (Cls ? new Cls(params) : createNamedFilter(type, params)) as NamedFilter;
  inst._name = name;
  return inst;
}

export function findFilterByName(filters: NamedFilter[], name: string): NamedFilter | null {
  return filters.find(f => f._name === name) ?? null;
}
