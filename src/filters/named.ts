import { AlphaFilter, BlurFilter, ColorMatrixFilter, GpuProgram, NoiseFilter } from 'pixi.js';   // by name, not `* as`: a namespace read by a
import type { Filter } from 'pixi.js';                                                         // string keeps all of pixi.js in an app's bundle
import type { NamedFilterType } from '../types';
import { suggestName } from '../core/options';
import { GrainFilter } from './Grain';
import { WarpFilter } from './Warp';

/**
 * Declarative filters: `{ type: 'glow', outerStrength: 3 }` instead of `{ type: 'custom', filter: new GlowFilter(...) }`.
 * The type is the filter's class name without `Filter`, in camelCase (case does not matter): `glow`, `dropShadow`,
 * `crt`, `rgbSplit`, `oldFilm`, `pixelate`... Every other key is passed to the filter as its options. `blur`, `noise`,
 * `alpha` and `colorMatrix` come from pixi.js; the rest come from the `pixi-filters` package, loaded on first use.
 */

type FilterCtor = new (options?: Record<string, unknown>) => Filter;

/** pixi.js's own filters: no extra package. Looked up when used (a test may mock pixi.js without them). */
/** Read when a filter is made, not when this module loads (a test that mocks pixi.js without the filters still loads it). */
const CORE: Record<string, () => FilterCtor> = { blur: () => BlurFilter as unknown as FilterCtor, noise: () => NoiseFilter as unknown as FilterCtor, alpha: () => AlphaFilter as unknown as FilterCtor };
const CORE_TYPES = ['blur', 'noise', 'alpha', 'colorMatrix', 'grain', 'warp'] as const;

/** The filters of pixi-filters v6, by type name. */
const LIBRARY_TYPES = [
  'adjustment', 'advancedBloom', 'ascii', 'backdropBlur', 'bevel', 'bloom', 'bulgePinch', 'colorGradient', 'colorMap',
  'colorOverlay', 'colorReplace', 'convolution', 'crossHatch', 'crt', 'dot', 'dropShadow', 'emboss', 'glitch', 'glow',
  'godray', 'grayscale', 'hslAdjustment', 'kawaseBlur', 'motionBlur', 'multiColorReplace', 'oldFilm', 'outline',
  'pixelate', 'radialBlur', 'reflection', 'rgbSplit', 'shockwave', 'simpleLightmap', 'simplexNoise', 'tiltShift',
  'tiltShiftAxis', 'twist', 'zoomBlur',
] as const;

/** The compiler checks the type `NamedFilterType` (what `filters: [{ type }]` accepts in TypeScript) and these tables name the same filters, both ways: add a filter to one and `tsc` says so. */
type Same<A, B> = [Exclude<A, B>] extends [never] ? ([Exclude<B, A>] extends [never] ? true : { onlyInTables: Exclude<B, A> }) : { onlyInType: Exclude<A, B> };
type Assert<T extends true> = T;
export type __FilterTypesCovered = Assert<Same<NamedFilterType, (typeof CORE_TYPES)[number] | (typeof LIBRARY_TYPES)[number]>>;

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

/** `what`: `"glow"`, or a list of quoted types each with its layer (`"glow" (layer "title"), "crt"`); `many` when it names more than one. */
const MISSING = (what: string, why?: string, many = false): Error => new Error(
  `pixi-effects: the ${many ? 'filters' : 'filter'} ${what} ${many ? 'come' : 'comes'} from the pixi-filters package${why ? ` (${why})` : ''}. ` +
  'Add it to your import map ("pixi-filters": "https://esm.sh/pixi-filters@6.1.5?external=pixi.js") or run `npm i pixi-filters`.');

/** The pixi-filters types this composition uses, each once, with the first named layer that uses it. Also rejects unknown types. */
function libraryFilters(spec: unknown): Map<string, string | undefined> {
  const found = new Map<string, string | undefined>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.filters)) {
      for (const f of o.filters as Array<{ type?: unknown }>) {
        if (typeof f?.type !== 'string' || !isNamedFilterType(f.type)) continue;
        if (isLibraryType(f.type)) { if (!found.get(f.type)) found.set(f.type, typeof o.name === 'string' && o.name ? o.name : undefined); }
        else if (!isCoreType(f.type)) throw unknownType(f.type);
      }
    }
    for (const key of ['sequences', 'mask', 'layer']) visit(o[key]);          // ('layer': a mask written as { layer: <spec>, invert })
  };
  visit(spec);
  return found;
}

/** Does any layer in this composition use a filter that needs the pixi-filters package? Also rejects unknown types. */
export function needsFilterLibrary(spec: unknown): boolean { return libraryFilters(spec).size > 0; }

