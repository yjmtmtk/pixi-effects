import { describeLayer } from './lint';
import { suggestName } from './options';

/** The modes Pixi draws itself (`add`, `screen`, `multiply`) and `normal`. */
export const BASIC_BLEND_MODES = ['normal', 'add', 'screen', 'multiply'] as const;
/** The modes that need the backdrop: our own `BlendModeFilter`s (`src/filters/blendModes.ts`), loaded only when a movie uses one. */
export const ADVANCED_BLEND_MODES = [
  'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity', 'linear-burn',
] as const;
/** Every `blendMode` there is (the one table the warnings, the types and the docs check against). */
export const BLEND_MODES: readonly string[] = [...BASIC_BLEND_MODES, ...ADVANCED_BLEND_MODES];

export function isAdvancedBlend(mode: unknown): boolean {
  return typeof mode === 'string' && (ADVANCED_BLEND_MODES as readonly string[]).includes(mode);
}

/** Why `mode` is not a blend mode, with the likely name and the choices; null when it is one. */
export function blendProblem(mode: unknown): string | null {
  if (typeof mode === 'string' && BLEND_MODES.includes(mode)) return null;
  const guess = typeof mode === 'string' ? suggestName(mode, BLEND_MODES) : null;
  const shown = typeof mode === 'string' ? `"${mode}"` : String(mode);
  return `blendMode ${shown} is not supported${guess ? `; did you mean "${guess}"?` : ''} (use ${BLEND_MODES.join(', ')})`;
}

/** Does any layer of this composition (or one nested in it, or a mask layer) use an advanced blend? */
export function usesAdvancedBlend(spec: unknown): boolean {
  const visit = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false;
    if (Array.isArray(n)) return n.some(visit);
    const o = n as Record<string, unknown>;
    return isAdvancedBlend(o.blendMode) || visit(o.sequences) || visit(o.mask);
  };
  return visit(spec);
}

/** Apply a layer's `blendMode` to its display object; an unknown mode warns and is ignored. */
export function applyBlendMode(spec: { blendMode?: string; name?: string; type: string }, display: { blendMode?: unknown; filters?: unknown }): void {
  const mode = spec.blendMode;
  if (mode === undefined) return;
  const problem = blendProblem(mode);
  if (problem) {
    console.warn(`pixi-effects: ${describeLayer(spec)}: ${problem}`);
    return;
  }
  // A container's blend mode applies INSIDE a filter's offscreen pass (against transparent black: multiply gave
  // solid black) and not to the filtered result. With filters, the pass that draws onto the backdrop is the last
  // filter's, so the mode goes there; the container stays normal.
  const filters = display.filters;
  if (Array.isArray(filters) && filters.length > 0) {
    (filters[filters.length - 1] as { blendMode?: unknown }).blendMode = mode;
    return;
  }
  display.blendMode = mode;
}

/** What blend.ts needs of a blend filter (the real ones are Pixi filters; tests use plain objects). */
export type BlendFilterLike = { blendMode?: unknown; destroy(): void };
let factory: ((mode: string) => BlendFilterLike | null) | null = null;

/** `filters/blendModes.ts` hands its filter maker here when it registers, so this file never imports Pixi. */
export function setBlendFilterFactory(f: ((mode: string) => BlendFilterLike | null) | null): void {
  factory = f;
}

/** A fresh blend filter for an advanced mode, or null when the blends are not registered (or the mode is not an advanced one). */
export function blendFilterFor(mode: string): BlendFilterLike | null {
  return isAdvancedBlend(mode) && factory ? factory(mode) : null;
}

/**
 * Called by `Movie.init` when a layer uses an advanced mode, and only then: loads our blend filters (a separate chunk), registers them on
 * the pixi the movie runs on, and on WebGL turns the back buffer on (an advanced blend reads what is already drawn; WebGPU copies the
 * backdrop by itself, and has no such switch). A movie that uses none never reaches this, so nothing about it changes.
 */
export async function enableAdvancedBlend(renderer: unknown): Promise<void> {
  const { registerBlendModes } = await import('../filters/blendModes');
  registerBlendModes();
  const bb = (renderer as { backBuffer?: { useBackBuffer: boolean } }).backBuffer;
  if (bb) bb.useBackBuffer = true;
}
