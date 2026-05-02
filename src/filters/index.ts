import { Filter } from 'pixi.js';
import type { FilterSpec, CustomFilterSpec } from '../types';
import { ChromaKeyFilter } from './ChromaKey';
import { Blur } from './Blur';
import { ColorMatrix } from './ColorMatrix';

interface FilterCtor {
  new (params: Record<string, unknown>): Filter;
}

const registry: Record<Exclude<FilterSpec['type'], 'custom'>, FilterCtor> = {
  chromaKey: ChromaKeyFilter as unknown as FilterCtor,
  blur: Blur as unknown as FilterCtor,
  colorMatrix: ColorMatrix as unknown as FilterCtor,
};

/** Internal marker we set on filter instances so partition path resolution finds them. */
export interface NamedFilter extends Filter {
  _name?: string;
}

export function createFilter(spec: FilterSpec): NamedFilter {
  if (spec.type === 'custom') {
    const inst = (spec as CustomFilterSpec).filter as NamedFilter;
    if (!(inst instanceof Filter)) {
      throw new Error('pixi-effects: { type: "custom" } requires a `filter` that is a PIXI Filter instance.');
    }
    inst._name = spec.name;
    return inst;
  }
  const Cls = registry[spec.type];
  if (!Cls) throw new Error(`pixi-effects: unknown filter type "${(spec as { type: string }).type}"`);
  const { type: _t, name, ...params } = spec as Record<string, unknown> & { type: string; name?: string };
  const inst = new Cls(params) as NamedFilter;
  inst._name = name;
  return inst;
}

export function findFilterByName(filters: NamedFilter[], name: string): NamedFilter | null {
  return filters.find(f => f._name === name) ?? null;
}
