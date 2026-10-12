import type { Filter } from 'pixi.js';
import type { FilterSpec, CustomFilterSpec } from '../types';
import { ChromaKeyFilter } from './ChromaKey';
import { createNamedFilter } from './named';

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
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, copyPlain(x)])) as T;
  }
  return v;
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
  const params = copyPlain(given);
  const Cls = registry[type];
  const inst = (Cls ? new Cls(params) : createNamedFilter(type, params)) as NamedFilter;
  inst._name = name;
  return inst;
}

export function findFilterByName(filters: NamedFilter[], name: string): NamedFilter | null {
  return filters.find(f => f._name === name) ?? null;
}
