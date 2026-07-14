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

/**
 * Resolves a routed keyframe path to a concrete GSAP tween target.
 * `path` is everything after the registered prefix + dot (for
 * `three.cube.rotation.y` under prefix `three`, path = `cube.rotation.y`).
 * Return null to skip the key (the router is expected to have warned).
 */
export type PathRouter = (path: string) => { target: object; prop: string } | null;
export type PathRouters = Record<string, PathRouter>;

export interface RoutedProp {
  target: object;
  prop: string;
  /** Original full key, used to pair from/to sides of a fromTo keyframe. */
  key: string;
  value: unknown;
}

export function splitRouted(
  props: Record<string, unknown>,
  routers: PathRouters | undefined,
): { rest: Record<string, unknown>; routed: RoutedProp[] } {
  if (!routers) return { rest: props, routed: [] };
  const rest: Record<string, unknown> = {};
  const routed: RoutedProp[] = [];
  for (const k of Object.keys(props)) {
    const dot = k.indexOf('.');
    const router = dot > 0 ? routers[k.slice(0, dot)] : undefined;
    if (router) {
      const hit = router(k.slice(dot + 1));
      if (hit) routed.push({ target: hit.target, prop: hit.prop, key: k, value: props[k] });
      // Unresolved keys are dropped — the router already warned.
    } else {
      rest[k] = props[k];
    }
  }
  return { rest, routed };
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
  'rotation',
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
  offset = 0,
  routers?: PathRouters,
): void {
  for (const raw of keyframes ?? []) {
    const kf = normalizeKeyframe(raw, parentDuration);
    const at = offset + kf.at;
    if (kf.kind === 'set') {
      const resolved = normalizeProps(kf.set!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed) timeline.set(r.target, { [r.prop]: r.value }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      if (Object.keys(ownProps).length > 0) timeline.set(target, pixiwrap(ownProps), at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.set(f, props, at);
      }
    } else if (kf.kind === 'to') {
      const resolved = normalizeProps(kf.to!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed)
        timeline.to(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      if (Object.keys(ownProps).length > 0)
        timeline.to(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.to(f, { ...props, duration: kf.duration, ease: kf.ease }, at);
      }
    } else if (kf.kind === 'from') {
      const resolved = normalizeProps(kf.from!, scope, { skipKeys });
      const { rest, routed } = splitRouted(resolved, routers);
      for (const r of routed)
        timeline.from(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
      const { ownProps, filterProps } = partitionProps(rest);
      if (Object.keys(ownProps).length > 0)
        timeline.from(target, { ...pixiwrap(ownProps), duration: kf.duration, ease: kf.ease }, at);
      for (const [name, props] of Object.entries(filterProps)) {
        const f = findFilter(target as FilterTarget, name);
        if (!f) continue;
        timeline.from(f, { ...props, duration: kf.duration, ease: kf.ease }, at);
      }
    } else {
      const fromResolved = normalizeProps(kf.from!, scope, { skipKeys });
      const toResolved = normalizeProps(kf.to!, scope, { skipKeys });
      const fromRouted = splitRouted(fromResolved, routers);
      const toRouted = splitRouted(toResolved, routers);
      // Pair routed from/to entries by their original key.
      const fromByKey = new Map(fromRouted.routed.map(r => [r.key, r]));
      for (const r of toRouted.routed) {
        const f = fromByKey.get(r.key);
        fromByKey.delete(r.key);
        if (f) {
          timeline.fromTo(r.target, { [r.prop]: f.value },
            { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
        } else {
          timeline.to(r.target, { [r.prop]: r.value, duration: kf.duration, ease: kf.ease }, at);
        }
      }
      for (const f of fromByKey.values())
        timeline.from(f.target, { [f.prop]: f.value, duration: kf.duration, ease: kf.ease }, at);
      const fromSplit = partitionProps(fromRouted.rest);
      const toSplit = partitionProps(toRouted.rest);
      const ownKeys = new Set([...Object.keys(fromSplit.ownProps), ...Object.keys(toSplit.ownProps)]);
      if (ownKeys.size > 0) {
        timeline.fromTo(
          target,
          { ...pixiwrap(fromSplit.ownProps) },
          { ...pixiwrap(toSplit.ownProps), duration: kf.duration, ease: kf.ease },
          at,
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
          at,
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
  routers?: PathRouters,
): void {
  if (!initial) return;
  const resolved = normalizeProps(initial, scope, { skipKeys });
  const { rest, routed } = splitRouted(resolved, routers);
  for (const r of routed) gsap.set(r.target, { [r.prop]: r.value });
  const { ownProps, filterProps } = partitionProps(rest);
  if (Object.keys(ownProps).length > 0) gsap.set(target, pixiwrap(ownProps));
  for (const [name, props] of Object.entries(filterProps)) {
    const f = findFilter(target as FilterTarget, name);
    if (!f) continue;
    gsap.set(f, props);
  }
}