/** Load `pixi-filters` (once) when the composition uses one of its filters. Call before building the layers. */
export async function ensureFilterLibrary(
  spec: unknown,
  load: () => Promise<Record<string, unknown>> = () => import('pixi-filters') as unknown as Promise<Record<string, unknown>>,
): Promise<void> {
  const used = libraryFilters(spec);
  if (!used.size || library) return;
  try {
    registerFilterLibrary(await load());
  } catch (e) {
    const what = [...used].map(([type, layer]) => `"${type}"${layer ? ` (layer "${layer}")` : ''}`).join(', ');
    throw MISSING(what, (e as Error).message, used.size > 1);
  }
}

/** Filters whose constructor takes one plain value instead of an options object: type → the option that is that value. */
const SINGLE_VALUE: Record<string, string> = { pixelate: 'size', emboss: 'strength' };

const MATRIX_PRESETS = ['sepia', 'grayscale', 'negative', 'polaroid', 'technicolor', 'vintage', 'kodachrome', 'browni'] as const;

function colorMatrix(params: Record<string, unknown>): Filter {
  const f = new ColorMatrixFilter() as unknown as Record<string, unknown> & { matrix: number[] };
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

const GRADIENT_TYPES = ['linear', 'radial', 'conic'];

/** `colorGradient`: the filter's own option is called `type`, which the DSL already uses, so it is written `gradientType`. */
function colorGradientParams(params: Record<string, unknown>): Record<string, unknown> {
  const { gradientType, ...rest } = params;
  if (gradientType === undefined) return rest;
  const i = GRADIENT_TYPES.indexOf(String(gradientType));
  if (i < 0) throw new Error(`pixi-effects: colorGradient gradientType "${gradientType}" is not one of linear, radial or conic`);
  return { ...rest, type: i };
}

/**
 * `bulgePinch.center` is a fraction of the filtered layer ({ x: 0.5, y: 0.5 } is its middle), unlike `twist.offset`, `zoomBlur.center` and `shockwave.center`, which are
 * canvas pixels. A pixel value ({ x: 900, y: 500 }) puts the bulge far outside the layer and nothing shows, and nothing says so: said here, once per filter.
 */
function lintBulgeCenter(params: Record<string, unknown>): void {
  const c = params.center as { x?: unknown; y?: unknown } | unknown[] | undefined;
  if (!c || typeof c !== 'object') return;
  const xy = Array.isArray(c) ? [c[0], c[1]] : [c.x, c.y];
  if (!xy.some(v => typeof v === 'number' && Math.abs(v) > 3)) return;
  console.warn(`pixi-effects: bulgePinch.center is 0-1 of the layer ({ x: 0.5, y: 0.5 } is its middle), but ${JSON.stringify(c)} reads as pixels: the bulge lands outside the layer and nothing shows. Write the point as a fraction (x / the layer's width), or animate center.x / center.y between 0 and 1.`);
}

/**
 * pixi-filters 6.1.5: RadialBlurFilter writes `uKernelSize` as an i32 but its WGSL struct reads an f32, so on WebGPU (the default backend) the 15 is read as a
 * denormal 0 and the blur is skipped: `radialBlur` did nothing at all (WebGL, where the GLSL says int, was fine). The WGSL is rebuilt with the field as an i32.
 * Checked against every filter of the package: this is the only mismatch. Remove when pixi-filters fixes it (the check below then finds nothing to change).
 */
function fixRadialBlurGpu(f: Filter): Filter {
  const holder = f as unknown as { gpuProgram?: { name?: string; vertex: unknown; fragment: { source: string } } };
  const gp = holder.gpuProgram;
  if (!gp || !/uKernelSize\s*:\s*f32/.test(gp.fragment.source)) return f;
  holder.gpuProgram = GpuProgram.from({ name: gp.name, vertex: gp.vertex as Parameters<typeof GpuProgram.from>[0]['vertex'], fragment: { ...gp.fragment, source: gp.fragment.source.replace(/uKernelSize(\s*):\s*f32/, 'uKernelSize$1: i32') } }) as typeof gp;
  return f;
}

/** Build the filter a `{ type: 'glow', … }` spec names. */
export function createNamedFilter(type: string, params: Record<string, unknown>): Filter {
  if (lower(type) === 'bulgepinch') lintBulgeCenter(params);
  if (lower(type) === 'colormatrix') return colorMatrix(params);
  if (lower(type) === 'grain') return new GrainFilter(params) as unknown as Filter;
  if (lower(type) === 'warp') return new WarpFilter(params) as unknown as Filter;
  const core = Object.entries(CORE).find(([k]) => lower(k) === lower(type));
  if (core) return new (core[1]())(params);
  if (!isLibraryType(type)) throw unknownType(type);
  const Ctor = library?.get(lower(type));
  if (!Ctor) throw MISSING(`"${type}"`, library ? 'not found in the loaded package' : 'not loaded yet');
  const single = SINGLE_VALUE[Object.keys(SINGLE_VALUE).find(k => lower(k) === lower(type)) ?? ''];
  if (single) return new (Ctor as unknown as new (v?: unknown) => Filter)(params[single]);
  const made = new Ctor(lower(type) === 'colorgradient' ? colorGradientParams(params) : params);
  return lower(type) === 'radialblur' ? fixRadialBlurGpu(made) : made;
}
