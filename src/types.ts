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

export interface ChromaKeyFilterSpec {
  type: 'chromaKey';
  name?: string;
  keyColor?: string | [number, number, number];
  threshold?: number;
  smoothing?: number;
  spill?: number;
}
export interface BlurFilterSpec {
  type: 'blur';
  name?: string;
  strength?: number;
  quality?: number;
  repeatEdgePixels?: boolean;
}
export interface ColorMatrixFilterSpec {
  type: 'colorMatrix';
  name?: string;
  brightness?: number;
  saturate?: number;
  contrast?: number;
  hue?: number;
  alpha?: number;
}

export type FilterSpec = ChromaKeyFilterSpec | BlurFilterSpec | ColorMatrixFilterSpec;

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
