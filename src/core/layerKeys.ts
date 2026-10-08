import type {
  SequenceCommon, VideoSequenceSpec, ImageSequenceSpec, TextSequenceSpec, AudioAssetSpec, AudioSfxSpec, AudioMusicSpec,
  CompositionSequenceSpec, CameraSequenceSpec, NullSequenceSpec, SequenceSpec,
  RectShapeSpec, CircleShapeSpec, EllipseShapeSpec, ArcShapeSpec, LineShapeSpec, PolygonShapeSpec, PathShapeSpec,
} from '../types';

/**
 * The keys a layer of each kind may have, for `lintKeys`. They are tables of names, so each one is checked against its type twice, by
 * the compiler: `satisfies` rejects a name the type does not have, and `Covers` fails the build when the type has a key the table lacks
 * (add a key to a spec type and `tsc` tells you to add it here, so the warning never calls a real key unknown).
 */
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type Covers<T, K extends readonly string[]> = [Exclude<KeysOfUnion<T>, K[number]>] extends [never] ? true : { missing: Exclude<KeysOfUnion<T>, K[number]> };
type Assert<T extends true> = T;

const COMMON = ['type', 'name', 'parent', 'at', 'duration', 'initial', 'keyframes', 'filters', 'filterArea', 'mask', 'maskInverted', 'blendMode', 'threeD', 'hideBehindCamera'] as const satisfies readonly KeysOfUnion<SequenceCommon | { type: string }>[];

const VIDEO = [...COMMON, 'asset', 'loop', 'audio', 'volume'] as const satisfies readonly KeysOfUnion<VideoSequenceSpec>[];
const IMAGE = [...COMMON, 'asset', 'colorSpace'] as const satisfies readonly KeysOfUnion<ImageSequenceSpec>[];
const TEXT = [...COMMON, 'text', 'format', 'style', 'colorSpace', 'fillGradient'] as const satisfies readonly KeysOfUnion<TextSequenceSpec>[];
const AUDIO = [...COMMON, 'volume', 'asset', 'loop', 'sfx', 'music'] as const satisfies readonly KeysOfUnion<AudioAssetSpec | AudioSfxSpec | AudioMusicSpec>[];
const COMPOSITION = [...COMMON, 'width', 'height', 'sequences', 'transitions'] as const satisfies readonly KeysOfUnion<CompositionSequenceSpec>[];
const CAMERA = [...COMMON] as const satisfies readonly KeysOfUnion<CameraSequenceSpec>[];
const NULL = [...COMMON] as const satisfies readonly KeysOfUnion<NullSequenceSpec>[];

