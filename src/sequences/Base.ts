import type { Container } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import { applyKeyframes, applyInitial, type PathRouters } from '../core/Timeline';
import { buildScope, type Scope } from '../expr/Scope';
import { createFilter, type NamedFilter } from '../filters';
import type { CompositionShape, SequenceSpec, AudioDescriptor } from '../types';
import type { SpaceHost } from '../space/Layer3D';
import type { Timeline } from '../core/timelineEngine';



export abstract class Sequence {
  spec: SequenceSpec;
  parent: CompositionShape | null;
  root: CompositionShape;
  target: Container | null = null;
  intrinsicWidth = 0;
  intrinsicHeight = 0;
  at: number;
  duration: number | undefined;
  filters: NamedFilter[] = [];
  /**
   * Mask sequence built from `spec.mask`, if any. Built and added to the
   * scene graph by the parent CompositionSequence; rendered as a mask
   * (not a normal child) by PIXI when `target.mask = maskSequence.target`.
   */
  maskSequence: Sequence | null = null;
  /**
   * Set by the parent composition on a sprite-based (image / video) mask. PIXI hides such a mask with
   * `renderable = false`; the lifespan toggles must not switch it back on, or the mask is drawn as a picture.
   */
  keepHidden = false;
  /**
   * Absolute start time on the global timeline (offset + at), recorded by
   * bindTimeline. Movie._awaitVideoFrames uses it to determine the correct
   * time to pass to awaitFrameAt. Subclasses that override bindTimeline
   * without calling super must set this field themselves. Null until bound.
   */
  absoluteStart: number | null = null;

  constructor(spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape) {
    this.spec = spec;
    this.parent = parent;
    this.root = root;
    this.at = spec.at ?? 0;
    this.duration = spec.duration;
  }

  abstract build(): Promise<void>;

  buildFilters(): void {
    const specs = this.spec.filters ?? [];
    this.filters = specs.map(createFilter);
    if (this.target && 'filters' in this.target) {
      (this.target as unknown as { filters: NamedFilter[] }).filters = this.filters;
    }
    // Honor an explicit filterArea override (e.g. set by expandTransitions so
    // a wipe / iris filter on a small text sprite still covers the whole
    // composition rather than being clipped to the text bbox).
    const fa = this.spec.filterArea;
    if (fa && this.target) {
      this.target.filterArea = new Rectangle(fa.x, fa.y, fa.width, fa.height);
    }
  }

  scope(): Scope {
    return buildScope(this, this.parent, this.root);
  }

  /**
   * Prefix routers contributed to the keyframe pipeline (e.g. `three.` in
   * pixi-effects/three). Base sequences route nothing extra.
   */
  protected pathRouters(): PathRouters {
    return {};
  }

  /**
   * The `initial` and `keyframes` that go onto the display object. A layer whose `time` runs a clock (video, composition) takes `time`
   * out of them: it is not a property of the display object.
   */
  protected displayProps(): { initial: SequenceSpec['initial']; keyframes: SequenceSpec['keyframes'] } {
    return { initial: this.spec.initial, keyframes: this.spec.keyframes };
  }

  bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const scope = this.scope();
    const routers = this.pathRouters();
    // Keyframe `at` is measured from THIS sequence's start (After Effects style),
    // and negative `at` back from its end — so the origin is offset + this.at.
    const startTime = offset + this.at;
    const { initial, keyframes } = this.displayProps();
    applyInitial(this.target, initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>, [], routers);
    applyKeyframes(timeline, this.target, keyframes, this.duration!, scope as unknown as Record<string, number>, [], startTime, routers);
    // Hide before lifespan starts. GSAP's `set` only fires when the playhead
    // crosses its time, so without this baseline a sequence with at>0 (or any
    // non-zero offset from a nested composition) would render at t<startTime
    // on PIXI's default `renderable: true`.
    const endTime = startTime + this.duration!;
    this.absoluteStart = startTime;
    if (this.keepHidden) return;                    // a sprite mask: PIXI keeps it hidden (see keepHidden)
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }

  collectAudio(_out: AudioDescriptor[], _baseTime: number): void {
    // default: no audio
  }

  /**
   * 2.5D hook. Runs once per rendered frame, after the timeline seek and the
   * per-frame media sync, before the render. Compositions override it to
   * project their `threeD` layers; everything else has nothing to do.
   */
  updateSpace(_t: number, _host: SpaceHost): void {
    // default: nothing to project
  }

  /**
   * Runs once per rendered frame, after the timeline seek and before the cull. Layers whose drawn
   * geometry follows tweened state (shapes) redraw here, so the culler measures where the layer is NOW
   * and not where it was drawn at the previous render.
   */
  syncFrame(): void {
    this.maskSequence?.syncFrame();
  }

  destroy(): void {
    this.maskSequence?.destroy();
    this.maskSequence = null;
    this.target?.destroy?.();
    this.target = null;
  }
}
