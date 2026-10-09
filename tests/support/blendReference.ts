/** The W3C Compositing and Blending Level 1 blend functions, written from the specification (not from the shaders), for the tests. Channels are 0..1. */
type RGB = [number, number, number];

const sep = (f: (b: number, s: number) => number) => (cb: RGB, cs: RGB): RGB => [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
const multiply = (b: number, s: number) => b * s;
const screen = (b: number, s: number) => b + s - b * s;
const hardLight = (b: number, s: number) => (s <= 0.5 ? multiply(b, 2 * s) : screen(b, 2 * s - 1));
const softLight = (b: number, s: number) => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
};

const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const clipColor = (c: RGB): RGB => {
  const l = lum(c), n = Math.min(...c), x = Math.max(...c);
  let out: RGB = [...c] as RGB;
  if (n < 0) out = out.map(v => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map(v => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
};
const setLum = (c: RGB, l: number): RGB => { const d = l - lum(c); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
const setSat = (c: RGB, s: number): RGB => {
  const mx = Math.max(...c), mn = Math.min(...c);
  return mx > mn ? (c.map(v => ((v - mn) * s) / (mx - mn)) as RGB) : [0, 0, 0];
};

/** The blend function B(cb, cs) of each advanced mode (cb: backdrop colour, cs: source colour; both un-premultiplied). */
export const BLEND: Record<string, (cb: RGB, cs: RGB) => RGB> = {
  overlay: sep((b, s) => hardLight(s, b)),
  'hard-light': sep(hardLight),
  'soft-light': sep(softLight),
  'color-dodge': sep((b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)))),
  'color-burn': sep((b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s))),
  darken: sep((b, s) => Math.min(b, s)),
  lighten: sep((b, s) => Math.max(b, s)),
  difference: sep((b, s) => Math.abs(b - s)),
  exclusion: sep((b, s) => b + s - 2 * b * s),
  'linear-burn': sep((b, s) => Math.max(0, b + s - 1)),
  hue: (cb, cs) => setLum(setSat(cs, sat(cb)), lum(cb)),
  saturation: (cb, cs) => setLum(setSat(cb, sat(cs)), lum(cb)),
  color: (cb, cs) => setLum(cs, lum(cb)),
  luminosity: (cb, cs) => setLum(cb, lum(cs)),
};

/**
 * The colour a source of colour `cs` and alpha `as` makes over a backdrop of colour `cb` and alpha `ab`, as 0..255 channels, in the
 * source-over compositing with a blend function (W3C: Co = (1 - ab) * as * Cs + (1 - as) * ab * Cb + as * ab * B(Cb, Cs), premultiplied;
 * the result here is un-premultiplied by the result alpha).
 */
export function blendPixel(mode: string, cb: RGB, ab: number, cs: RGB, as: number): [number, number, number, number] {
  const B = BLEND[mode]!(cb, cs);
  const ar = as + ab * (1 - as);
  const out = [0, 1, 2].map(i => ((1 - ab) * as * cs[i]! + (1 - as) * ab * cb[i]! + as * ab * B[i]!) / (ar || 1));
  return [out[0]! * 255, out[1]! * 255, out[2]! * 255, ar * 255];
}

export const hexToRgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
