import { evaluateExpr, isExpr } from './Parser';

export interface NormalizeOptions {
  /** Keys whose string values should NOT be evaluated as expressions (e.g. 'fill', 'fontFamily'). */
  skipKeys?: string[];
  /**
   * `'+=36'` / `'-=GW*0.1'`: a value measured from where the layer is. 'allow' keeps it as the string the timeline understands (its right side evaluated);
   * 'forbid' (the default) warns and reads it as the number, because there is nothing to be relative to.
   */
  relative?: 'allow' | 'forbid';
  /** Where the values are, for the warning ('initial', 'the from side of a keyframe', 'a style'). */
  where?: string;
}

export function normalizeProps<T>(
  input: T,
  scope: Record<string, number>,
  options: NormalizeOptions = {},
): T {
  const skip = new Set(options.skipKeys ?? []);
  return walk(input, scope, skip, null, options) as T;
}

const RELATIVE = /^\s*([+-])=([\s\S]*)$/;

function walk(
  value: unknown,
  scope: Record<string, number>,
  skip: Set<string>,
  currentKey: string | null,
  options: NormalizeOptions,
): unknown {
  if (Array.isArray(value)) {
    return value.map(v => walk(v, scope, skip, currentKey, options));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = walk((value as Record<string, unknown>)[k], scope, skip, k, options);
    }
    return out;
  }
  if (typeof value === 'string' && !(currentKey !== null && skip.has(currentKey))) {
    const rel = RELATIVE.exec(value);
    if (rel) {
      const n = evaluateExpr(rel[2]!.trim(), scope);
      if (options.relative === 'allow') return `${rel[1]}=${n}`;
      console.warn(`pixi-effects: "${value.trim()}"${currentKey ? ` (${currentKey})` : ''} is a relative value (measured from where the layer is): it works in a keyframe's to / from / set, not in ${options.where ?? 'an initial or a style'}; it is read as the number ${rel[1] === '-' ? -n : n}`);
      return rel[1] === '-' ? -n : n;
    }
  }
  if (isExpr(value) && !(currentKey !== null && skip.has(currentKey))) {
    // Hex colour strings (`#fff`, `#ff0000`, `#ff0000ff`) are passed through
    // verbatim — they're never expressions. Same for `rgb(...)` /
    // `rgba(...)` / `oklch(...)` etc. Without this, a bare `tint: '#ff0000'`
    // would be evaluated and silently zero out.
    if (looksLikeColorString(value)) return value;
    return evaluateExpr(value, scope);
  }
  return value;
}

function looksLikeColorString(s: string): boolean {
  if (s.length === 0) return false;
  if (s.charCodeAt(0) === 35 /* '#' */) return true;
  // Quick prefix check for css-style colour functions: rgb, rgba, hsl,
  // hsla, oklab, oklch, lab, lch.
  return /^(rgb|hsl|oklab|oklch|lab|lch)\b/i.test(s);
}
