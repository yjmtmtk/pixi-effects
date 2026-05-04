import { Container, Rectangle } from 'pixi.js';
import { Sequence } from './Base';
import { buildSequenceTree } from '../core/Composition';
import type { CompositionSequenceSpec, AudioDescriptor, CompositionShape, SequenceSpec } from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

export class CompositionSequence extends Sequence {
  declare spec: CompositionSequenceSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  _children: Sequence[] = [];

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

    this._children = await buildSequenceTree(
      this.spec.sequences ?? [],
      this._compositionShape,
      this.root,
    );
    for (const child of this._children) {
      if (child.target) inner.addChild(child.target);
      // If this child has a `mask` spec, build the mask sequence in the same
      // composition shape, add its target to the same parent (so its
      // transforms resolve in the same coord space), and wire PIXI's
      // mask channel. PIXI v8 renders mask containers into the stencil /
      // alpha buffer; they don't render as normal children.
      const maskSpec = (child.spec as { mask?: SequenceSpec }).mask;
      if (maskSpec && child.target) {
        const built = await buildSequenceTree([maskSpec], this._compositionShape, this.root);
        const maskSeq = built[0];
        if (maskSeq?.target) {
          inner.addChild(maskSeq.target);
          (child.target as { mask: Container | null }).mask = maskSeq.target;
          child.maskSequence = maskSeq;
        }
      }
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
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    super.collectAudio(out, baseTime);
    const childBase = baseTime + this.at;
    for (const child of this._children) child.collectAudio(out, childBase);
  }

  override destroy(): void {
    for (const c of this._children) c.destroy();
    super.destroy();
  }
}
