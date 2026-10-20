import type { Polyline } from './trimPath';

/** One sub-path of a morph: `n` points at the start (`a`) and at the end (`b`), flat `[x, y, …]`. */
export interface MorphPair { a: number[]; b: number[]; closed: boolean }

/** `n` points spread evenly by length along `line` (a closed one goes round without repeating its first point). */
export function resample(line: Polyline, n: number): number[] {
  const p = line.closed ? [...line.pts, line.pts[0]!, line.pts[1]!] : line.pts;
  const cum = [0];
  for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!));
  const total = cum[cum.length - 1]!;
  const out: number[] = [];
  if (!(total > 0)) { for (let i = 0; i < n; i++) out.push(p[0]!, p[1]!); return out; }
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const s = line.closed ? (i * total) / n : n === 1 ? 0 : (i * total) / (n - 1);
    while (seg < cum.length - 1 && cum[seg]! < s) seg++;
    const len = cum[seg]! - cum[seg - 1]!;
    const t = len > 0 ? (s - cum[seg - 1]!) / len : 0;
    const k = seg * 2;
    out.push(p[k - 2]! + (p[k]! - p[k - 2]!) * t, p[k - 1]! + (p[k + 1]! - p[k - 1]!) * t);
  }
  return out;
}

const centroid = (pts: number[]): [number, number] => {
  let x = 0, y = 0;
  for (let i = 0; i < pts.length; i += 2) { x += pts[i]!; y += pts[i + 1]!; }
  const n = pts.length / 2;
  return [x / n, y / n];
};

/** Re-order the points of the closed outline `b` (its start point and direction) so that it lies closest to `a`: no twisting. */
function align(a: number[], b: number[]): number[] {
  const n = a.length / 2;
  let best = b, bestCost = Infinity;
  for (const reversed of [false, true]) {
    for (let k = 0; k < n; k++) {
      let cost = 0;
      for (let i = 0; i < n && cost < bestCost; i++) {
        const j = reversed ? (((k - i) % n) + n) % n : (k + i) % n;
        cost += (a[2 * i]! - b[2 * j]!) ** 2 + (a[2 * i + 1]! - b[2 * j + 1]!) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          const j = reversed ? (((k - i) % n) + n) % n : (k + i) % n;
          out.push(b[2 * j]!, b[2 * j + 1]!);
        }
        best = out;
      }
    }
  }
  return best;
}

/**
 * Prepare a morph between two outlines: when a pair of sub-paths has the same number of corners they are paired corner to corner (resampling would round the
 * corners half way when the edges are not in proportion); otherwise both are resampled to `n` points per sub-path, closed outlines are rotated /
 * reversed so they do not twist, and sub-paths are paired by order. A sub-path with no partner grows out of (or shrinks
 * into) its own centre. Empty on either side: nothing to morph.
 */
/** A closed outline written with a line back to its start before Z has its start twice: it has the corners it has, not one more (a quad stays a quad for the corner-to-corner pairing). */
function withoutClosingPoint(p: Polyline): Polyline {
  const n = p.pts.length;
  if (p.closed && n >= 4 && p.pts[0] === p.pts[n - 2] && p.pts[1] === p.pts[n - 1]) return { ...p, pts: p.pts.slice(0, n - 2) };
  return p;
}

export function buildMorph(from: Polyline[], to: Polyline[], n = 128): MorphPair[] {
  from = from.map(withoutClosingPoint); to = to.map(withoutClosingPoint);
  if (from.length === 0 || to.length === 0) return [];
  const pairs: MorphPair[] = [];
  const count = Math.max(from.length, to.length);
  for (let i = 0; i < count; i++) {
    const fa = from[i], fb = to[i];
    const closed = (fa?.closed ?? fb!.closed) && (fb?.closed ?? fa!.closed);
    if (fa && fb && fa.closed === fb.closed && fa.pts.length === fb.pts.length && fa.pts.length >= 6) {        // the same number of corners: corner to corner, so a quad stays a quad half way
      const a = [...fa.pts];
      pairs.push({ a, b: closed ? align(a, [...fb.pts]) : [...fb.pts], closed });
      continue;
    }
    const a = fa ? resample({ pts: fa.pts, closed }, n) : collapsed(resample({ pts: fb!.pts, closed }, n));
    let b = fb ? resample({ pts: fb.pts, closed }, n) : collapsed(a);
    if (closed && fa && fb) b = align(a, b);
    pairs.push({ a, b, closed });
  }
  return pairs;
}

function collapsed(pts: number[]): number[] {
  const [cx, cy] = centroid(pts);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(cx, cy);
  return out;
}

/** The outlines `t` of the way (0–1) from the first to the second. */
export function morphAt(pairs: MorphPair[], t: number): Polyline[] {
  const u = Math.min(Math.max(t, 0), 1);
  return pairs.map(({ a, b, closed }) => ({ pts: a.map((v, i) => v + (b[i]! - v) * u), closed }));
}
