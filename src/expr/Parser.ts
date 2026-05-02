import { Parser } from 'expr-eval';

const parser = new Parser();

export function isExpr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function evaluateExpr(source: string, scope: Record<string, number>): number {
  try {
    return parser.evaluate(source, scope) as number;
  } catch (e) {
    console.warn(`pixi-effects: expression failed: ${source}`, e);
    return 0;
  }
}
