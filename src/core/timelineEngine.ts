import { gsap } from 'gsap';
import { PureTimeline, spacer } from './pure/PureTimeline';
import { pureEase } from './pure/ease';
import { PIXI_INERT, pixiAccessors, plainAccessor } from './pure/props';
import { rgbInterp } from './pure/colorLerp';

/**
 * The one place that creates timelines. `'gsap'` is the default; `'pure'` is the timeline of our own (a spike: see
 * docs/superpowers/specs/2026-10-10-pure-timeline-design.md), chosen with `setTimelineEngine('pure')`, the page URL `?pe-timeline=pure`,
 * or `PE_TIMELINE=pure` in the environment. Both are driven through the same calls (`set / to / from / fromTo / add / time / progress`).
 */

export type TimelineEngine = 'gsap' | 'pure';
export type Timeline = ReturnType<typeof gsap.timeline>;

let chosen: TimelineEngine | null = null;

function detect(): TimelineEngine {
  try { if (typeof location !== 'undefined' && /[?&]pe-timeline=pure\b/.test(location.search)) return 'pure'; } catch { /* no location */ }
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    if (env?.PE_TIMELINE === 'pure') return 'pure';
  } catch { /* no process */ }
  return (globalThis as { __PE_TIMELINE__?: string }).__PE_TIMELINE__ === 'pure' ? 'pure' : 'gsap';
}

export function timelineEngine(): TimelineEngine { return (chosen ??= detect()); }
export function setTimelineEngine(engine: TimelineEngine): void { chosen = engine; }

/** `gsap.timeline({ paused, defaults })`. Without a default ease GSAP's tweens ease with `power1.out`; so do ours. */
export function createTimeline(opts: { paused?: boolean; defaults?: { ease?: string } } = {}): Timeline {
  if (timelineEngine() === 'pure') return new PureTimeline({ paused: opts.paused, defaults: { ease: opts.defaults?.ease ?? 'power1.out' } }) as unknown as Timeline;
  return gsap.timeline(opts);
}

/** Lengthens a timeline to `duration` without writing anything (`timeline.add(gsap.to({}, { duration }))`). */
export function lengthen(timeline: Timeline, duration: number): void {
  if (timeline instanceof PureTimeline) timeline.add(spacer(duration));
  else timeline.add(gsap.to({}, { duration }));
}

/** An ease name to a function of 0..1. */
export function parseEase(name: string): (p: number) => number {
  return timelineEngine() === 'pure' ? pureEase(name) : gsap.parseEase(name) as (p: number) => number;
}

/** `gsap.set(target, vars)` (values written at once; `vars.pixi` is the plugin's shorthands). */
export function setNow(target: object, vars: Record<string, unknown>): void {
  if (timelineEngine() !== 'pure') { gsap.set(target, vars); return; }
  const t = target as Record<string, unknown>;
  for (const key of Object.keys(vars)) {
    if (key === 'pixi') {
      for (const k of Object.keys(vars.pixi as object)) {
        const accs = pixiAccessors(t, k);
        if (!accs) { if (!PIXI_INERT.has(k)) console.warn(`pixi-effects: the pure timeline has no "${k}" shorthand yet; it is ignored`); continue; }
        const raw = (vars.pixi as Record<string, unknown>)[k];
        for (const acc of accs) acc.set(acc.kind === 'color' ? colorNumber(raw) : Number(raw) * acc.unit);
      }
    } else {
      const v = vars[key];
      plainAccessor(t, key).set(typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
    }
  }
}

function colorNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return parseInt(m[1]!, 16);
  const h = /^#([0-9a-f]{3})$/i.exec(s);
  if (h) return parseInt(h[1]!.split('').map(c => c + c).join(''), 16);
  return Number(v);
}

/** `gsap.utils.interpolate(a, b)` for two CSS colour strings. */
export function interpolateColors(a: string, b: string): (p: number) => string {
  const viaGsap = (x: string, y: string): ((p: number) => string) => gsap.utils.interpolate(x, y) as (p: number) => string;
  return timelineEngine() === 'pure' ? rgbInterp(a, b, viaGsap) : viaGsap(a, b);
}

export function isPure(timeline: unknown): timeline is PureTimeline { return timeline instanceof PureTimeline; }
