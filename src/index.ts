export { Movie } from './core/Movie';
export type {
  SnapshotOptions,
  ContactSheetOptions,
  MovieOptions,
  RenderOptions,
  FrameEvent,
  ProgressEvent,
} from './core/Movie';

export type { InspectReport, InspectOptions, LayerInfo } from './core/inspect';

export { registerSequenceType } from './core/Composition';
export type { SequenceCtor } from './core/Composition';

export { kenBurns } from './presets/kenBurns';
export type { KenBurnsOptions } from './presets/kenBurns';

export { orbit } from './presets/orbit';
export type { OrbitOptions } from './presets/orbit';

export { withFade } from './transforms/withFade';
export type { WithFadeOptions } from './transforms/withFade';

export type {
  Expr,
  PropValue,
  Props,
  Keyframe,
  AssetSpec,
  ChromaKeyFilterSpec,
  CustomFilterSpec,
  FilterSpec,
  TransitionCommon,
  CrossfadeTransition,
  WipeTransition,
  IrisTransition,
  SlideTransition,
  DipTransition,
  ZoomTransition,
  DissolveTransition,
  TransitionSpec,
  SequenceCommon,
  VideoSequenceSpec,
  ImageSequenceSpec,
  TextSequenceSpec,
  AudioSequenceSpec,
  CompositionSequenceSpec,
  CameraSequenceSpec,
  ShapeSequenceSpec,
  RectShapeSpec,
  CircleShapeSpec,
  EllipseShapeSpec,
  LineShapeSpec,
  PolygonShapeSpec,
  PathShapeSpec,
  GradientSpec,
  SequenceSpec,
  CompositionSpec,
} from './types';
