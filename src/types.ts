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

/**
 * "Dip through": A fades out across the first half of the window, B fades in
 * across the second half. The visible color during the dip is whatever sits
 * behind A and B (canvas background, or any persistent layer beneath them).
 */
export interface DipTransition extends TransitionCommon {
  kind: 'dip';
}

export interface ZoomTransition extends TransitionCommon {
  kind: 'zoom';
  /**
   * `'in'` (default): B opens up — starts at `fromScale` and zooms to 1.
   * `'out'`: A closes — zooms from 1 to `fromScale` and fades.
   */
  mode?: 'in' | 'out';
  /** Starting scale of the zoomed sequence. Default 4 (B starts 4x size). */
  fromScale?: number;
}

export interface DissolveTransition extends TransitionCommon {
  kind: 'dissolve';
  /** Pattern frequency. Higher = finer grain. Default 30. */
  scale?: number;
  /** Pattern offset for reproducibly varying the dissolve shape. Default 0. */
  seed?: number;
  /** 0..1 edge softness within each chunk. Default 0.05. */
  smoothing?: number;
}

export type TransitionSpec =
  | CrossfadeTransition
  | WipeTransition
  | IrisTransition
  | SlideTransition
  | DipTransition
  | ZoomTransition
  | DissolveTransition;

// ─── Sequence specs ───────────────────────────────────────────────────────

export interface SequenceCommon {
  name?: string;
  at?: number;
  duration?: number;
  initial?: Props;
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
  /**
   * Override PIXI's auto-computed filter region. By default, filters apply
   * only inside the target's bounding box. Setting this to a parent-relative
   * rectangle lets a filter (e.g. a wipe / iris transition) draw across an
   * area larger than the sprite — useful when the sprite content is small
   * but the visual effect should cover the whole composition.
   */
  filterArea?: { x: number; y: number; width: number; height: number };
  /**
   * Inline mask spec. The mask sequence is built as a hidden sibling and
   * wired via `target.mask` — it shapes which pixels of this sequence are
   * visible. Mask coordinates live in the same space as this sequence
   * (i.e. relative to the same parent composition).
   *
   * The mask is itself a sequence, so it can have its own `initial` and
   * `keyframes` — useful for reveal animations (a circle growing from
   * `radius: 0` to full-size). It defaults to running for this sequence's
   * full lifetime.
   *
   * Any sequence type works as a mask; shapes are the natural choice for
   * geometric reveals.
   */
  mask?: SequenceSpec;
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
  /**
   * Colour space used to interpolate `tint` keyframes. Default `'rgb'`
   * (linear sRGB lerp via PIXI's tint pipeline). Set to `'oklab'` /
   * `'oklch'` for perceptually uniform interpolation — same semantics
   * as on `shape`.
   */
  colorSpace?: 'rgb' | 'oklab' | 'oklch';
}
export interface TextSequenceSpec extends SequenceCommon {
  type: 'text';
  text?: string;
  /** Subset of PIXI v8 TextStyleOptions. String values may be exprs (e.g. fontSize: 'GW * 0.05'). */
  style?: Record<string, PropValue | { color?: PropValue; width?: PropValue }>;
  /**
   * Colour space used to interpolate `fill` keyframes. Default `'rgb'`.
   * Set to `'oklab'` / `'oklch'` for perceptually uniform interpolation
   * — same semantics as on `shape`. The text's fill is re-rasterised on
   * every frame the tween is active.
   */
  colorSpace?: 'rgb' | 'oklab' | 'oklch';
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

// ─── Shape sequence ──────────────────────────────────────────────────────
//
// `type: 'shape'` renders a parametric primitive (rect / circle / ellipse /
// line / polygon / path) via PIXI v8 `Graphics`. Geometry properties
// (width, radius, points, …) accept the usual expression language so they
// can follow the canvas (`width: 'W * 0.5'`) and are resolved once at build.
//
// Style properties (`fillColor`, `fillAlpha`, `strokeColor`, `strokeAlpha`,
// `strokeWidth`) live on the regular `initial` / `keyframes` surface and
// animate via the standard pipeline — every frame the shape redraws itself
// from its current style state, so colour/width tweens "just work".

interface ShapeBase extends SequenceCommon {
  type: 'shape';
  /**
   * Colour space used to interpolate `fillColor` / `strokeColor` keyframes.
   *
   * - `'rgb'` (default): linear RGB tween via `gsap.utils.interpolate`.
   *   Fast, but a red → green ramp passes through muddy brown / olive
   *   greys at the midpoint because intermediate sRGB values are
   *   perceptually unbalanced.
   * - `'oklab'` / `'oklch'`: perceptually uniform colour spaces. Hue and
   *   chroma stay vibrant through the transition. `oklch` interpolates
   *   hue along the shorter angular path, giving smooth rainbow-like
   *   sweeps; `oklab` is straight-line in the chromaticity plane.
   */
  colorSpace?: 'rgb' | 'oklab' | 'oklch';
}

export interface RectShapeSpec extends ShapeBase {
  shape: 'rect';
  width: PropValue;
  height: PropValue;
  /** Rounded corner radius. Default 0 (sharp). */
  cornerRadius?: PropValue;
}

export interface CircleShapeSpec extends ShapeBase {
  shape: 'circle';
  radius: PropValue;
}

export interface EllipseShapeSpec extends ShapeBase {
  shape: 'ellipse';
  radiusX: PropValue;
  radiusY: PropValue;
}

export interface LineShapeSpec extends ShapeBase {
  shape: 'line';
  /** Line endpoints relative to the shape's local origin. */
  from: [PropValue, PropValue];
  to: [PropValue, PropValue];
}

export interface PolygonShapeSpec extends ShapeBase {
  shape: 'polygon';
  /** Vertices in local space. The path is auto-closed. */
  points: Array<[PropValue, PropValue]>;
  /** When true, draw an open polyline instead of a closed polygon. Default false. */
  open?: boolean;
}

export interface PathShapeSpec extends ShapeBase {
  shape: 'path';
  /** SVG path data (`d` attribute). Goes through PIXI's GraphicsContext.svg(). */
  d: string;
}

export type ShapeSequenceSpec =
  | RectShapeSpec
  | CircleShapeSpec
  | EllipseShapeSpec
  | LineShapeSpec
  | PolygonShapeSpec
  | PathShapeSpec;

export type SequenceSpec =
  | VideoSequenceSpec
  | ImageSequenceSpec
  | TextSequenceSpec
  | AudioSequenceSpec
  | CompositionSequenceSpec
  | ShapeSequenceSpec;

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
