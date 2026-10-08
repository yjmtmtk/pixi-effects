/**
 * A movie's scenes, for the tools that talk about "per scene" (the audio report, `check`): top-level layers that have a name you
 * gave (not the automatic `text#3`, nor a run of similar layers the timeline folds into one row: `snow-# ×130`) and last at least one second. `ai/tools/check.mjs` has the same rule (`scenesOf`); a test keeps them equal.
 */
export function namedScenes<T extends { name: string; start: number; end: number; depth: number }>(rows: T[]): Array<{ name: string; start: number; end: number }> {
  return rows.filter((r) => r.depth === 0 && !/[#×]/.test(r.name) && r.end - r.start >= 1).map((r) => ({ name: r.name, start: r.start, end: r.end }));
}
