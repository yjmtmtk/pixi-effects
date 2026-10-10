/**
 * `gsap.utils.interpolate('#102030', '#f08060')` without GSAP: a function of 0..1 that gives the start string at 0, the end string at 1,
 * and `rgba(r,g,b,a)` in between (channels rounded to whole numbers, alpha to four decimals, no clamping on an overshoot).
 * Strings it cannot read (hsl, names) go back to `fallback`.
 */

type Rgba = [number, number, number, number];

export function parseCssColor(s: string): Rgba | null {
  const v = s.trim();
  let m = /^#([0-9a-f]{3,4})$/i.exec(v);
  if (m) {
    const h = m[1]!;
    const d = (i: number): number => parseInt(h[i]! + h[i]!, 16);
    return [d(0), d(1), d(2), h.length === 4 ? d(3) / 255 : 1];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  return null;
}

export function rgbInterp(a: string, b: string, fallback: (a: string, b: string) => (p: number) => string): (p: number) => string {
  const ca = parseCssColor(a), cb = parseCssColor(b);
  if (!ca || !cb) return fallback(a, b);
  return (p) => {
    if (p === 0) return a;
    if (p === 1) return b;
    const ch = (i: number): number => Math.round(ca[i]! + (cb[i]! - ca[i]!) * p);
    const al = Math.round((ca[3] + (cb[3] - ca[3]) * p) * 1e4) / 1e4;
    return `rgba(${ch(0)},${ch(1)},${ch(2)},${al})`;
  };
}
