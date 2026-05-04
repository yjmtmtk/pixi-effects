import type { ImageSequenceSpec, Props } from '../types';

/**
 * Ken Burns preset for a single image. Returns an `ImageSequenceSpec` ready
 * to drop into a composition's `sequences[]`.
 *
 * Four motion modes:
 *   - `still`    : just sit at the canvas centre, fitted but unanimated.
 *   - `scale`    : zoom in or out around an arbitrary 9-point pivot.
 *   - `rotation` : gentle rotation while keeping the image filling the
 *                  canvas (the scale is over-set so even at the steepest
 *                  rotation the bounding box still covers).
 *   - `position` : pan the image between two points within its over-scaled
 *                  bounds (corner-to-corner by default).
 *
 * The image fits the canvas by `cover` (default) or `contain` — both
 * computed at runtime from the texture's intrinsic size, so you don't pass
 * `imageWidth` / `imageHeight`. Position keyframes assume the image is
 * anchored at its centre (anchor 0.5/0.5).
 *
 * Note: this preset emits no fade keyframes; pair it with `crossfade` /
 * `dip` / etc. transitions to chain images.
 */
export type KenBurnsOptions =
  & KenBurnsBase
  & (
    | { motion: 'still' }
    | KenBurnsScale
    | KenBurnsRotation
    | KenBurnsPosition
  );

interface KenBurnsBase {
  /** Image asset name (registered via `Movie.init({ assets })`). */
  asset: string;
  /** Optional sequence name for transitions / addressing. */
  name?: string;
  /** Start time in seconds (parent-relative). */
  at?: number;
  /** Length of the animation in seconds. Required. */
  duration: number;
  /** How the image fills the canvas. Default `'cover'`. */
  fit?: 'cover' | 'contain';
  /** GSAP easing name. Default `'sine.inOut'`. */
  ease?: string;
}

interface KenBurnsScale {
  motion: 'scale';
  /**
   * Pivot point inside the image, in [0..1] coords. The pivot stays pinned
   * to the canvas while the rest of the image zooms around it. Default
   * `[0.5, 0.5]` (centre). The original Yajima-Motion convention uses the
   * 9-point grid `0.25 / 0.5 / 0.75`.
   */
  origin?: [number, number];
  /** Zoom factor relative to the fitted base. Default 1.15. */
  zoom?: number;
  /** `'in'`: 1 → zoom (default). `'out'`: zoom → 1. */
  direction?: 'in' | 'out';
}

interface KenBurnsRotation {
  motion: 'rotation';
  /** Total rotation in degrees. Default 8. Capped at 30. */
  angle?: number;
  /** `'cw'`: 0 → +angle (default). `'ccw'`: 0 → -angle. Either way it pivots through 0. */
  direction?: 'cw' | 'ccw' | 'through';
}

interface KenBurnsPosition {
  motion: 'position';
  /**
   * Pan start/end in [0..1] of the over-scaled bounds. `[0, 0]` = look at
   * top-left, `[1, 1]` = look at bottom-right. Defaults to diagonal
   * `[0.25, 0.25]` → `[0.75, 0.75]` (matches the Yajima-Motion preset).
   */
  from?: [number, number];
  to?: [number, number];
  /** Over-scale factor. Must be > 1 for any pan to be visible. Default 1.15. */
  zoom?: number;
}

