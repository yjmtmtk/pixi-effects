export interface DepthItem {
  /** Position in the composition's stack (monotonic; gaps allowed). */
  stackIndex: number;
  threeD: boolean;
  /** Camera-space depth (larger = farther). Only read for threeD items. */
  depth: number;
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * zIndex per item. Non-3D items keep their stack index. Each run of
 * consecutive threeD items is redistributed over the same index slots,
 * farthest first (drawn first), ties in stack order.
 */
export function assignDepthOrder(items: readonly DepthItem[]): number[] {
  const out = items.map(i => i.stackIndex);
  let i = 0;
  while (i < items.length) {
    if (!items[i]!.threeD) { i++; continue; }
    let j = i;
    while (j + 1 < items.length && items[j + 1]!.threeD) j++;
    const run = items.slice(i, j + 1).map((it, k) => ({ it, pos: i + k }));
    const slots = run.map(r => r.it.stackIndex);
    const farthestFirst = [...run].sort((a, b) => finite(b.it.depth) - finite(a.it.depth));
    farthestFirst.forEach((r, k) => { out[r.pos] = slots[k]!; });
    i = j + 1;
  }
  return out;
}
