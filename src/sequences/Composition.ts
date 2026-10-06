import { Container, Rectangle } from 'pixi.js';
import { Sequence } from './Base';
import { buildSequenceTree } from '../core/Composition';
import { CameraSequence } from '../space/CameraSequence';
import { findOverlap, pickActiveCamera } from '../space/camera';
import { assignDepthOrder } from '../space/depth';
import { Layer3D, type SpaceHost } from '../space/Layer3D';
import { lintSequence } from '../space/lint';
import { describeLayer, lintText, lintTiming } from '../core/lint';
import { cameraBasis, homeCamera } from '../space/math';
import type { CompositionSequenceSpec, AudioDescriptor, CompositionShape, SequenceSpec } from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export class CompositionSequence extends Sequence {
  declare spec: CompositionSequenceSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  _children: Sequence[] = [];
  private _cameras: CameraSequence[] = [];
  private _layers3d: Layer3D[] = [];
  /** Drawn children in stack order (cameras and target-less sequences excluded). */
  private _visual: Array<{ seq: Sequence; layer: Layer3D | null }> = [];

  async build(): Promise<void> {
    const width = this.spec.width ?? this.parent?.width ?? this.root.width;
    const height = this.spec.height ?? this.parent?.height ?? this.root.height;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? this.parent?.duration ?? this.root.duration;
    }
    const wrapper = new Container();
    wrapper.cullable = true;
    wrapper.cullableChildren = true;
    wrapper.cullArea = new Rectangle(0, 0, width, height);

    const inner = new Container();
    inner.cullable = true;
    inner.cullableChildren = true;
    wrapper.addChild(inner);

    this.target = wrapper;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;
    this._innerContainer = inner;
    this._compositionShape = { width, height, duration: this.duration };

    for (const s of this.spec.sequences ?? []) {
      lintSequence(s);
      lintTiming(s, this.duration);
      lintText(s);
    }

    this._children = await buildSequenceTree(
      this.spec.sequences ?? [],
      this._compositionShape,
      this.root,
    );
    for (const child of this._children) {
      // Cameras are display-less: they only feed the projection pass.
      if (child instanceof CameraSequence) {
        this._cameras.push(child);
        continue;
      }
      if (!child.target) continue;

      const maskSpec = (child.spec as { mask?: SequenceSpec }).mask;

      // threeD layers never enter the scene graph themselves: their display
      // object is rendered into a texture and a perspective mesh stands in.
      if (child.spec.threeD) {
        const layer = new Layer3D(child, frameOf(child));
        inner.addChild(layer.display);
        this._layers3d.push(layer);
        this._visual.push({ seq: child, layer });
        if (maskSpec) {
          console.warn(`pixi-effects: ${describeLayer(child.spec)}: mask is not supported on threeD layers yet; ignored`);
        }
        continue;
      }

      inner.addChild(child.target);
      this._visual.push({ seq: child, layer: null });
      // If this child has a `mask` spec, build the mask sequence in the same
      // composition shape, add its target to the same parent (so its
      // transforms resolve in the same coord space), and wire PIXI's
      // mask channel. PIXI v8 renders mask containers into the stencil /
      // alpha buffer; they don't render as normal children.
      if (maskSpec) {
        const built = await buildSequenceTree([maskSpec], this._compositionShape, this.root);
        const maskSeq = built[0];
        if (maskSeq?.target) {
          inner.addChild(maskSeq.target);
          // PIXI v8 `setMask` accepts an `inverse` flag — that's how we
          // expose `maskInverted` from the spec. Falls back to plain
          // `target.mask = …` for runtimes that don't have setMask
          // (older PIXI builds).
          const inverse = (child.spec as { maskInverted?: boolean }).maskInverted ?? false;
          const t = child.target as Container & {
            setMask?: (opts: { mask: Container | null; inverse?: boolean }) => void;
            mask: Container | null;
          };
          if (typeof t.setMask === 'function') {
            t.setMask({ mask: maskSeq.target, inverse });
          } else {
            t.mask = maskSeq.target;
          }
          child.maskSequence = maskSeq;
        }
      }
    }

    if (this._layers3d.length > 0) {
      // Stack order becomes explicit zIndex so threeD layers can be re-sorted
      // by depth each frame without reparenting.
      inner.sortableChildren = true;
      this._visual.forEach((v, i) => {
        (v.layer?.display ?? v.seq.target!).zIndex = i;
      });
    } else if (this._cameras.length > 0) {
      console.warn('pixi-effects: camera has no effect: this composition has no threeD layers');
    }

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    // Children's `at` is relative to this composition's start, so push them
    // forward by our absolute start time on the global timeline.
    const childOffset = offset + this.at;
    for (const child of this._children) {
      child.bindTimeline(timeline, childOffset);
      // The mask shares the maskee's offset — its `at` is interpreted
      // relative to the composition's start, just like the child itself,
      // so a reveal-from-zero animation lines up naturally.
      child.maskSequence?.bindTimeline(timeline, childOffset);
    }
    const overlap = findOverlap(this._cameras.map(c => c.window()));
    if (overlap) {
      console.warn(`pixi-effects: cameras #${overlap[0] + 1} and #${overlap[1] + 1} overlap in time; the top-most one wins`);
    }
  }

  /** Drawn children in stack order, with the display object that stands in for each (the mesh for a threeD layer). */
  layers(): Array<{ seq: Sequence; display: Container; threeD: boolean }> {
    return this._visual.map(v => ({
      seq: v.seq,
      display: (v.layer?.display ?? v.seq.target!) as unknown as Container,
      threeD: v.layer !== null,
    }));
  }

  override syncFrame(): void {
    super.syncFrame();
    for (const child of this._children) child.syncFrame();
  }

  override updateSpace(t: number, host: SpaceHost): void {
    // Inner compositions first: a threeD composition is rendered into its own
    // texture by this level, so its content must already be projected.
    for (const child of this._children) child.updateSpace(t, host);
    if (this._layers3d.length === 0 || !this._compositionShape) return;

    const { width, height } = this._compositionShape;
    const compEnd = (this.absoluteStart ?? 0) + (this.duration ?? 0);
    const active = pickActiveCamera(
      this._cameras.map(cam => ({ cam, ...cam.window() })),
      t,
      compEnd,
    );
    const basis = cameraBasis(active ? active.cam.state() : homeCamera(width, height), width, height);

    for (const layer of this._layers3d) layer.update(host, basis);

    const order = assignDepthOrder(
      this._visual.map((v, i) => ({ stackIndex: i, threeD: v.layer !== null, depth: v.layer?.depth ?? 0 })),
    );
    this._visual.forEach((v, i) => {
      if (v.layer) v.layer.display.zIndex = order[i]!;
    });
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    super.collectAudio(out, baseTime);
    const childBase = baseTime + this.at;
    for (const child of this._children) child.collectAudio(out, childBase);
  }

  override destroy(): void {
    for (const l of this._layers3d) l.destroy();
    this._layers3d = [];
    for (const c of this._children) c.destroy();
    super.destroy();
  }
}

/** Layer-space rectangle a threeD child projects: a composition's frame, otherwise its content bounds. */
function frameOf(child: Sequence): () => { x: number; y: number; width: number; height: number } {
  if (child instanceof CompositionSequence) {
    return () => ({ x: 0, y: 0, width: child.intrinsicWidth, height: child.intrinsicHeight });
  }
  return () => child.target!.getLocalBounds();
}
