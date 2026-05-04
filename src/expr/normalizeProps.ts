import { evaluateExpr, isExpr } from './Parser';

export interface NormalizeOptions {
  /** Keys whose string values should NOT be evaluated as expressions (e.g. 'fill', 'fontFamily'). */
  skipKeys?: string[];
}

export function normalizeProps<T>(
  input: T,
  scope: Record<string, number>,
  options: NormalizeOptions = {},
): T {
  const skip = new Set(options.skipKeys ?? []);
  return walk(input, scope, skip, null) as T;
}

function walk(
  value: unknown,
  scope: Record<string, number>,
  skip: Set<string>,
  currentKey: string | null,
): unknown {
  if (Array.isArray(value)) {
    return value.map(v => walk(v, scope, skip, currentKey));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = walk((value as Record<string, unknown>)[k], scope, skip, k);
    }
    return out;
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
