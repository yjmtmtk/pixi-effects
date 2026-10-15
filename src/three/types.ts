import type { Camera, Scene, WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { SequenceCommon, PropValue } from '../types';

/** Handed to setup / update / dispose. One per three sequence. */
export interface ThreeContext {
  scene: Scene;
  /** Default: PerspectiveCamera(50, width/height, 0.1, 2000). Replaced when setup returns { camera }. */
  camera: Camera;
  /** The renderer the layer draws with: a WebGLRenderer, or a WebGPURenderer when the spec says `renderer: 'webgpu'`. */
  renderer: WebGLRenderer | WebGPURenderer;
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
  /**
   * Which three.js renderer draws the layer: `'webgl'` (the default, `WebGLRenderer`) or `'webgpu'` (`WebGPURenderer` from `three/webgpu`: it needs three 0.17x or later and
   * `three/webgpu` in the import map; three itself falls back to its WebGL2 backend where the browser has no WebGPU). Materials that rewrite three's shaders
   * (`onBeforeCompile`, `ShaderMaterial`) do not run on the WebGPU renderer.
   */
  renderer?: 'webgl' | 'webgpu';
  /**
   * Multisampling of the layer's own canvas. Default `true`. Turn it off (and use `resolution` for supersampling) when the WebGL and WebGPU renderers must give the same picture:
   * WebGPURenderer resolves the multisampling in linear light BEFORE tone mapping and the sRGB encode, WebGLRenderer after them, so a thin, hot edge comes out brighter on WebGPU.
   */
  antialias?: boolean;
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
