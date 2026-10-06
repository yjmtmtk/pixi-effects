export { Movie } from './core/Movie';
export type {
  SnapshotOptions,
  ContactSheetOptions,
  MovieOptions,
  RenderOptions,
  FrameEvent,
  ProgressEvent,
  VolumeEvent,
  MovieErrorEvent,
  MotionBlurSpec,
  MotionBlurOptions,
} from './core/Movie';

export type { InspectReport, InspectOptions, LayerInfo } from './core/inspect';
export type { TimelineData, TimelineRow, TimelineTransition, TimelineHtmlOptions, TimelineSvgOptions } from './core/timelineChart';
export type { AudioReport, AudioSourceReport, SoundMeasure, AudioInspectOptions } from './core/inspectAudio';
export { measureText, splitText } from './text/measure';
export type { MeasureStyle, TextSize, SplitOptions, TextPiece } from './text/measure';

export { registerSequenceType } from './core/Composition';
export type { SequenceCtor } from './core/Composition';

export { kenBurns } from './presets/kenBurns';
export type { KenBurnsOptions } from './presets/kenBurns';

export { orbit } from './presets/orbit';
export type { OrbitOptions } from './presets/orbit';

export { particles } from './presets/particles';
export type { ParticlesOptions } from './presets/particles';

export { followPath } from './presets/followPath';
export type { FollowPathOptions } from './presets/followPath';

export { animateText } from './presets/animateText';
export type { AnimateTextOptions, AnimateTextTween, TextPreset } from './presets/animateText';

export { stagger } from './presets/stagger';
export type { StaggerOptions } from './presets/stagger';

export { wiggle } from './presets/wiggle';
export type { WiggleOptions, WiggleProp } from './presets/wiggle';

export { random, rand, noise } from './expr/random';

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
  NullSequenceSpec,
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
