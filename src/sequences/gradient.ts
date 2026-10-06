import type { GradientSpec } from '../types';

/** `'#rrggbb'` for numbers; CSS colour strings (hex, rgb(), rgba(), names) pass through. */
export function cssColor(c: string | number): string {
  return typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
}

function normalizedStops(g: GradientSpec): Array<{ offset: number; color: string | number }> {
  const stops = g.stops ?? [];
  if (stops.length < 2) throw new Error('pixi-effects: fillGradient needs at least two colour stops, e.g. stops: [[0, "#000"], [1, "#fff"]]');
  return stops.map(s => (Array.isArray(s) ? { offset: s[0], color: s[1] } : { offset: s.offset, color: s.color }));
}

/**
 * PixiJS `FillGradient` options for a LINEAR `fillGradient` (local space: 0–1 across the shape's own
 * bounds, so it follows the shape's size). `angle` in degrees: 0 = left → right, 90 = top → bottom
 * (default, like CSS `to bottom`); the line passes through the centre and spans corner to corner.
 */
export function gradientOptions(g: GradientSpec): Record<string, unknown> {
  const colorStops = normalizedStops(g);
  const a = ((g.angle ?? 90) * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const h = (Math.abs(dx) + Math.abs(dy)) / 2;            // half-extent so the line reaches the corners
  return {
    type: 'linear',
    start: { x: 0.5 - dx * h, y: 0.5 - dy * h },
    end: { x: 0.5 + dx * h, y: 0.5 + dy * h },
    colorStops, textureSpace: 'local',
  };
}

/** The slice of CanvasRenderingContext2D that `paintRadial` uses (so tests can fake it). */
export interface RadialCtx {
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(offset: number, color: string): void };
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: unknown;
}

/**
 * Paint a RADIAL `fillGradient` onto a square canvas: centre / `innerRadius` / `radius` in 0–1 of the
 * canvas, concentric circles, so the first stop colours the inside and the last stop everything beyond.
 * The canvas is later stretched over the shape's bounds (an ellipse on a non-square shape — what a
 * vignette wants). Done on a canvas because PixiJS's own radial fill lays an opaque-last-colour underlay
 * over the whole shape, which makes a transparent-centre vignette dark everywhere.
 */
export function paintRadial(ctx: RadialCtx, size: number, g: GradientSpec): void {
  const stops = normalizedStops(g);
  const [cx, cy] = g.center ?? [0.5, 0.5];
  const grad = ctx.createRadialGradient(cx * size, cy * size, (g.innerRadius ?? 0) * size, cx * size, cy * size, (g.radius ?? 0.5) * size);
  for (const s of stops) grad.addColorStop(s.offset, cssColor(s.color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}
