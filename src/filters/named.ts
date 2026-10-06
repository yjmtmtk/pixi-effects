import * as PIXI from 'pixi.js';
import type { Filter } from 'pixi.js';
import { suggestName } from '../core/options';

/**
 * Declarative filters: `{ type: 'glow', outerStrength: 3 }` instead of `{ type: 'custom', filter: new GlowFilter(...) }`.
 * The type is the filter's class name without `Filter`, in camelCase (case does not matter): `glow`, `dropShadow`,
 * `crt`, `rgbSplit`, `oldFilm`, `pixelate`... Every other key is passed to the filter as its options. `blur`, `noise`,
 * `alpha` and `colorMatrix` come from pixi.js; the rest come from the `pixi-filters` package, loaded on first use.
 */

type FilterCtor = new (options?: Record<string, unknown>) => Filter;

/** pixi.js's own filters: no extra package. Looked up when used (a test may mock pixi.js without them). */
const CORE: Record<string, string> = { blur: 'BlurFilter', noise: 'NoiseFilter', alpha: 'AlphaFilter' };
const CORE_TYPES = [...Object.keys(CORE), 'colorMatrix'];

/** The filters of pixi-filters v6, by type name. */
const LIBRARY_TYPES = [
  'adjustment', 'advancedBloom', 'ascii', 'backdropBlur', 'bevel', 'bloom', 'bulgePinch', 'colorGradient', 'colorMap',
  'colorOverlay', 'colorReplace', 'convolution', 'crossHatch', 'crt', 'dot', 'dropShadow', 'emboss', 'glitch', 'glow',
  'godray', 'grayscale', 'hslAdjustment', 'kawaseBlur', 'motionBlur', 'multiColorReplace', 'oldFilm', 'outline',
  'pixelate', 'radialBlur', 'reflection', 'rgbSplit', 'shockwave', 'simpleLightmap', 'simplexNoise', 'tiltShift',
  'tiltShiftAxis', 'twist', 'zoomBlur',
];

/** Every type that `filters: [{ type }]` accepts besides `chromaKey` and `custom`. */
export const FILTER_TYPES: readonly string[] = [...CORE_TYPES, ...LIBRARY_TYPES];

const NOT_NAMED = new Set(['custom', 'chromaKey']);
const lower = (s: string): string => s.toLowerCase();
const isLibraryType = (t: string): boolean => LIBRARY_TYPES.some(n => lower(n) === lower(t));
const isCoreType = (t: string): boolean => CORE_TYPES.some(n => lower(n) === lower(t));

export function isNamedFilterType(t: string): boolean {
  return !NOT_NAMED.has(t);
}

function unknownType(t: string): Error {
  const guess = suggestName(t, FILTER_TYPES);
  return new Error(`pixi-effects: unknown filter type "${t}"${guess ? ` — did you mean "${guess}"?` : ''} (valid: ${[...FILTER_TYPES, 'chromaKey', 'custom'].join(', ')})`);
}

// ── the pixi-filters module, registered once ──────────────────────────────────────────
let library: Map<string, FilterCtor> | null = null;

/** Register the `pixi-filters` module (its exports named `*Filter`). `ensureFilterLibrary` does this for you. */
export function registerFilterLibrary(mod: Record<string, unknown>): void {
  library = new Map();
  for (const [key, value] of Object.entries(mod)) {
    if (key.endsWith('Filter') && typeof value === 'function') library.set(lower(key.slice(0, -'Filter'.length)), value as FilterCtor);
  }
}
export function resetFilterLibrary(): void { library = null; }

const MISSING = (type: string, why?: string): Error => new Error(
  `pixi-effects: the filter "${type}" comes from the pixi-filters package${why ? ` (${why})` : ''}. ` +
  'Add it to your import map ("pixi-filters": "https://esm.sh/pixi-filters@6.1.5?external=pixi.js") or run `npm i pixi-filters`.');

/** Does any layer in this composition use a filter that needs the pixi-filters package? Also rejects unknown types. */
export function needsFilterLibrary(spec: unknown): boolean {
  let needs = false;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.filters)) {
      for (const f of o.filters as Array<{ type?: unknown }>) {
        if (typeof f?.type !== 'string' || !isNamedFilterType(f.type)) continue;
        if (isLibraryType(f.type)) needs = true;
        else if (!isCoreType(f.type)) throw unknownType(f.type);
      }
    }
    for (const key of ['sequences', 'mask']) visit(o[key]);
  };
  visit(spec);
  return needs;
}

/** Load `pixi-filters` (once) when the composition uses one of its filters. Call before building the layers. */
export async function ensureFilterLibrary(
  spec: unknown,
  load: () => Promise<Record<string, unknown>> = () => import('pixi-filters') as unknown as Promise<Record<string, unknown>>,
): Promise<void> {
  if (!needsFilterLibrary(spec) || library) return;
  try {
    registerFilterLibrary(await load());
  } catch (e) {
    throw MISSING('(see the type in your filters)', (e as Error).message);
  }
}

/** Filters whose constructor takes one plain value instead of an options object: type → the option that is that value. */
const SINGLE_VALUE: Record<string, string> = { pixelate: 'size', emboss: 'strength' };

const MATRIX_PRESETS = ['sepia', 'grayscale', 'negative', 'polaroid', 'technicolor', 'vintage', 'kodachrome', 'browni'] as const;

function colorMatrix(params: Record<string, unknown>): Filter {
  const f = new (PIXI as unknown as Record<string, new () => unknown>).ColorMatrixFilter!() as unknown as Record<string, unknown> & { matrix: number[] };
  const preset = params.preset as string | undefined;
  if (preset !== undefined) {
    if (!(MATRIX_PRESETS as readonly string[]).includes(preset)) {
      const guess = suggestName(preset, MATRIX_PRESETS);
      throw new Error(`pixi-effects: colorMatrix preset "${preset}" is not one of ${MATRIX_PRESETS.join(', ')}${guess ? ` — did you mean "${guess}"?` : ''}`);
    }
    (f[preset === 'grayscale' ? 'desaturate' : preset] as () => void).call(f);
  }
  if (Array.isArray(params.matrix)) f.matrix = params.matrix as number[];
  return f as unknown as Filter;
}

/** Build the filter a `{ type: 'glow', … }` spec names. */
export function createNamedFilter(type: string, params: Record<string, unknown>): Filter {
  if (lower(type) === 'colormatrix') return colorMatrix(params);
  const core = Object.entries(CORE).find(([k]) => lower(k) === lower(type));
  if (core) return new ((PIXI as unknown as Record<string, FilterCtor>)[core[1]]!)(params);
  if (!isLibraryType(type)) throw unknownType(type);
  const Ctor = library?.get(lower(type));
  if (!Ctor) throw MISSING(type, library ? 'not found in the loaded package' : 'not loaded yet');
  const single = SINGLE_VALUE[Object.keys(SINGLE_VALUE).find(k => lower(k) === lower(type)) ?? ''];
  return single ? new (Ctor as unknown as new (v?: unknown) => Filter)(params[single]) : new Ctor(params);
}
