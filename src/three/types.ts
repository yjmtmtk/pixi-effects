import type { Camera, Scene, WebGLRenderer } from 'three';
import type { SequenceCommon, PropValue } from '../types';

/** Handed to setup / update / dispose. One per three sequence. */
export interface ThreeContext {
  scene: Scene;
  /** Default: PerspectiveCamera(50, width/height, 0.1, 2000). Replaced when setup returns { camera }. */
  camera: Camera;
  renderer: WebGLRenderer;
  /** Resolved layer size in composition px. */
  width: number;
  height: number;
}

export interface ThreeSetupResult {
  /** Objects addressable from keyframes as `three.<name>.<path>`. `camera` is added implicitly unless present. */
  objects?: Record<string, object>;
  /** Replaces the default camera. */
  camera?: Camera;
}

export interface ThreeSequenceSpec extends SequenceCommon {
  type: 'three';
  /** Layer size in composition px. Expressions allowed (e.g. 'W * 0.5'). Default: parent composition size. */
  width?: PropValue;
  height?: PropValue;
  /** Supersampling factor for the offscreen canvas. Default 1. */
  resolution?: number;
  /**
   * Build the scene. Add objects to `ctx.scene`, position `ctx.camera`
   * (or replace it entirely by returning `{ camera }`). Async so GLTF /
   * texture loading can be awaited — Movie.init waits for it.
   */
  setup: (ctx: ThreeContext) => Promise<ThreeSetupResult | void> | ThreeSetupResult | void;
  /**
   * Optional per-frame hook; `t` is sequence-local time in seconds.
   * MUST derive state purely from `t` (no wall clock, no unseeded
   * randomness) — playback and export both seek arbitrarily and must
   * produce identical frames.
   */
  update?: (t: number, ctx: ThreeContext) => void;
  /** Cleanup for user-created GPU resources (geometries, materials, textures). Called from destroy(). */
  dispose?: (ctx: ThreeContext) => void;
}
