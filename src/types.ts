/**
 * pixi-effects public DSL types.
 *
 * The composition spec users pass to `Movie.init({ composition })` is
 * shaped by `CompositionSpec`. Every `SequenceSpec` is a discriminated
 * union over `type`, so editor autocomplete narrows correctly.
 */

/** A string is treated as an arithmetic expression evaluated against the scope (see src/expr/Parser.ts). */
export type Expr = string;

/** Any prop value: a number, an Expr string, or any string passed through verbatim (e.g. color hex, font names). */
export type PropValue = number | string;

/** Generic prop bag (key → value). */
export type Props = Record<string, PropValue>;

/** A single keyframe entry. Either `set`, `to`, `from`, or `from`+`to` is meaningful per kind. */
export interface Keyframe {
  at?: number;
  duration?: number;
  ease?: string;
  set?: Props;
  to?: Props;
  from?: Props;
}

export interface AssetSpec {
  name: string;
  src: string;
}

// ─── Filter specs ─────────────────────────────────────────────────────────

/**
 * Escape hatch for arbitrary PIXI filters (e.g. anything from `pixi-filters`,
 * a custom user-built `Filter` subclass, or a community filter package).
 *
 * The instance is used as-is; animation paths (`filters.<name>.<prop>`) work
 * as long as the filter has a writable property at that path.
 *
 * Example:
 * ```ts
 * import { GlowFilter } from 'pixi-filters';
 *
 * filters: [
 *   { type: 'custom', name: 'glow', filter: new GlowFilter({ outerStrength: 2 }) },
 * ],
 * keyframes: [
 *   { at: 1, to: { 'filters.glow.outerStrength': 5 }, duration: 0.5 },
 * ],
 * ```
 */
export interface CustomFilterSpec {
  type: 'custom';
  name?: string;
  /** A PIXI `Filter` instance. Imported here as `unknown` to avoid a hard `pixi.js` type dep on consumers reading this file purely as types. */
  filter: unknown;
}

export interface ChromaKeyFilterSpec {
  type: 'chromaKey';
  name?: string;
  keyColor?: string | [number, number, number];
  threshold?: number;
  smoothing?: number;
  spill?: number;
}

export type FilterSpec = ChromaKeyFilterSpec | CustomFilterSpec;

// ─── Transition specs ────────────────────────────────────────────────────────

export interface TransitionCommon {
  /** Sibling sequence's `name` — the outgoing scene. */
  from: string;
  /** Sibling sequence's `name` — the incoming scene. Must be declared after `from` in the parent's `sequences[]`. */
  to: string;
  /** Start time (parent-relative seconds). Same `at` semantics as Keyframe. */
  at: number;
  /** Length of the transition in seconds. Must be > 0. */
  duration: number;
  /** GSAP easing name. Default `'none'` (linear). */
  ease?: string;
}

export interface CrossfadeTransition extends TransitionCommon {
  kind: 'crossfade';
}

export interface WipeTransition extends TransitionCommon {
  kind: 'wipe';
  direction: 'left' | 'right' | 'up' | 'down';
  /** 0..1 edge softness. Default 0.02. */
  smoothing?: number;
}

export interface IrisTransition extends TransitionCommon {
  kind: 'iris';
  /** `'in'` (default) = B opens up from a point. `'out'` = A closes down to a point. */
  mode?: 'in' | 'out';
  smoothing?: number;
}

export interface SlideTransition extends TransitionCommon {
  kind: 'slide';
  /** Direction of motion: `'left'` = both sequences slide leftward (B enters from the right). */
  direction: 'left' | 'right' | 'up' | 'down';
}

export type TransitionSpec =
  | CrossfadeTransition
  | WipeTransition
  | IrisTransition
  | SlideTransition;

// ─── Sequence specs ───────────────────────────────────────────────────────

export interface SequenceCommon {
  name?: string;
  at?: number;
  duration?: number;
  initial?: Props;
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
}

export interface VideoSequenceSpec extends SequenceCommon {
  type: 'video';
  asset: string;
  loop?: boolean;
  audio?: boolean;
  volume?: number;
}
export interface ImageSequenceSpec extends SequenceCommon {
  type: 'image';
  asset: string;
}
export interface TextSequenceSpec extends SequenceCommon {
  type: 'text';
  text?: string;
  /** Subset of PIXI v8 TextStyleOptions. String values may be exprs (e.g. fontSize: 'GW * 0.05'). */
  style?: Record<string, PropValue | { color?: PropValue; width?: PropValue }>;
}
export interface AudioSequenceSpec extends SequenceCommon {
  type: 'audio';
  asset: string;
  loop?: boolean;
  volume?: number;
}
export interface CompositionSequenceSpec extends SequenceCommon {
  type: 'composition';
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
}
export type SequenceSpec =
  | VideoSequenceSpec
  | ImageSequenceSpec
  | TextSequenceSpec
  | AudioSequenceSpec
  | CompositionSequenceSpec;

/** Top-level composition (root node) — same as `CompositionSequenceSpec` minus the discriminant. */
export interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
}

// ─── Internal shape types (used by sequences and core) ────────────────────

/** Resolved parent / root composition shape used for scope and sizing. */
export interface CompositionShape {
  width: number;
  height: number;
  duration: number;
}

/** Audio descriptor pushed to the mixdown queue by AudioSequence/VideoSequence. */
export interface AudioDescriptor {
  buffer: AudioBuffer;
  loop: boolean;
  start: number;
  end: number;
  initialVolume: number;
  volumeKeyframes: { time: number; value: number }[];
}
