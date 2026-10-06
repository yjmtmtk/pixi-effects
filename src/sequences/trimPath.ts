import { GraphicsPath } from 'pixi.js';

/** One sub-path as flat `[x0, y0, x1, y1, …]`; `closed` adds a segment from the last point back to the first. */
export interface Polyline { pts: number[]; closed: boolean }

const CURVE_STEPS = 24;      // samples per quarter turn of a rounded corner
const ELLIPSE_STEPS = 128;

/** An SVG `d` as polylines (curves sampled by Pixi's own flattening, so the trim follows what is drawn). */
export function flattenSvgPath(d: string): Polyline[] {
  const prims = new GraphicsPath(d).shapePath.shapePrimitives;
  const out: Polyline[] = [];
  for (const { shape } of prims) {
    const poly = shape as { points?: number[]; closePath?: boolean };
    if (poly.points && poly.points.length >= 4) out.push({ pts: poly.points.slice(), closed: poly.closePath === true });
  }
  return out;
}

/** The outline of a (rounded) rectangle: starts at the top edge's left end (after the corner) and goes clockwise. */
export function rectOutline(x: number, y: number, w: number, h: number, radius: number): Polyline {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  if (r === 0) return { pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true };
  const pts: number[] = [];
  const corner = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const a = from + (i / CURVE_STEPS) * (Math.PI / 2);
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);        // top-right, from 12 o'clock to 3
  corner(x + w - r, y + h - r, 0);               // bottom-right
  corner(x + r, y + h - r, Math.PI / 2);         // bottom-left
  corner(x + r, y + r, Math.PI);                 // top-left, ends at the top edge's left end
  // the walk began at the top edge's right end; start it at the left end instead (the last point), same direction
  const startAt = pts.length - 2;                // the top-left corner's last point = (x + r, y)
  const rotated = pts.slice(startAt).concat(pts.slice(0, startAt));
  return { pts: rotated, closed: true };
}

/** The outline of an ellipse: starts at 12 o'clock and goes clockwise. */
export function ellipseOutline(cx: number, cy: number, rx: number, ry: number): Polyline {
  const pts: number[] = [];
  for (let i = 0; i < ELLIPSE_STEPS; i++) {
    const a = -Math.PI / 2 + (i / ELLIPSE_STEPS) * Math.PI * 2;
    pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  return { pts, closed: true };
}

/**
 * The part of the outline between `start` and `end` (fractions 0–1 of the TOTAL length of all the sub-paths, in order).
 * Returns open polylines, except a closed sub-path that is kept whole, which stays closed (so its join is drawn).
 */
export function trimPolylines(lines: Polyline[], start: number, end: number): Polyline[] {
  const s = Math.max(0, Math.min(1, start)), e = Math.max(0, Math.min(1, end));
  if (!(e > s)) return [];
  const lengths = lines.map(polylineLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  const from = s * total, to = e * total;
  const out: Polyline[] = [];
  let offset = 0;
  lines.forEach((line, i) => {
    const len = lengths[i]!;
    const a = Math.max(from - offset, 0), b = Math.min(to - offset, len);
    offset += len;
    if (!(b > a) || len === 0) return;
    if (line.closed && a <= 0 && b >= len) { out.push({ pts: line.pts.slice(), closed: true }); return; }
    out.push({ pts: slice(line, a, b), closed: false });
  });
  return out;
}

function points(line: Polyline): number[] {
  return line.closed ? [...line.pts, line.pts[0]!, line.pts[1]!] : line.pts;
}

function polylineLength(line: Polyline): number {
  const p = points(line);
  let len = 0;
  for (let i = 2; i < p.length; i += 2) len += Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
  return len;
}

/** The points of `line` between the distances `a` and `b` along it. */
function slice(line: Polyline, a: number, b: number): number[] {
  const p = points(line);
  const out: number[] = [];
  let at = 0;
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2]!, y0 = p[i - 1]!, x1 = p[i]!, y1 = p[i + 1]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const segEnd = at + seg;
    if (segEnd > a && at < b && seg > 0) {
      const t0 = Math.max(a - at, 0) / seg, t1 = Math.min(b - at, seg) / seg;
      if (out.length === 0) out.push(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
      out.push(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    }
    at = segEnd;
    if (at >= b) break;
  }
  return out;
}
