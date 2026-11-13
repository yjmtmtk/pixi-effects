import type { Renderer } from 'pixi.js';
import type { Camera3D, Container3D, View3D, View3DOptions } from '@pixi/3d';
import type { SequenceCommon, PropValue } from '../types';

/** Handed to setup / update / dispose. One per scene3d layer. */
export interface Scene3DContext {
  /** The PixiJS 3D view the layer shows: a PixiJS display object that draws the scene inside PixiJS's own renderer. */
  view: View3D;
  /** `view.root`: add the meshes, models and lights here. */
  root: Container3D;
  /** `view.camera`: the view owns its camera (fov in degrees, `mode` perspective or orthographic); place it with `position.set` and `lookAt`. */
  camera: Camera3D;
  /** PixiJS's renderer (the same one that draws every layer). */
  renderer: Renderer;
  /** The layer's size in composition px. */
  width: number;
  height: number;
  /** What setup returned in `objects`, plus `camera` and `view`: the names keyframes reach as `scene3d.<name>.<path>`. */
  objects: Record<string, object>;
}

export interface Scene3DSetupResult {
  /** Objects addressable from keyframes as `scene3d.<name>.<path>` (`camera` and `view` are added unless you name your own). */
  objects?: Record<string, object>;
}

export interface Scene3DSequenceSpec extends SequenceCommon {
  type: 'scene3d';
  /** Layer size in composition px. Expressions allowed (e.g. 'W * 0.5'). Default: the parent composition's size. */
  width?: PropValue;
  height?: PropValue;
  /**
   * Options for the PixiJS 3D view (`environment`, `toneMapping`, `exposure`, `shadowQuality`, `passes`, `cull`, ...). `width`, `height` and `autoResize` belong to the layer.
   * The layer draws with `cull: 'cpu'` unless you name one (the GPU cull of large batches is not the same from draw to draw on WebGPU).
   */
  view?: Omit<View3DOptions, 'width' | 'height' | 'autoResize'>;
  /** The view's resolution (1 draws at the layer's size; another value draws the scene at that scale and composites it). */
  resolution?: number;
  /** Build the scene: add objects to `ctx.root`, place `ctx.camera`. May be async (a model loads): Movie.init waits for it. */
  setup: (ctx: Scene3DContext) => Promise<Scene3DSetupResult | void> | Scene3DSetupResult | void;
  /**
   * Per frame; `t` is the layer's own time in seconds. MUST set everything from `t` (no clock, no unseeded randomness, no state carried from the last call):
   * playback, a seek and an export each draw a frame on its own. A model's clip: `model.player.getState(name).gotoAndStop(t)`.
   */
  update?: (t: number, ctx: Scene3DContext) => void;
  /** Cleanup for resources you made (the view and everything under its root are destroyed by the layer). */
  dispose?: (ctx: Scene3DContext) => void;
}
