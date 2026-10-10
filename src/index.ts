export { Movie } from './core/Movie';
export { normalizeStops, pictureStops } from './core/stops';
export type { Stop, StopSpec } from './core/stops';
export { resolveLoader, dismissLoader, failLoader } from './core/loader';
export type { LoaderOption } from './core/loader';
export type { LoadProgressState, LoadStage } from './core/loadProgress';
export type {
  SnapshotOptions,
  ContactSheetOptions,
  OnionSkinOptions,
  MovieOptions,
  RenderOptions,
  FrameEvent,
  ProgressEvent,
  VolumeEvent,
  MovieErrorEvent,
  StopEvent,
  StopImage,
  StopImagesOptions,
  MotionBlurSpec,
  MotionBlurOptions,
} from './core/Movie';

export type { InspectReport, InspectOptions, LayerInfo } from './core/inspect';
export type { TimelineData, TimelineRow, TimelineTransition, TimelineHtmlOptions, TimelineSvgOptions } from './core/timelineChart';
export type { AudioReport, AudioSourceReport, SoundMeasure, AudioInspectOptions } from './core/inspectAudio';
export type { FontReport } from './core/inspectFonts';
export type { ReviewOptions, ReviewReport, IssueGroup } from './core/review';
export { measureText, splitText } from './text/measure';
export type { MeasureStyle, TextSize, SplitOptions, TextPiece } from './text/measure';

export { registerSequenceType } from './core/Composition';
export type { SequenceCtor } from './core/Composition';

export { parseEase as ease } from './presets/_ease';
export { kenBurns } from './presets/kenBurns';
export type { KenBurnsOptions } from './presets/kenBurns';

export { orbit } from './presets/orbit';
export type { OrbitOptions } from './presets/orbit';

export { particles } from './presets/particles';
export type { ParticlesOptions } from './presets/particles';

export { followPath } from './presets/followPath';
export { cameraPath } from './presets/cameraPath';
export type { CameraPathOptions } from './presets/cameraPath';
export type { FollowPathOptions } from './presets/followPath';

export { animateText } from './presets/animateText';
export type { AnimateTextOptions, AnimateTextTween, TextPreset } from './presets/animateText';

export { react } from './presets/react';
export type { ReactOptions, ReactProp } from './presets/react';
export { audioEnvelope, computeEnvelope, bpmEnvelope } from './audio/envelope';
export { musicEnvelope } from './audio/musicEnvelope';
export { musicBuffer } from './audio/musicBuffer';
export type { AudioEnvelope, EnvelopeOptions, AudioEnvelopeSource } from './audio/envelope';

export { deck } from './presets/deck';
export type { DeckOptions, DeckPage, DeckResult, DeckTransition } from './presets/deck';

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
  LumaTransition,
  TransitionSpec,
  SequenceCommon,
  BlendModeName,
  MatteRefSpec,
  MaskRefSpec,
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
  MusicOptions,
  MusicTrack,
  MusicDrums,
  MusicInstrument,
  MusicDrum,
  MusicLevel,
  AudioMusicSpec,
  CompositionSequenceSpec,
  CameraSequenceSpec,
  LightSequenceSpec,
  ShaderSequenceSpec,
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
