import { describeLayer } from './lint';

const MODES = ['normal', 'add', 'screen', 'multiply'];

/** Apply a layer's `blendMode` to its display object; an unknown mode warns and is ignored. */
export function applyBlendMode(spec: { blendMode?: string; name?: string; type: string }, display: { blendMode?: unknown; filters?: unknown }): void {
  const mode = spec.blendMode;
  if (mode === undefined) return;
  if (!MODES.includes(mode)) {
    console.warn(`pixi-effects: ${describeLayer(spec)}: blendMode "${mode}" is not supported (use ${MODES.join(', ')})`);
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
