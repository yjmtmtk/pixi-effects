/** What makes a frame depend on more than the time, in the source of an `update` or a `draw` (the canvas, three and scene3d layers say so at build). */
export const NOT_PURE = /\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(|\bperformance\s*\.\s*now\s*\(|\bnew\s+Date\s*\(/;
