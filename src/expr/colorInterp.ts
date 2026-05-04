/**
 * Perceptually uniform colour interpolation in OKLab / OKLCH.
 *
 * These spaces (Björn Ottosson, 2020) keep saturation and lightness
 * intuitive across a tween — a red → green ramp doesn't pass through
 * the muddy olive / brown that linear sRGB interpolation produces.
 *
 *   - `oklab`  : straight line in the (a, b) chromaticity plane.
 *   - `oklch`  : (L, C, h) with hue along the shorter angular path —
 *                gives smooth rainbow-style sweeps.
 *
 * Inputs accept any of the formats colours appear in our DSL:
 *   - hex string (`'#ff3366'`, `'#f36'`)
 *   - 0xRRGGBB number
 *   - rgb()/rgba() string
 * Outputs are always `'rgba(r,g,b,a)'` strings — that's what PixiJS's
 * Color() parser handles natively.
 */

export type ColorSpace = 'rgb' | 'oklab' | 'oklch';

export type ColorInput = string | number;

/** Build an interpolator function `t ∈ [0, 1] → 'rgba(...)' string`. */
export function buildColorInterp(
  from: ColorInput,
  to: ColorInput,
  space: 'oklab' | 'oklch',
): (t: number) => string {
  const fromRGBA = parseToRGBA(from);
  const toRGBA   = parseToRGBA(to);
  const fromOk   = rgbToOklab(fromRGBA);
  const toOk     = rgbToOklab(toRGBA);

  if (space === 'oklab') {
    return (t: number): string => {
      const L = lerp(fromOk.L, toOk.L, t);
      const a = lerp(fromOk.a, toOk.a, t);
      const b = lerp(fromOk.b, toOk.b, t);
      const alpha = lerp(fromRGBA.a, toRGBA.a, t);
      return rgbaString(oklabToRgb({ L, a, b }), alpha);
    };
  }

  // OKLCH: convert to polar and interpolate hue along the shorter arc.
  const fromLCH = oklabToOklch(fromOk);
  const toLCH   = oklabToOklch(toOk);
  // If either endpoint is achromatic (C ≈ 0), its hue is undefined; carry
  // the other endpoint's hue across so the ramp doesn't sweep through
  // arbitrary colours on the way to / from grey.
  if (fromLCH.C < 1e-4) fromLCH.h = toLCH.h;
  if (toLCH.C < 1e-4)   toLCH.h   = fromLCH.h;
  const hueDelta = shortestHueDelta(fromLCH.h, toLCH.h);

  return (t: number): string => {
    const L = lerp(fromLCH.L, toLCH.L, t);
    const C = lerp(fromLCH.C, toLCH.C, t);
    const h = fromLCH.h + hueDelta * t;
    const alpha = lerp(fromRGBA.a, toRGBA.a, t);
    const ab = oklchToOklab({ L, C, h });
    return rgbaString(oklabToRgb(ab), alpha);
  };
}

// ─── Parsers / formatters ────────────────────────────────────────────────

interface RGBA { r: number; g: number; b: number; a: number; } // 0..1 each

function parseToRGBA(input: ColorInput): RGBA {
  if (typeof input === 'number') {
    return { r: ((input >> 16) & 0xff) / 255, g: ((input >> 8) & 0xff) / 255, b: (input & 0xff) / 255, a: 1 };
  }
  const s = input.trim();
  if (s.startsWith('#')) return parseHex(s);
  if (s.startsWith('rgb')) return parseRgbFunc(s);
  // Unknown format — fall back to opaque black rather than throwing, since
  // styling is best-effort and a single bad colour shouldn't blow the timeline.
  return { r: 0, g: 0, b: 0, a: 1 };
}

function parseHex(s: string): RGBA {
  const hex = s.slice(1);
  let r = 0, g = 0, b = 0, a = 1;
  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0]! + hex[0]!, 16) / 255;
    g = parseInt(hex[1]! + hex[1]!, 16) / 255;
    b = parseInt(hex[2]! + hex[2]!, 16) / 255;
    if (hex.length === 4) a = parseInt(hex[3]! + hex[3]!, 16) / 255;
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
  }
  return { r, g, b, a };
}

function parseRgbFunc(s: string): RGBA {
  // Accept `rgb(r, g, b)` and `rgba(r, g, b, a)` — channels are 0..255 ints.
  const inner = s.replace(/^rgba?\(/, '').replace(/\)$/, '');
  const parts = inner.split(/[,\s/]+/).filter(Boolean).map(parseFloat);
  return {
    r: (parts[0] ?? 0) / 255,
    g: (parts[1] ?? 0) / 255,
    b: (parts[2] ?? 0) / 255,
    a: parts.length > 3 ? (parts[3] ?? 1) : 1,
  };
}

function rgbaString(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── sRGB ↔ linear ↔ OKLab ─────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface OkLab { L: number; a: number; b: number; }

function rgbToOklab(rgba: RGBA): OkLab {
  const r = srgbToLinear(rgba.r);
  const g = srgbToLinear(rgba.g);
  const b = srgbToLinear(rgba.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabToRgb(lab: OkLab): { r: number; g: number; b: number } {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}

interface OkLCh { L: number; C: number; h: number; } // h in radians

function oklabToOklch(lab: OkLab): OkLCh {
  return { L: lab.L, C: Math.hypot(lab.a, lab.b), h: Math.atan2(lab.b, lab.a) };
}

function oklchToOklab(lch: OkLCh): OkLab {
  return { L: lch.L, a: lch.C * Math.cos(lch.h), b: lch.C * Math.sin(lch.h) };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function shortestHueDelta(from: number, to: number): number {
  // Both inputs are in [-π, π] from atan2. Pick the path that crosses the
  // smaller arc — never more than ±π.
  const TWO_PI = Math.PI * 2;
  let d = (to - from) % TWO_PI;
  if (d >  Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}
