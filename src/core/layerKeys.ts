import { suggestName } from './options';
import type {
  SequenceCommon, VideoSequenceSpec, ImageSequenceSpec, TextSequenceSpec, AudioAssetSpec, AudioSfxSpec, AudioMusicSpec,
  CompositionSequenceSpec, CameraSequenceSpec, LightSequenceSpec, ShaderSequenceSpec, CanvasSequenceSpec, Scene2DSequenceSpec, NullSequenceSpec, SequenceSpec,
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

export const COMMON = ['type', 'name', 'parent', 'follow', 'at', 'duration', 'initial', 'keyframes', 'filters', 'filterArea', 'mask', 'blendMode', 'threeD', 'hideBehindCamera', 'lit', 'castsShadows'] as const satisfies readonly KeysOfUnion<SequenceCommon | { type: string }>[];

const VIDEO = [...COMMON, 'asset', 'loop', 'audio', 'volume', 'speed'] as const satisfies readonly KeysOfUnion<VideoSequenceSpec>[];
const IMAGE = [...COMMON, 'asset', 'colorSpace', 'scaleMode'] as const satisfies readonly KeysOfUnion<ImageSequenceSpec>[];
const TEXT = [...COMMON, 'text', 'spans', 'format', 'resolution', 'style', 'colorSpace', 'fillGradient'] as const satisfies readonly KeysOfUnion<TextSequenceSpec>[];
const AUDIO = [...COMMON, 'volume', 'asset', 'loop', 'sfx', 'music', 'speed'] as const satisfies readonly KeysOfUnion<AudioAssetSpec | AudioSfxSpec | AudioMusicSpec>[];
const COMPOSITION = [...COMMON, 'width', 'height', 'sequences', 'transitions', 'speed', 'clip', 'use', 'params', 'frameRate', 'loop', 'markers'] as const satisfies readonly KeysOfUnion<CompositionSequenceSpec>[];
const CAMERA = [...COMMON] as const satisfies readonly KeysOfUnion<CameraSequenceSpec>[];
const LIGHT = [...COMMON, 'kind', 'falloff'] as const satisfies readonly KeysOfUnion<LightSequenceSpec>[];
const SHADER = [...COMMON, 'fragment', 'uniforms', 'width', 'height', 'resolution', 'transparent'] as const satisfies readonly KeysOfUnion<ShaderSequenceSpec>[];
const CANVAS = [...COMMON, 'draw', 'setup', 'width', 'height', 'resolution', 'params', 'seed', 'smoothing'] as const satisfies readonly KeysOfUnion<CanvasSequenceSpec>[];
const SCENE2D = [...COMMON, 'setup', 'update', 'dispose', 'width', 'height', 'reuse'] as const satisfies readonly KeysOfUnion<Scene2DSequenceSpec>[];
const NULL = [...COMMON] as const satisfies readonly KeysOfUnion<NullSequenceSpec>[];

const SHAPE = [...COMMON, 'shape', 'fillGradient', 'colorSpace', 'strokeCap', 'strokeJoin'] as const;
const TRIM = ['trimStart', 'trimEnd', 'trimEach'] as const;
const RECT = [...SHAPE, ...TRIM, 'width', 'height', 'cornerRadius', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<RectShapeSpec>[];
const CIRCLE = [...SHAPE, ...TRIM, 'radius', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<CircleShapeSpec>[];
const ELLIPSE = [...SHAPE, ...TRIM, 'radiusX', 'radiusY', 'anchorX', 'anchorY'] as const satisfies readonly KeysOfUnion<EllipseShapeSpec>[];
const ARC = [...SHAPE, 'radius', 'innerRadius', 'startAngle', 'endAngle'] as const satisfies readonly KeysOfUnion<ArcShapeSpec>[];
const LINE = [...SHAPE, ...TRIM, 'from', 'to'] as const satisfies readonly KeysOfUnion<LineShapeSpec>[];
const POLYGON = [...SHAPE, ...TRIM, 'points', 'open'] as const satisfies readonly KeysOfUnion<PolygonShapeSpec>[];
const PATH = [...SHAPE, ...TRIM, 'd', 'fillRule', 'morphTo', 'morph', 'morphPoints'] as const satisfies readonly KeysOfUnion<PathShapeSpec>[];

/** The compiler checks every table covers its type (this type is never used: it exists to fail the build). */
export type __Covered = [
  Assert<Covers<VideoSequenceSpec, typeof VIDEO>>, Assert<Covers<ImageSequenceSpec, typeof IMAGE>>, Assert<Covers<TextSequenceSpec, typeof TEXT>>,
  Assert<Covers<AudioAssetSpec | AudioSfxSpec | AudioMusicSpec, typeof AUDIO>>, Assert<Covers<CompositionSequenceSpec, typeof COMPOSITION>>,
  Assert<Covers<CameraSequenceSpec, typeof CAMERA>>, Assert<Covers<LightSequenceSpec, typeof LIGHT>>, Assert<Covers<ShaderSequenceSpec, typeof SHADER>>, Assert<Covers<CanvasSequenceSpec, typeof CANVAS>>, Assert<Covers<Scene2DSequenceSpec, typeof SCENE2D>>, Assert<Covers<NullSequenceSpec, typeof NULL>>,
  Assert<Covers<RectShapeSpec, typeof RECT>>, Assert<Covers<CircleShapeSpec, typeof CIRCLE>>, Assert<Covers<EllipseShapeSpec, typeof ELLIPSE>>,
  Assert<Covers<ArcShapeSpec, typeof ARC>>, Assert<Covers<LineShapeSpec, typeof LINE>>, Assert<Covers<PolygonShapeSpec, typeof POLYGON>>,
  Assert<Covers<PathShapeSpec, typeof PATH>>,
];

const SHAPES: Record<string, readonly string[]> = { rect: RECT, circle: CIRCLE, ellipse: ELLIPSE, arc: ARC, line: LINE, polygon: POLYGON, path: PATH };
const BY_TYPE: Record<string, readonly string[]> = { video: VIDEO, image: IMAGE, text: TEXT, audio: AUDIO, composition: COMPOSITION, camera: CAMERA, light: LIGHT, shader: SHADER, canvas: CANVAS, scene2d: SCENE2D, null: NULL };

/** The shapes a shape layer can be. */
export const SHAPE_NAMES: readonly string[] = Object.keys(SHAPES);
/** The layer types this library knows (scene3d comes from pixi-effects/3d). */
export const LAYER_TYPES: readonly string[] = [...Object.keys(BY_TYPE), 'shape', 'scene3d'];
/** Shapes by the names other programs give them. */
const SHAPE_ALIASES: Record<string, string> = { rectangle: 'rect', square: 'rect', box: 'rect', roundrect: 'rect', roundedrect: 'rect', oval: 'ellipse', dot: 'circle', disc: 'circle', disk: 'circle', ring: 'circle',
  triangle: 'polygon', star: 'polygon', hexagon: 'polygon', pentagon: 'polygon', poly: 'polygon', polyline: 'line', segment: 'line', pie: 'arc', wedge: 'arc', svg: 'path', bezier: 'path', curve: 'path' };
/** Layer types by the names other tools give them. */
const TYPE_ALIASES: Record<string, string> = { group: 'composition', precomp: 'composition', comp: 'composition', container: 'composition', scene: 'composition', nest: 'composition',
  sprite: 'image', picture: 'image', img: 'image', photo: 'image', bitmap: 'image', sound: 'audio', sfx: 'audio', music: 'audio', bgm: 'audio', movie: 'video', clip: 'video', footage: 'video',
  label: 'text', title: 'text', caption: 'text', glsl: 'shader', fragment: 'shader', nullobject: 'null', empty: 'null', 'null-object': 'null' };

/** What an unknown type probably meant: a layer type, or a shape written as the type (`type: 'rect'` → `type: 'shape', shape: 'rect'`). */
export function guessType(type: string): string | null {
  const n = type.toLowerCase().replace(/[-_ ]/g, '');
  const shape = SHAPES[n] ? n : SHAPE_ALIASES[n];
  if (shape) return `type: 'shape', shape: '${shape}'`;
  const t = TYPE_ALIASES[n] ?? suggestName(type, LAYER_TYPES);
  return t ? `"${t}"` : null;
}
/** What an unknown shape probably meant. */
export function guessShape(shape: string): string | null {
  const n = shape.toLowerCase().replace(/[-_ ]/g, '');
  return SHAPE_ALIASES[n] ?? suggestName(shape, SHAPE_NAMES);
}

/** The keys that shape what is drawn: a layer that is never drawn (audio, a camera, a light) accepts them in its type but they do nothing there. */
const PICTURE_KEYS = ['filters', 'filterArea', 'mask', 'blendMode', 'threeD', 'hideBehindCamera', 'lit', 'castsShadows'] as const;
const NOT_DRAWN: Record<string, string> = {
  audio: 'an audio layer: it is not drawn (it plays)',
  camera: 'a camera layer: it is not drawn, it frames the picture (its place and lens go in `initial` / `keyframes`: x y z lookAtX … fov)',
  light: 'a light layer: it is not drawn, it lights `threeD` layers (its numbers go in `initial` / `keyframes`: intensity color …)',
};

/** For a layer that is never drawn: the picture keys it carries, each with what the layer is (the keys do nothing there). A light keeps `castsShadows`, its own switch. */
export function pictureKeysIgnored(spec: { type: string } & Record<string, unknown>): Array<{ key: string; why: string }> {
  const why = NOT_DRAWN[spec.type];
  if (!why) return [];
  return PICTURE_KEYS.filter(k => spec[k] !== undefined && !(spec.type === 'light' && k === 'castsShadows')).map(key => ({ key, why }));
}

/** What a layer may be called, for the message: `text layer`, `rect shape`. */
export function kindName(spec: { type: string; shape?: string }): string {
  return spec.type === 'shape' && spec.shape ? `${spec.shape} shape` : `${spec.type} layer`;
}

/** The keys a layer may have, or null for a kind this library does not know (a `scene3d` layer: registered elsewhere, so not checked here). */
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

/** Names a keyframe or `initial` may animate. Dotted paths (`filters.g.amount`, `scene3d.box.x`) belong to their routers and are not looked up here. */
export const PROP_KEYS: ReadonlySet<string> = new Set([
  // transform and look
  'x', 'y', 'z', 'alpha', 'rotation', 'rotationX', 'rotationY', 'width', 'height', 'visible', 'autoAlpha',
  'scale', 'scaleX', 'scaleY', 'anchor', 'anchorX', 'anchorY', 'pivot', 'pivotX', 'pivotY', 'skew', 'skewX', 'skewY',
  'position', 'positionX', 'positionY', 'tilePosition', 'tilePositionX', 'tilePositionY', 'tileScale', 'tileScaleX', 'tileScaleY', 'tint',
  // shapes
  'fillColor', 'fillAlpha', 'strokeColor', 'strokeAlpha', 'strokeWidth', 'cornerRadius', 'radius', 'radiusX', 'radiusY',
  'innerRadius', 'startAngle', 'endAngle', 'trimStart', 'trimEnd', 'trimEach', 'morph', 'fillGradient', 'strokeCap', 'strokeJoin',
  // text, audio, video
  'fill', 'value', 'visibleChars', 'text', 'volume', 'time',
  // camera
  'lookAtX', 'lookAtY', 'lookAtZ', 'fov', 'focus', 'aperture', 'offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ',
  // light + fog
  'intensity', 'color', 'coneAngle', 'coneFeather', 'falloffDistance', 'shadowDarkness', 'shadowDiffusion', 'fogNear', 'fogFar', 'fogColor', 'fogAmount',
]);

/** The text `style` keys (PixiJS TextStyle) that this library passes on. */
export const STYLE_KEYS: readonly string[] = [
  'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'fontVariant', 'fill', 'stroke', 'dropShadow', 'letterSpacing', 'lineHeight', 'leading',
  'align', 'wordWrap', 'wordWrapWidth', 'breakWords', 'whiteSpace', 'padding', 'textBaseline', 'trim', 'lineJoin', 'miterLimit', 'filters', 'tagStyles',
];

export type { SequenceSpec };