export function kenBurns(opts: KenBurnsOptions): ImageSequenceSpec {
  const {
    asset, name, at, duration,
    fit = 'cover',
    ease = 'sine.inOut',
  } = opts;
  const baseScale = fit;  // expression: 'cover' | 'contain' (scope variables)
  // Keyframe `at` is interpreted PARENT-relative by the runtime (the same
  // convention transitions use). So every keyframe time we emit must be
  // offset by the sequence's own `at` to land within its lifespan.
  const baseAt = at ?? 0;

  let initial: Props;
  let keyframes: ImageSequenceSpec['keyframes'];

  if (opts.motion === 'still') {
    initial = {
      x: 'W/2', y: 'H/2',
      anchorX: 0.5, anchorY: 0.5,
      scale: baseScale,
    };
    keyframes = [];
  } else if (opts.motion === 'scale') {
    const origin = opts.origin ?? [0.5, 0.5];
    const zoom = opts.zoom ?? 1.15;
    const direction = opts.direction ?? 'in';
    const fromZ = direction === 'in' ? 1 : zoom;
    const toZ   = direction === 'in' ? zoom : 1;

    // Pivot at the chosen image-relative origin. The pivot point stays
    // pinned at world (x, y); everything else zooms around it.
    const pivotXExpr = `w * ${origin[0]}`;
    const pivotYExpr = `h * ${origin[1]}`;
    // x positions the pivot so the IMAGE CENTRE lands at the canvas centre
    // at the initial scale. (As scale animates, the centre drifts away
    // from the pivot — that's the focal-point behaviour.)
    const initialScale = `${baseScale} * ${fromZ}`;
    const xExpr = `W/2 - (${baseScale}) * ${fromZ} * w * ${0.5 - origin[0]}`;
    const yExpr = `H/2 - (${baseScale}) * ${fromZ} * h * ${0.5 - origin[1]}`;
    initial = {
      x: xExpr, y: yExpr,
      pivotX: pivotXExpr, pivotY: pivotYExpr,
      scale: initialScale,
    };
    keyframes = [
      { at: baseAt, to: { scale: `${baseScale} * ${toZ}` }, duration, ease },
    ];
  } else if (opts.motion === 'rotation') {
    const angle = clamp(opts.angle ?? 8, 0, 30);
    const direction = opts.direction ?? 'cw';
    const startAngle = direction === 'cw' ? 0       : direction === 'ccw' ? 0 : -angle / 2;
    const endAngle   = direction === 'cw' ? +angle  : direction === 'ccw' ? -angle : +angle / 2;

    // Critical: the image must cover the canvas at *every* angle along the
    // rotation, never just the start / end. For a centred image of intrinsic
    // size (w, h) scaled by `scale` and rotated by θ, the worst-case canvas
    // corner sits at distance (W*|cosθ| + H*|sinθ|) / 2 along the image's
    // local x-axis and (W*|sinθ| + H*|cosθ|) / 2 along its local y-axis. The
    // rotated image then covers the canvas iff:
    //
    //   w*scale >= W*|cosθ| + H*|sinθ|     and
    //   h*scale >= W*|sinθ| + H*|cosθ|
    //
    // We sample 1° apart and emit one keyframe per sample so gsap interpolates
    // rotation AND scale together — never a gap, never an over-scale.
    const sampleStep = 1; // degrees
    const span = Math.abs(endAngle - startAngle);
    const sampleCount = Math.max(2, Math.ceil(span / sampleStep) + 1);

    const scaleAt = (deg: number): string => {
      const θ = (Math.abs(deg) * Math.PI) / 180;
      const c = Math.cos(θ);
      const s = Math.sin(θ);
      return `max(${baseScale}, max((W*${c} + H*${s}) / w, (W*${s} + H*${c}) / h))`;
    };

    initial = {
      x: 'W/2', y: 'H/2',
      pivotX: 'w * 0.5', pivotY: 'h * 0.5',
      scale: scaleAt(startAngle),
      rotation: startAngle,
    };
    // Build sampled keyframes: each step animates from the previous (rotation,
    // scale) to the next pair. gsap linearly interpolates between samples;
    // with 1° spacing the interpolation error in scale is sub-pixel.
    keyframes = [];
    for (let i = 1; i < sampleCount; i++) {
      const tFrac = i / (sampleCount - 1);
      const angleHere = startAngle + (endAngle - startAngle) * tFrac;
      const tHere = duration * tFrac;
      // segment goes from previous time to this time
      const tPrev = duration * ((i - 1) / (sampleCount - 1));
      keyframes.push({
        at: baseAt + tPrev,
        to: { rotation: angleHere, scale: scaleAt(angleHere) },
        duration: tHere - tPrev,
        ease: i === 1 ? ease : 'none',
      });
    }
  } else {
    // motion === 'position'
    const from = opts.from ?? [0.25, 0.25];
    const to   = opts.to   ?? [0.75, 0.75];
    const zoom = opts.zoom ?? 1.15;
    // Over-scaled scale. The pivot is at image centre so x/y move the centre.
    const scaleExpr = `(${baseScale}) * ${zoom}`;
    // x at panX = W/2 + (0.5 - panX) * (w * scale - W).
    // (Verified: panX=0 → image's left edge at canvas left. panX=1 → right edge at right.)
    const xExpr = (panX: number) => `W/2 + (${0.5 - panX}) * (w * (${baseScale}) * ${zoom} - W)`;
    const yExpr = (panY: number) => `H/2 + (${0.5 - panY}) * (h * (${baseScale}) * ${zoom} - H)`;
    initial = {
      x: xExpr(from[0]), y: yExpr(from[1]),
      pivotX: 'w * 0.5', pivotY: 'h * 0.5',
      scale: scaleExpr,
    };
    keyframes = [
      { at: baseAt, to: { x: xExpr(to[0]), y: yExpr(to[1]) }, duration, ease },
    ];
  }

  const spec: ImageSequenceSpec = {
    type: 'image',
    asset,
    duration,
    initial,
    keyframes,
  };
  if (name !== undefined) spec.name = name;
  if (at !== undefined) spec.at = at;
  return spec;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
