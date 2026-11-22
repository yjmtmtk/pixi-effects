import { suggestName } from '../core/options';
import { tryEvaluateExpr } from '../expr/Parser';

/**
 * A layer's volume as written (a number, or an expression of numbers and variables such as 'loud * 0.5', as any other number may be)
 * → a level ≥ 0. Anything that is not a number says so, names the layer, and plays at `fallback`: a non-finite level used to reach
 * Web Audio and stop the whole movie ("The provided float value is non-finite").
 */
export function soundLevel(value: unknown, scope: Record<string, number>, layer: string, fallback = 1): number {
  if (value === undefined || value === null) return fallback;
  let n = NaN, why = '';
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') {
    const r = tryEvaluateExpr(value, scope);
    if ('value' in r) n = r.value;
    else {
      const name = /undefined variable: (\w+)/.exec(r.error)?.[1];
      const guess = name ? suggestName(name, Object.keys(scope)) : null;
      why = ` (${r.error}${guess ? ` — did you mean "${guess}"?` : ''})`;
    }
  }
  if (!Number.isFinite(n)) {
    console.warn(`pixi-effects: ${layer}: volume ${JSON.stringify(value)} is not a number${why}: give a number (0.8) or an expression of numbers and variables ('loud * 0.5'); it plays at ${fallback}`);
    return fallback;
  }
  return Math.max(0, n);
}
