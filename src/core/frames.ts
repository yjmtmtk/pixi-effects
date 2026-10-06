/** `count` frame numbers spread evenly from 0 to `lastFrame` (inclusive), deduplicated. */
export function pickFrames(lastFrame: number, count: number): number[] {
  const last = Math.max(0, Math.floor(lastFrame));
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = Math.round((last * i) / (n - 1));
    if (out[out.length - 1] !== f) out.push(f);
  }
  return out;
}

export interface SheetLayout {
  cols: number;
  rows: number;
  cellW: number;
  /** Height of the picture part of a cell (the label strip is extra). */
  cellH: number;
  width: number;
  height: number;
  /** Top-left of each cell (picture + label strip), row-major. */
  positions: Array<{ x: number; y: number }>;
}

/** Grid for a contact sheet of `n` frames of size `srcW × srcH`, each cell `cellW` wide with a `labelH` strip under the picture. */
export function sheetLayout(n: number, columns: number, cellW: number, srcW: number, srcH: number, labelH: number): SheetLayout {
  const cols = Math.max(1, Math.min(Math.floor(columns), n));
  const rows = Math.ceil(n / cols);
  const cellH = Math.round((cellW * srcH) / srcW);
  const positions = Array.from({ length: n }, (_, i) => ({ x: (i % cols) * cellW, y: Math.floor(i / cols) * (cellH + labelH) }));
  return { cols, rows, cellW, cellH, width: cols * cellW, height: rows * (cellH + labelH), positions };
}
