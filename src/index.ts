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
export type { AudioReport, AudioSourceReport, SoundMeasure, AudioInspectOptions } from './core/inspectAudio';
export { measureText, splitText } from './text/measure';
export type { MeasureStyle, TextSize, SplitOptions, TextPiece } from './text/measure';

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
  AudioAssetSpec,
  AudioSfxSpec,
  SfxPreset,
  SfxKnobs,
  SfxVoice,
  SfxOptions,
  CompositionSequenceSpec,
  CameraSequenceSpec,
  ShapeSequenceSpec,
  RectShapeSpec,
  CircleShapeSpec,
  EllipseShapeSpec,
  ArcShapeSpec,
  LineShapeSpec,
  PolygonShapeSpec,
  PathShapeSpec,
  GradientSpec,
  SequenceSpec,
  CompositionSpec,
} from './types';
