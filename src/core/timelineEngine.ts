import { Color } from 'pixi.js';
import { PureTimeline, spacer } from './pure/PureTimeline';
import { pureEase } from './pure/ease';
import { PIXI_INERT, parseColor, pixiAccessors, plainAccessor } from './pure/props';
import { rgbInterp, type Rgba } from './pure/colorLerp';

/**
 * The timeline of the library and the few things around it: a timeline is a pure function of time (a value at a time is computed from the
 * script and the time alone, never from the way the playhead came), see docs/superpowers/specs/2026-10-10-pure-timeline-design.md.
 */

export type Timeline = PureTimeline;

/** A timeline for the tweens of a layer, a composition or a movie. Without a default ease a tween eases with `power1.out`. */
export function createTimeline(opts: { paused?: boolean; defaults?: { ease?: string } } = {}): Timeline {
  return new PureTimeline({ paused: opts.paused, defaults: { ease: opts.defaults?.ease ?? 'power1.out' } });
}

/** Lengthens a timeline to `duration` without writing anything. */
export function lengthen(timeline: Timeline, duration: number): void {
  timeline.add(spacer(duration));
}

/** An ease name to a function of 0..1 (a name nobody knows runs as `power1.out`; `checkEase` says so). */
export function parseEase(name: string): (p: number) => number {
  return pureEase(name);
}

/** Writes values at once: plain properties, and under `pixi` the shorthands (`scale`, `anchor`, `rotation` in degrees, `tint`, `autoAlpha` ...). */
export function setNow(target: object, vars: Record<string, unknown>): void {
  const t = target as Record<string, unknown>;
  for (const key of Object.keys(vars)) {
    if (key === 'pixi') {
      for (const k of Object.keys(vars.pixi as object)) {
        const accs = pixiAccessors(t, k);
        if (!accs) { if (!PIXI_INERT.has(k)) console.warn(`pixi-effects: "${k}" is not a property a keyframe or initial can set; it is ignored`); continue; }
        const raw = (vars.pixi as Record<string, unknown>)[k];
        for (const acc of accs) {
          const n = acc.kind === 'color' ? colorNumber(raw) : Number(raw) * acc.unit;
          if (!Number.isNaN(n)) acc.set(n);
        }
      }
    } else {
      const v = vars[key];
      plainAccessor(t, key).set(typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
    }
  }
}

function colorNumber(v: unknown): number {
  const c = parseColor(v);
  if (c === null) { console.warn(`pixi-effects: cannot read the colour ${JSON.stringify(v)} (use #rgb, #rrggbb, rgb(...) or a number); it is left as it was`); return NaN; }
  return c;
}

/** Any other CSS colour (names, hsl, oklch ...) as red, green, blue (0..255) and alpha, through Pixi's own parser. */
function viaPixi(s: string): Rgba | null {
  try {
    const [r, g, b, a] = new Color(s).toArray();
    return [Math.round(r! * 255), Math.round(g! * 255), Math.round(b! * 255), a!];
  } catch { return null; }
}

/** A function of 0..1 between two CSS colour strings: the start string at 0, the end string at 1, `rgba(r,g,b,a)` between. */
export function interpolateColors(a: string, b: string): (p: number) => string {
  return rgbInterp(a, b, viaPixi);
}
