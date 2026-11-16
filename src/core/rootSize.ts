/**
 * The size and the length of a movie, from `init({ width, height, duration })` and the composition's own `width` / `height` / `duration`.
 * Either place is enough (the other follows); when both are written and differ, init's wins and it is said (the composition used to be cut
 * silently to init's length, or drawn at its own size inside a canvas of another).
 */
export function rootSize(options: { width?: number; height?: number; duration?: number; composition?: { width?: unknown; height?: unknown; duration?: unknown } }): { width: number; height: number; duration: number; warnings: string[] } {
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const c = options.composition ?? {};
  const cw = num(c.width), ch = num(c.height), cd = num(c.duration);
  const warnings: string[] = [];
  const duration = options.duration ?? cd ?? 10;
  if (options.duration !== undefined && cd !== undefined && cd !== options.duration) {
    warnings.push(`pixi-effects: movie.init(): duration ${options.duration} and the composition's duration ${cd} differ: the movie is ${options.duration} s (write the length in one place)`);
  }
  const width = options.width ?? cw ?? 1920, height = options.height ?? ch ?? 1080;
  const initSized = options.width !== undefined || options.height !== undefined;
  if (initSized && (cw !== undefined || ch !== undefined) && ((cw ?? width) !== width || (ch ?? height) !== height)) {
    warnings.push(`pixi-effects: movie.init(): width × height ${width} × ${height} and the composition's ${cw ?? width} × ${ch ?? height} differ: the movie is ${width} × ${height} (write the size in one place)`);
  }
  return { width, height, duration, warnings };
}
