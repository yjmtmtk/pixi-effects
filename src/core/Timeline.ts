import { gsap } from 'gsap';
import { normalizeProps } from '../expr/normalizeProps';
import type { Keyframe } from '../types';
import type { NamedFilter } from '../filters';

export type Kind = 'set' | 'to' | 'from' | 'fromTo';

export interface NormalizedKeyframe {
  at: number;
  duration: number;
  ease: string;
  kind: Kind;
  set?: Record<string, unknown>;
  to?: Record<string, unknown>;
  from?: Record<string, unknown>;
}

export function resolveAt(at: number | undefined | null, duration: number): number {
  if (at === undefined || at === null) return 0;
  return at < 0 ? duration + at : at;
}

export function normalizeKeyframe(kf: Keyframe, parentDuration: number): NormalizedKeyframe {
  const at = resolveAt(kf.at, parentDuration);
  const duration = kf.duration ?? 0;
  const ease = kf.ease ?? 'none';
  const hasSet = !!kf.set;
  const hasFrom = !!kf.from;
  const hasTo = !!kf.to;
  let kind: Kind;
  if (hasSet) kind = 'set';
  else if (hasFrom && hasTo) kind = 'fromTo';
  else if (hasFrom) kind = 'from';
  else if (hasTo) kind = 'to';
  else kind = 'to';
  return { at, duration, ease, kind, set: kf.set, from: kf.from, to: kf.to };
}

export interface Partitioned {
  ownProps: Record<string, unknown>;
  filterProps: Record<string, Record<string, unknown>>;
}

export function partitionProps(props: Record<string, unknown>): Partitioned {
  const ownProps: Record<string, unknown> = {};
  const filterProps: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(props)) {
    const m = k.match(/^filters\.([^.]+)\.(.+)$/);
    if (m) {
      const [, name, sub] = m as unknown as [string, string, string];
      (filterProps[name] ??= {})[sub] = props[k];
    } else {
      ownProps[k] = props[k];
    }
  }
  return { ownProps, filterProps };
}

interface FilterTarget { filters?: NamedFilter[] | null }

function findFilter(target: FilterTarget, name: string): NamedFilter | null {
  if (!target?.filters) return null;
  for (const f of target.filters) {
    if (f?._name === name) return f;
  }
  return null;
}

const PIXI_SHORTHANDS = new Set([
  'scale', 'scaleX', 'scaleY',
  'anchor', 'anchorX', 'anchorY',
  'pivot', 'pivotX', 'pivotY',
  'skew', 'skewX', 'skewY',
  'position', 'positionX', 'positionY',
  'tilePosition', 'tilePositionX', 'tilePositionY',
  'tileScale', 'tileScaleX', 'tileScaleY',
  'tint',
  'colorize', 'colorizeAmount',
  'colorMatrixFilter',
  'blur', 'blurX', 'blurY', 'blurPadding',
  'autoAlpha',
  'lineColor', 'lineAlpha', 'fillColor', 'fillAlpha',
]);

function pixiwrap(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pixi: Record<string, unknown> = {};
  let usedPixi = false;
  for (const [k, v] of Object.entries(props)) {
    if (PIXI_SHORTHANDS.has(k)) { pixi[k] = v; usedPixi = true; }
    else { out[k] = v; }
  }
  if (usedPixi) out.pixi = pixi;
  return out;
}

type Timeline = ReturnType<typeof gsap.timeline>;

export function applyKeyframes(
  timeline: Timeline,
  target: object,
  keyframes: Keyframe[] | undefined,
  parentDuration: number,
  scope: Record<string, number>,
  skipKeys: string[] = [],
): void {
  for (const raw of keyframes ?? []) {
    const kf = normalizeKeyframe(raw, parentDuration);
    if (kf.kind === 'set') {
      const resolved = normalizeProps(kf.set!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0) timeline.set(target, pixiwrap(ownProps), kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.set(f, props, kf.at);
      }
    } else if (kf.kind === 'to') {
      const resolved = normalizeProps(kf.to!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0)
        timeline.to(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.to(f, { ...props, duration: kf.duration, ease: kf.ease }, kf.at);
      }
    } else if (kf.kind === 'from') {
      const resolved = normalizeProps(kf.from!, scope, { skipKeys });
      const { ownProps, filterProps } = partitionProps(resolved);
      if (Object.keys(ownProps).length > 0)
        timeline.from(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, kf.at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.from(f, { ...props, duration: kf.duration, ease: kf.ease }, kf.at);
      }
    } else {
      const fromResolved = normalizeProps(kf.from!, scope, { skipKeys });
      const toResolved = normalizeProps(kf.to!, scope, { skipKeys });
      const fromSplit = partitionProps(fromResolved);
      const toSplit = partitionProps(toResolved);
      const ownKeys = new Set([...Object.keys(fromSplit.ownProps), ...Object.keys(toSplit.ownProps)]);
      if (ownKeys.size > 0) {
        timeline.fromTo(
          target,
          { ...pixiwrap(fromSplit.ownProps) },
          { ...pixiwrap(toSplit.ownProps), duration: kf.duration, ease: kf.ease },
          kf.at,
        );
      }
      const filterNames = new Set([
        ...Object.keys(fromSplit.filterProps),
        ...Object.keys(toSplit.filterProps),
      ]);
      for (const name of filterNames) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.fromTo(
          f,
          { ...(fromSplit.filterProps[name] ?? {}) },
          { ...(toSplit.filterProps[name] ?? {}), duration: kf.duration, ease: kf.ease },
          kf.at,
        );
      }
    }
  }
}

export function applyInitial(
  target: object,
  initial: Record<string, unknown> | undefined,
  scope: Record<string, number>,
  skipKeys: string[] = [],
): void {
  if (!initial) return;
  const resolved = normalizeProps(initial, scope, { skipKeys });
  const { ownProps, filterProps } = partitionProps(resolved);
  if (Object.keys(ownProps).length > 0) gsap.set(target, pixiwrap(ownProps));
  for (const [name, props] of Object.entries(filterProps)) {
    const f = findFilter(target as FilterTarget, name);
    if (!f) continue;
    gsap.set(f, props);
  }
}