const SHAPE = [...COMMON, 'shape', 'fillGradient', 'colorSpace', 'strokeCap', 'strokeJoin'] as const;
const TRIM = ['trimStart', 'trimEnd', 'trimEach'] as const;
const RECT = [...SHAPE, ...TRIM, 'width', 'height', 'cornerRadius', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<RectShapeSpec>[];
const CIRCLE = [...SHAPE, ...TRIM, 'radius', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<CircleShapeSpec>[];
const ELLIPSE = [...SHAPE, ...TRIM, 'radiusX', 'radiusY', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<EllipseShapeSpec>[];
const ARC = [...SHAPE, 'radius', 'innerRadius', 'startAngle', 'endAngle'] as const satisfies readonly KeysOfUnion<ArcShapeSpec>[];
const LINE = [...SHAPE, ...TRIM, 'from', 'to'] as const satisfies readonly KeysOfUnion<LineShapeSpec>[];
const POLYGON = [...SHAPE, ...TRIM, 'points', 'open'] as const satisfies readonly KeysOfUnion<PolygonShapeSpec>[];
const PATH = [...SHAPE, ...TRIM, 'd', 'morphTo', 'morph', 'morphPoints'] as const satisfies readonly KeysOfUnion<PathShapeSpec>[];

/** The compiler checks every table covers its type (this type is never used: it exists to fail the build). */
export type __Covered = [
  Assert<Covers<VideoSequenceSpec, typeof VIDEO>>, Assert<Covers<ImageSequenceSpec, typeof IMAGE>>, Assert<Covers<TextSequenceSpec, typeof TEXT>>,
  Assert<Covers<AudioAssetSpec | AudioSfxSpec | AudioMusicSpec, typeof AUDIO>>, Assert<Covers<CompositionSequenceSpec, typeof COMPOSITION>>,
  Assert<Covers<CameraSequenceSpec, typeof CAMERA>>, Assert<Covers<NullSequenceSpec, typeof NULL>>,
  Assert<Covers<RectShapeSpec, typeof RECT>>, Assert<Covers<CircleShapeSpec, typeof CIRCLE>>, Assert<Covers<EllipseShapeSpec, typeof ELLIPSE>>,
  Assert<Covers<ArcShapeSpec, typeof ARC>>, Assert<Covers<LineShapeSpec, typeof LINE>>, Assert<Covers<PolygonShapeSpec, typeof POLYGON>>,
  Assert<Covers<PathShapeSpec, typeof PATH>>,
];

const SHAPES: Record<string, readonly string[]> = { rect: RECT, circle: CIRCLE, ellipse: ELLIPSE, arc: ARC, line: LINE, polygon: POLYGON, path: PATH };
const BY_TYPE: Record<string, readonly string[]> = { video: VIDEO, image: IMAGE, text: TEXT, audio: AUDIO, composition: COMPOSITION, camera: CAMERA, null: NULL };

/** What a layer may be called, for the message: `text layer`, `rect shape`. */
export function kindName(spec: { type: string; shape?: string }): string {
  return spec.type === 'shape' && spec.shape ? `${spec.shape} shape` : `${spec.type} layer`;
}

/** The keys a layer may have, or null for a kind this library does not know (a `three` layer: registered elsewhere, so not checked). */
export function layerKeys(spec: { type: string; shape?: string }): readonly string[] | null {
  if (spec.type === 'shape') return (spec.shape && SHAPES[spec.shape]) || null;
  return BY_TYPE[spec.type] ?? null;
}

/** Which kinds have `key` (for "it belongs to a circle shape"). */
export function kindsWithKey(key: string): string[] {
  const out: string[] = [];
  for (const [shape, keys] of Object.entries(SHAPES)) if (keys.includes(key)) out.push(`${shape} shape`);
  for (const [type, keys] of Object.entries(BY_TYPE)) if (keys.includes(key)) out.push(`${type} layer`);
  return out;
}

/** Names a keyframe or `initial` may animate. Dotted paths (`filters.g.amount`, `three.box.x`) belong to their routers and are not looked up here. */
export const PROP_KEYS: ReadonlySet<string> = new Set([
  // transform and look (GSAP + PixiPlugin names)
  'x', 'y', 'z', 'alpha', 'rotation', 'rotationX', 'rotationY', 'width', 'height', 'visible', 'autoAlpha',
  'scale', 'scaleX', 'scaleY', 'anchor', 'anchorX', 'anchorY', 'pivot', 'pivotX', 'pivotY', 'skew', 'skewX', 'skewY',
  'position', 'positionX', 'positionY', 'tint', 'colorize', 'colorizeAmount', 'blur', 'blurX', 'blurY', 'blurPadding',
  // shapes
  'fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth', 'lineColor', 'lineAlpha', 'cornerRadius', 'radius', 'radiusX', 'radiusY',
  'innerRadius', 'startAngle', 'endAngle', 'trimStart', 'trimEnd', 'trimEach', 'morph', 'fillGradient', 'strokeCap', 'strokeJoin',
  // text, audio, video
  'fill', 'value', 'visibleChars', 'text', 'volume',
  // camera
  'lookAtX', 'lookAtY', 'lookAtZ', 'fov', 'offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ',
]);

/** The text `style` keys (PixiJS TextStyle) that this library passes on. */
export const STYLE_KEYS: readonly string[] = [
  'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'fontVariant', 'fill', 'stroke', 'dropShadow', 'letterSpacing', 'lineHeight', 'leading',
  'align', 'wordWrap', 'wordWrapWidth', 'breakWords', 'whiteSpace', 'padding', 'textBaseline', 'trim', 'lineJoin', 'miterLimit', 'filters', 'tagStyles',
];

export type { SequenceSpec };
