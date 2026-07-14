export { Movie } from './core/Movie';
export type {
  MovieOptions,
  RenderOptions,
  FrameEvent,
  ProgressEvent,
} from './core/Movie';

export { registerSequenceType } from './core/Composition';
export type { SequenceCtor } from './core/Composition';

export { kenBurns } from './presets/kenBurns';
export type { KenBurnsOptions } from './presets/kenBurns';

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
  ShapeSequenceSpec,
  RectShapeSpec,
  CircleShapeSpec,
  EllipseShapeSpec,
  LineShapeSpec,
  PolygonShapeSpec,
  PathShapeSpec,
  SequenceSpec,
  CompositionSpec,
} from './types';
