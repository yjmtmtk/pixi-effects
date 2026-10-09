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
