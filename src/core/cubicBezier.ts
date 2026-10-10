
/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as an ease.
 * The curve is (0,0) (x1,y1) (x2,y2) (1,1); x is time, y is progress. Solve x(t) = p for t (Newton, then bisection when the slope is
 * flat) and return y(t). Exactly 0 at 0 and 1 at 1; y may leave 0..1 (an overshoot), x1 and x2 may not (the CSS rule).
 */
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number): number => ((ay * t + by) * t + cy) * t;
  const dX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {                         // Newton: quadratic convergence when the slope is healthy
      const err = X(t) - p;
      if (Math.abs(err) < 1e-9) return Y(t);
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1; t = p;                             // bisection: always converges (x is monotone for x1, x2 in 0..1)
    for (let i = 0; i < 60; i++) {
      const x = X(t);
      if (Math.abs(x - p) < 1e-10) break;
      if (x < p) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}

const NUM = String.raw`\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*`;
const RE = new RegExp(`^\\s*cubic-bezier\\(${NUM},${NUM},${NUM},${NUM}\\)\\s*$`, 'i');

/** The four numbers of a well-formed `cubic-bezier(x1, y1, x2, y2)` string, or null. */
export function parseCubicBezier(name: string): [number, number, number, number] | null {
  const m = RE.exec(name);
  return m && !cubicBezierProblem(name) ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

/** Why a cubic-bezier ease string is malformed, or null. */
export function cubicBezierProblem(name: string): string | null {
  const m = RE.exec(name);
  if (!m) return 'expected "cubic-bezier(x1, y1, x2, y2)" with four numbers, like CSS';
  const x1 = Number(m[1]), x2 = Number(m[3]);
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return 'x1 and x2 must be between 0 and 1 (y1 and y2 may overshoot)';
  return null;
}
