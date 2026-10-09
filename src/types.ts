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

/** What a keyframe's `set` / `to` / `from` may hold: the usual numbers and strings, and for a layer with a `fillGradient` a partial gradient (`{ angle, center, innerRadius, radius, stops }`; the same number of stops). */
export type KeyframeProps = Props & { fillGradient?: Partial<GradientSpec> };

/** A single keyframe entry. Either `set`, `to`, `from`, or `from`+`to` is meaningful per kind. */
export interface Keyframe {
  /**
   * Start time in seconds, measured from the start of the sequence this
   * keyframe belongs to (After Effects style): `0` = the moment the layer
   * appears. Negative values count back from the sequence's end
   * (`-0.5` = 0.5 s before it ends).
   */
  at?: number;
  /** Seconds, or 'auto' with a spring ease: the time the spring takes to settle (within 0.5 %). */
  duration?: number | 'auto';
  ease?: string;
  /** Extra plays of this tween after the first (a finite count; infinite repeats are not allowed — the timeline needs a fixed length). Total time = duration × (repeat + 1) plus delays. */
  repeat?: number;
  /** With `repeat`: every other play runs backwards (there-and-back). */
  yoyo?: boolean;
  /** With `repeat`: seconds to wait between plays. */
  repeatDelay?: number;
  set?: KeyframeProps;
  to?: KeyframeProps;
  from?: KeyframeProps;
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

/**
 * A filter by name: `{ type: 'glow', outerStrength: 3, color: '#ffd166' }`. The type is the filter's class name without
 * `Filter` in camelCase (case does not matter); every other key is the filter's own option. `blur`, `noise`, `alpha` and
 * `colorMatrix` (`preset: 'sepia' | 'grayscale' | …` or a 20-number `matrix`) come from pixi.js; the rest are the filters of
 * the `pixi-filters` package (add it to the import map, or `npm i pixi-filters`), loaded on first use. Animate an option with
 * `'filters.<name>.<option>'` like any other filter.
 */
export interface NamedFilterSpec {
  type: NamedFilterType;
  name?: string;
  [option: string]: unknown;
}
export type NamedFilterType =
  | 'blur' | 'noise' | 'alpha' | 'colorMatrix' | 'grain'
  | 'adjustment' | 'advancedBloom' | 'ascii' | 'backdropBlur' | 'bevel' | 'bloom' | 'bulgePinch' | 'colorGradient' | 'colorMap'
  | 'colorOverlay' | 'colorReplace' | 'convolution' | 'crossHatch' | 'crt' | 'dot' | 'dropShadow' | 'emboss' | 'glitch' | 'glow'
  | 'godray' | 'grayscale' | 'hslAdjustment' | 'kawaseBlur' | 'motionBlur' | 'multiColorReplace' | 'oldFilm' | 'outline'
  | 'pixelate' | 'radialBlur' | 'reflection' | 'rgbSplit' | 'shockwave' | 'simpleLightmap' | 'simplexNoise' | 'tiltShift'
  | 'tiltShiftAxis' | 'twist' | 'zoomBlur';

export type FilterSpec = ChromaKeyFilterSpec | CustomFilterSpec | NamedFilterSpec;

// ─── Transition specs ────────────────────────────────────────────────────────

export interface TransitionCommon {
  /** Sibling sequence's `name` — the outgoing scene. */
  from: string;
  /** Sibling sequence's `name` — the incoming scene. Must be declared after `from` in the parent's `sequences[]`. */
  to: string;
  /** Start time in the PARENT composition's time (like a sequence's `at`, not sequence-local). Negative = back from the parent's end. */
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

export interface LumaTransition extends TransitionCommon {
  kind: 'luma';
  /** The brightness map the wipe follows: `'linear'` (left to right), `'diagonal'`, `'radial'` (from the middle), or the name of a grayscale image asset (dark parts change first). Default `'linear'`. */
  map?: string;
  /** Width of the soft band between the scenes, in brightness units (0..1). Default 0.1. */
  softness?: number;
  /** Reverse the map (light parts change first). */
  flip?: boolean;
}

export type TransitionSpec =
  | CrossfadeTransition
  | WipeTransition
  | IrisTransition
  | SlideTransition
  | DipTransition
  | ZoomTransition
  | DissolveTransition
  | LumaTransition;

// ─── Sequence specs ───────────────────────────────────────────────────────

/** How a layer blends with what is behind it: the CSS `mix-blend-mode` names, plus `add` and `linear-burn`. */
export type BlendModeName =
  | 'normal' | 'add' | 'screen' | 'multiply'
  | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity' | 'linear-burn';

/** A matte given by name: another layer of the same composition. `channel` is how it is read (`'alpha'` by default, or `'luma'`: its brightness); `invert` uses 1 − matte. */
export interface MatteRefSpec { layer: string; channel?: 'alpha' | 'luma'; invert?: boolean }
/** A layer's `mask` can be a layer written in place, the name of another layer, `{ layer, channel, invert }`, or a list of those (intersect). */
export type MaskRefSpec = string | MatteRefSpec;

export interface SequenceCommon {
  name?: string;
  /**
   * Attach this layer to a `{ type: 'null' }` layer (by its `name`): it is drawn inside that layer, so its `x` / `y`
   * are measured from the null's origin and the null's position, rotation, scale and alpha carry it along. The layer is
   * drawn where the null is in the stack, not where it is listed. Only `null` layers can be parents (they chain); not for `threeD` layers.
   */
  parent?: string;
  at?: number;
  duration?: number;
  initial?: Props;
  keyframes?: Keyframe[];
  filters?: FilterSpec[];
  /**
   * Override PIXI's auto-computed filter region. By default, filters apply
   * only inside the target's bounding box. This rectangle is in the layer's
   * OWN coordinate space (origin = the layer's local origin, before its
   * x/y/scale/rotation — e.g. a circle's centre), not the parent's. Use it to
   * let a filter (blur, glow, a wipe / iris transition) draw beyond the
   * layer's own bounds; without it a blur is clipped to the bounding box.
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
   *
   * Instead of a layer written in place, `mask` can name another layer of the same composition (a matte: it is not drawn, and several
   * layers can share it), `{ layer, channel, invert }`, or a list of those (all of them must let the layer through: intersect; subtract
   * with `invert: true`).
   */
  mask?: SequenceSpec | MaskRefSpec | MaskRefSpec[];
  /**
   * When true, the mask is inverted: pixels inside the mask shape become
   * transparent and pixels outside become visible. Useful for "knockout"
   * effects (cut a hole through an image / panel). Default false.
   *
   * Routed through PIXI's native `setMask({ inverse: true })`.
   */
  maskInverted?: boolean;
  /**
   * How this layer blends with what is behind it (everything drawn below it). `'add'` and `'screen'` brighten (glows, light
   * leaks, overlapping halos add up instead of covering each other), `'multiply'` darkens; `'overlay'`, `'soft-light'`,
   * `'color-dodge'`, `'hue'`, ... are the CSS `mix-blend-mode` modes. Default `'normal'`.
   * On a composition the mode is inherited by its children: each one blends with what is behind it.
   */
  blendMode?: BlendModeName;
  /**
   * Opt this layer into 2.5D: it can then use `z`, `rotationX`, `rotationY`
   * (in `initial` / keyframes) and is projected through the composition's
   * `camera` layer. Default false. With z = 0, no 3D rotation and the default
   * camera, a threeD layer renders exactly like a 2D one.
   */
  threeD?: boolean;
  /** A threeD layer the camera passes (a fly-through): hide it quietly when it is at or behind the camera instead of warning. Default false. */
  hideBehindCamera?: boolean;
  /** `false` keeps this `threeD` layer unlit when the composition has `light` layers (default true: every threeD layer receives the lights). */
  lit?: boolean;
  /** This `threeD` layer's outline shadows the other lit layers under lights that have `castsShadows`. Default false. */
  castsShadows?: boolean;
}

export interface VideoSequenceSpec extends SequenceCommon {
  type: 'video';
  asset: string;
  loop?: boolean;
  audio?: boolean;
  volume?: number;
  /**
   * Playback speed: 1 = as recorded, 2 = twice as fast, 0.5 = slow motion, negative = backward (it starts at |speed| × duration, so
   * `speed: -1` plays the first `duration` seconds in reverse). A fixed setting; to change the speed over time, animate `time`
   * (seconds in the file) in `initial` / `keyframes`. When `duration` is not given it is the file's length divided by |speed|.
   */
  speed?: number;
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
  /**
   * The text. May contain `{value}`, replaced by the layer's animatable number
   * `value` (a counter): `text: '{value} users'`, `initial: { value: 0 }`,
   * keyframe `to: { value: 2480 }`. Format it with `format`.
   *
   * The text can change over time: a keyframe `set: { text: 'Two' }` swaps the string at that time (and back when
   * you seek back; a string cannot be tweened). `visibleChars` is a number that shows only the first N characters
   * (a typewriter): `initial: { visibleChars: 0 }`, keyframe `to: { visibleChars: 20 }`. It starts at 0 once it is animated.
   */
  text?: string;
  /** How `{value}` is printed: `decimals` (default 0) and thousands `grouping` (default false). */
  format?: { decimals?: number; grouping?: boolean; /** Zero-pad the whole part to this many digits (`pad: 2` → `05`; a clock `18:42:05`). */ pad?: number };
  /** Subset of PIXI v8 TextStyleOptions. String values may be exprs (e.g. fontSize: 'GW * 0.05'). */
  style?: Record<string, PropValue | { color?: PropValue; width?: PropValue }>;
  /**
   * Colour space used to interpolate `fill` keyframes. Default `'rgb'`.
   * Set to `'oklab'` / `'oklch'` for perceptually uniform interpolation
   * — same semantics as on `shape`. The text's fill is re-rasterised on
   * every frame the tween is active.
   */
  colorSpace?: 'rgb' | 'oklab' | 'oklch';
  /**
   * A gradient fill for the letters (like a shape's `fillGradient`; replaces `style.fill`). Animatable: a keyframe's
   * `to: { fillGradient: { angle: 200, stops: [...] } }` (the same number of stops). The text is re-rasterised on every change.
   */
  fillGradient?: GradientSpec;
}
export type SfxPreset =
  | 'click' | 'pop' | 'swoosh' | 'swipe' | 'hit' | 'riser' | 'chime' | 'beep' | 'coin' | 'glitch' | 'typewriter';

/** The intent-level knobs shared by presets and custom sounds. */
export interface SfxKnobs {
  /** Semitones up (+) or down (−); 12 = one octave. Default 0, range ±24. */
  pitch?: number;
  /** −1 = dark / muffled … 0 = as designed … 1 = bright / crisp. Default 0. */
  brightness?: number;
  /** Another take of the random parts (noise grain, glitch pattern, typewriter key). Same seed ⇒ same sound. Default 0. */
  seed?: number;
}

/**
 * One layer of a custom sound. Most sounds are one or two voices: noise through a moving band-pass
 * (whooshes, air, impacts) or a tone with a pitch sweep (blips, zaps, drops).
 */
export interface SfxVoice {
  /** `'noise'` for air, hiss and impacts; a waveform for tones. */
  wave: 'sine' | 'triangle' | 'square' | 'saw' | 'noise';
  /** Tone frequency in Hz, or `[from, to]` to sweep (exponentially). Ignored for noise. Default 440. */
  freq?: number | [number, number];
  /** Keeps part of the spectrum; `freq` may sweep: `{ type: 'bandpass', freq: [500, 5000] }` = a band of noise rising. `q` default 0.7 (≥ 0.7). */
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: number | [number, number]; q?: number };
  /** Level over the voice: `'fall'` (default) hit then decay · `'bell'` swell then fade · `'swell'` grow to the end · `'hold'` steady. */
  envelope?: 'fall' | 'bell' | 'swell' | 'hold';
  /** −1 left … 1 right, or `[from, to]` to move. Default 0. */
  pan?: number | [number, number];
  /** The part of the sound this voice plays, as fractions 0–1 of its length. Default 0 and 1. */
  from?: number;
  to?: number;
  /** Level relative to the other voices. Default 1. */
  gain?: number;
}

/** A preset with knobs, or a custom sound made of `voices` (length = the layer's duration, default 0.5 s). */
export type SfxOptions =
  | (SfxKnobs & { preset: SfxPreset; voices?: never })
  | (SfxKnobs & { voices: SfxVoice[]; preset?: never });

interface AudioBase extends SequenceCommon {
  type: 'audio';
  /** Level. 1 = the file as recorded, or the sfx preset's standard level (peaks at −12 dBFS). Animatable. */
  volume?: number;
  /**
   * Playback speed of an audio FILE (1 = as recorded; negative = backward; the pitch follows the speed, like a tape). Not for `sfx` /
   * `music` (change an sfx's `pitch` in semitones). To change the speed over time, animate `time` (seconds in the file).
   */
  speed?: number;
}

/** Plays an audio file from `assets`. `duration` defaults to the file's length (with `loop`: to the composition's end). */
export interface AudioAssetSpec extends AudioBase {
  asset: string;
  sfx?: never;
  music?: never;
  /** Repeat the file for the whole `duration`. Without it the layer goes silent when the file ends. */
  loop?: boolean;
}

/**
 * Plays a synthesised sound effect. `duration` IS the sound's length: omitted, it is the preset's own
 * length; given, the sound is stretched or shortened to it. `at` is where the sound starts.
 */
export interface AudioSfxSpec extends AudioBase {
  sfx: SfxPreset | SfxOptions;
  asset?: never;
  music?: never;
  loop?: never;
}

export type MusicInstrument = 'keys' | 'pluck' | 'pad' | 'bass' | 'sub' | 'lead' | 'bell' | 'musicbox';
export type MusicDrum = 'kick' | 'snare' | 'hat' | 'openhat' | 'clap' | 'rim' | 'tom' | 'crash' | 'shaker' | 'sleigh';
/** A level that may change over the music: a number, or `[beat, level]` points joined by straight lines (held before the first and after the last). */
export type MusicLevel = number | Array<[number, number]>;

export interface MusicTrack {
  inst: MusicInstrument;
  /** The notes as text: `'c4 e4 g4:2 _ Am7:4 [c4 e4 g4]:2'`. A token is a note (`c4`, `f#3`, `Bb2`) or a chord (`Am7`, `C@4`, `Am7/e`, `[c4 e4]`), `_` a rest, `~` a hold; `:2` is its length in beats; `|` is ignored; `!` accents, `,` softens. */
  notes: string;
  /** Level 0–1 (default 0.8), or `[beat, level]` points for a fade or a swell. */
  vol?: MusicLevel;
  /** −1 (left) … 1 (right). */
  pan?: number;
  /** Length of a token without `:` in beats (default 1). */
  step?: number;
  /** Seconds between the notes of a chord (0.01 sounds like a strum). */
  strum?: number;
  /** How much of its written length a note sounds, 0.1–1 (default 0.96). */
  legato?: number;
  /** Brightness 0–1 (default 1): lower is darker. */
  tone?: number;
  /** How much of this track goes to the reverb, 0–1 (default 1). */
  reverb?: number;
  /** Seconds a pad / lead / sub takes to fade in. */
  attack?: number;
  /** Seconds a note fades out after its written length. */
  release?: number;
  /** Seconds a bell / musicbox keeps ringing (default 2.5 / 1.3). */
  ring?: number;
  /** Shift every note by this many semitones. */
  transpose?: number;
}

/** Drum patterns: a string of steps (`x` hit, `o` soft hit, `.` nothing), one step = 1/`grid` of a beat. The pattern repeats; `from` / `to` (beats) limit where it plays. */
export type MusicDrums = { [D in MusicDrum]?: string } & { from?: number; to?: number };

export interface MusicOptions {
  /** Beats per minute, or `[beat, bpm]` points for a tempo change (a ritardando: `[[0, 96], [28, 96], [32, 60]]`). */
  bpm: number | Array<[number, number]>;
  tracks?: MusicTrack[];
  /** Drum patterns that repeat, or a list of them with `from` / `to` (beats) for sections. */
  drums?: MusicDrums | MusicDrums[];
  /** Drum steps per beat (default 4: sixteenth notes; 3 for a triplet / 6/8 feel; 2 for eighths). */
  grid?: number;
  /** Delays the off-beat eighths and sixteenths by this much of a beat, 0–0.4 (default 0). */
  swing?: number;
  /** Reverb amount 0–0.6 (default 0.22). */
  reverb?: number;
  /** Seeded timing jitter in seconds (default 0.012; 0 = exact). */
  humanize?: number;
  /** Level of the drums 0–1 (default 0.8). */
  drumVol?: number;
  /** Shift every pitched track by this many semitones. */
  transpose?: number;
  /** Seconds of reverb tail after the last note (default 2.5). */
  tail?: number;
  /** Same seed, same music (default 1). */
  seed?: number;
}

/**
 * Plays music written as text, with no audio file. `duration` defaults to the music's length plus its tail; shorter cuts it (with a
 * short fade), longer is silent after the music unless `loop: true`, which repeats it until the layer ends.
 */
export interface AudioMusicSpec extends AudioBase {
  music: MusicOptions;
  asset?: never;
  sfx?: never;
  /** Repeat the music for the whole `duration` (default: until the composition ends). */
  loop?: boolean;
}

export type AudioSequenceSpec = AudioAssetSpec | AudioSfxSpec | AudioMusicSpec;
export interface CompositionSequenceSpec extends SequenceCommon {
  type: 'composition';
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
  /**
   * The speed of this composition's own time: 2 = its content runs twice as fast, 0.5 = slow motion, negative = backward. The layers
   * inside write `at` / `duration` / `keyframes` in THIS time (the composition's local time); the composition's own `at`, `duration`
   * and keyframes stay in the outer time. To change the speed over time, animate `time` (the local playhead, in seconds).
   */
  speed?: number;
}

/**
 * A camera layer. Put its props in `initial` / `keyframes`:
 * `x`, `y`, `z`, `lookAtX`, `lookAtY`, `lookAtZ`, `fov` (vertical degrees, default 40), and `offsetX` / `offsetY` / `offsetZ` /
 * `lookOffsetX` / `lookOffsetY` / `lookOffsetZ` (default 0): added to the position and to the look-at point, so a shake (`wiggle`) on them
 * never collides with the camera's own moves.
 * Unset `z` follows `fov` so the z = 0 plane stays 1:1. Affects only `threeD`
 * siblings in the same composition. +z points toward the viewer.
 */
export interface CameraSequenceSpec extends SequenceCommon {
  type: 'camera';
}

/**
 * A light layer. Like the camera it draws nothing; put its props in `initial` / `keyframes`:
 * `x y z lookAtX lookAtY lookAtZ intensity color coneAngle coneFeather radius falloffDistance shadowDarkness shadowDiffusion`.
 */
export interface LightSequenceSpec extends SequenceCommon {
  type: 'light';
  /** `ambient`: a flat colour everywhere; `point`: from a position in every direction; `spot`: a point limited to a cone around the direction to its look-at point; `parallel`: a direction only (the sun). Default `'point'`. */
  kind?: 'ambient' | 'point' | 'spot' | 'parallel';
  /** How a point or spot light weakens with distance. Default `'none'`. */
  falloff?: 'none' | 'smooth' | 'inverseSquare';
}

/**
 * A shader layer: a Shadertoy fragment shader drawn into a picture. Everything a layer can do works on it (initial, keyframes, mask, filters,
 * blendMode, threeD, lights).
 */
export interface ShaderSequenceSpec extends SequenceCommon {
  type: 'shader';
  /** A Shadertoy fragment shader: write `void mainImage(out vec4 fragColor, in vec2 fragCoord)` (GLSL ES 3.00). `iResolution`, `iTime` (this layer's own seconds) and `iFrame` are declared for you, and so is every name in `uniforms`. */
  fragment: string;
  /** Numbers (`float`), arrays of 2–4 numbers (`vec2` … `vec4`) and colours (`'#ff8040'` → `vec3`), animated with keyframes as `'uniforms.speed'` (a component of a vector or a colour: `'uniforms.tint.0'`). */
  uniforms?: Record<string, number | number[] | string>;
  /** Layer size in px (expressions allowed). Default: the composition's size. */
  width?: number | string;
  height?: number | string;
  /** Draw at this fraction of the layer size and scale up (0.5 = a quarter of the pixels). Default 1. */
  resolution?: number;
  /** `true`: the shader's alpha is used (premultiplied). Default `false`: opaque. */
  transparent?: boolean;
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

/**
 * A gradient fill for a shape (replaces `fillColor`). Positions are relative to the shape's own
 * bounds (0–1), so it follows the shape's size. Colours may have alpha (`'rgba(0,0,0,0.6)'`), so a
 * radial gradient from transparent to dark is a vignette. Animatable on shapes and text: a keyframe's `set` / `from` / `to` carries a partial `fillGradient` (see KeyframeProps).
 */
export interface GradientSpec {
  /** Default `'linear'`. */
  type?: 'linear' | 'radial';
  /** Colour stops, `[offset 0–1, colour]` or `{ offset, color }`. At least two. */
  stops: Array<[number, string | number] | { offset: number; color: string | number }>;
  /** linear: direction in degrees — 0 = left → right, 90 = top → bottom (default). */
  angle?: number;
  /** radial: centre in 0–1 of the bounds. Default `[0.5, 0.5]`. */
  center?: [number, number];
  /** radial: inner radius where the first stop applies, 0–1. Default 0. */
  innerRadius?: number;
  /** radial: outer radius where the last stop applies, 0–1. Default 0.5. */
  radius?: number;
}

/**
 * Stroke trim (draw-on): the part of the outline that is stroked, as fractions 0–1 of its length. Animate `trimEnd`
 * from 0 to 1 to draw a line / path / outline on; animate both for a travelling dash. The outline of a rect starts at
 * its top-left and goes clockwise, of a circle / ellipse at 12 o'clock and goes clockwise; a polygon's closing edge counts.
 * The fill is not trimmed. Not for `arc` (animate its `endAngle`).
 */
export interface Trimmable {
  /** Where the stroke starts, 0–1 of the outline. Default 0. Animatable. */
  trimStart?: PropValue;
  /** Where the stroke ends, 0–1 of the outline. Default 1. Animatable. */
  trimEnd?: PropValue;
  /** A path with several sub-paths: `true` trims each sub-path on its own, so they all draw on at the same time (default: the trim walks them in order, as one outline). */
  trimEach?: boolean;
}

interface ShapeBase extends SequenceCommon {
  type: 'shape';
  /** Fill with a gradient instead of `fillColor` (top level or in `initial`). */
  fillGradient?: GradientSpec;
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
  /** How an open stroke ends: `'butt'` (default), `'round'` (a friendly progress-ring end) or `'square'`. Top level or in `initial`. */
  strokeCap?: 'butt' | 'round' | 'square';
  /** How stroke corners join: `'miter'` (default; sharp points can poke out), `'round'` or `'bevel'`. Top level or in `initial`. */
  strokeJoin?: 'miter' | 'round' | 'bevel';
}

export interface RectShapeSpec extends ShapeBase, Trimmable {
  shape: 'rect';
  width: PropValue;
  height: PropValue;
  /** Rounded corner radius. Default 0 (sharp). */
  cornerRadius?: PropValue;
  /**
   * Where the local origin sits relative to the rect's bounding box.
   * `0` = left / top edge, `0.5` = centre (default), `1` = right / bottom
   * edge. Animating `width` with `anchorX: 0` makes the bar grow
   * rightward (progress-bar style) without the left edge drifting.
   */
  anchorX?: PropValue;
  anchorY?: PropValue;
}

export interface CircleShapeSpec extends ShapeBase, Trimmable {
  shape: 'circle';
  radius: PropValue;
  /** See RectShapeSpec.anchorX. Default 0.5 (centre). */
  anchorX?: PropValue;
  anchorY?: PropValue;
}

export interface EllipseShapeSpec extends ShapeBase, Trimmable {
  shape: 'ellipse';
  radiusX: PropValue;
  radiusY: PropValue;
  /** See RectShapeSpec.anchorX. Default 0.5 (centre). */
  anchorX?: PropValue;
  anchorY?: PropValue;
}

/**
 * An arc around the local origin (its centre). Angles are in degrees: 0 = 3 o'clock, positive = clockwise,
 * so a progress ring starts at `startAngle: -90` (12 o'clock) and animates `endAngle` from -90 to 270.
 * With a stroke and no fill it is an open arc line (`strokeCap: 'round'` for rounded ends); with a fill it is a
 * sector (a pie slice), and with `innerRadius` a ring segment (a donut slice). A sweep of 360° or more is a full circle.
 */
export interface ArcShapeSpec extends ShapeBase {
  shape: 'arc';
  radius: PropValue;
  /** Hole radius of a filled ring segment. Default 0 (a pie slice to the centre). Animatable. */
  innerRadius?: PropValue;
  /** Degrees. Default 0. Animatable. */
  startAngle?: PropValue;
  /** Degrees. Default 360. Animatable. */
  endAngle?: PropValue;
}

export interface LineShapeSpec extends ShapeBase, Trimmable {
  shape: 'line';
  /** Line endpoints relative to the shape's local origin. */
  from: [PropValue, PropValue];
  to: [PropValue, PropValue];
}

export interface PolygonShapeSpec extends ShapeBase, Trimmable {
  shape: 'polygon';
  /** Vertices in local space. The path is auto-closed. */
  points: Array<[PropValue, PropValue]>;
  /** When true, draw an open polyline instead of a closed polygon. Default false. */
  open?: boolean;
}

export interface PathShapeSpec extends ShapeBase, Trimmable {
  shape: 'path';
  /** SVG path data (`d` attribute). Goes through PIXI's GraphicsContext.svg(). */
  d: string;
  /**
   * A second outline (SVG path data, in the same canvas coordinates as `d`) to morph into. Animate `morph` from 0 (the
   * `d` outline) to 1 (this one); in between the layer is drawn as a polygon of points half way from one to the other.
   * Sub-paths are paired in order (an extra one grows from / shrinks to its centre), and closed outlines are lined up so
   * they do not twist.
   */
  morphTo?: string;
  /** How far the morph has gone, 0–1 (animatable, top level or in `initial`). Needs `morphTo`. Default 0. */
  morph?: number;
  /** Points per sub-path the outlines are sampled at for the in-between shapes (8–2048, default 128). */
  morphPoints?: number;
}

export type ShapeSequenceSpec =
  | RectShapeSpec
  | CircleShapeSpec
  | EllipseShapeSpec
  | ArcShapeSpec
  | LineShapeSpec
  | PolygonShapeSpec
  | PathShapeSpec;

/**
 * A layer that draws nothing, only moves: the parent of other layers (`parent: 'name'`). Animate `x y rotation scale
 * scaleX scaleY skewX skewY alpha pivotX pivotY` in `initial` / `keyframes` like any layer; its children follow.
 */
export interface NullSequenceSpec extends SequenceCommon {
  type: 'null';
}

export type SequenceSpec =
  | NullSequenceSpec
  | VideoSequenceSpec
  | ImageSequenceSpec
  | TextSequenceSpec
  | AudioSequenceSpec
  | CompositionSequenceSpec
  | CameraSequenceSpec
  | LightSequenceSpec
  | ShaderSequenceSpec
  | ShapeSequenceSpec;

/** Top-level composition (root node) — same as `CompositionSequenceSpec` minus the discriminant. */
export interface CompositionSpec extends SequenceCommon {
  width?: number;
  height?: number;
  sequences?: SequenceSpec[];
  transitions?: TransitionSpec[];
  /**
   * Where a presentation pauses: seconds, or `{ at, page?, notes?, advance? }` (see `StopSpec`). A stop with `page` begins a page, the others
   * are steps of it; with no `page` anywhere each stop is a page. Nothing changes for an ordinary player: `Presenter` (and `movie.next()`)
   * stop at them, `Controller` shows them as marks on the seek bar.
   */
  stops?: Array<number | import('./core/stops').StopSpec>;
}

// ─── Internal shape types (used by sequences and core) ────────────────────

/** Resolved parent / root composition shape used for scope and sizing. */
export interface CompositionShape {
  width: number;
  height: number;
  duration: number;
  /** The movie's frame rate, on the root shape only (a shader layer's `iFrame` needs it). */
  frameRate?: number;
  /** Called after each layer is built (the root shape only): feeds `loadprogress` and lets the page paint now and then. */
  onLayerBuilt?: () => void | Promise<void>;
}

/** Audio descriptor pushed to the mixdown queue by AudioSequence/VideoSequence. */
export interface AudioDescriptor {
  /** Decoded audio (a file or a video's soundtrack). Exactly one of `buffer` / `synth` is set. */
  buffer?: AudioBuffer;
  /** Stereo samples (left, right) made on demand at the mix's sample rate (a synthesised sfx). Equal keys render equal samples. */
  synth?: { key: string; render: (sampleRate: number) => [Float32Array, Float32Array] };
  /** Who made it, for warnings and inspectAudio: `layer "pop-1"`. */
  layer?: string;
  /** What it plays: `sfx "pop"`, `asset "bgm"`, `video "green"`. */
  source?: string;
  loop: boolean;
  start: number;
  end: number;
  initialVolume: number;
  volumeKeyframes: { time: number; value: number }[];
  /**
   * Time remap. `warp` maps the movie's time to the time `start` / `end` / `volumeKeyframes` are measured in (a remapped composition's
   * local time), NaN where it is silent. `sourceMap` maps that time to a position in the sound (the layer's own speed / `time`); absent:
   * the sound plays straight from `start`. The mixer resamples through them, so a speed other than 1 changes the pitch.
   */
  warp?: (t: number) => number;
  sourceMap?: (u: number) => number;
}
