import type { Container } from 'pixi.js';
import { applyKeyframes, applyInitial } from '../core/Timeline';
import { buildScope, type Scope } from '../expr/Scope';
import { createFilter, type NamedFilter } from '../filters';
import type { CompositionShape, SequenceSpec, AudioDescriptor } from '../types';

import type { gsap } from 'gsap';
type Timeline = ReturnType<typeof gsap.timeline>;

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
  }

  scope(): Scope {
    return buildScope(this, this.parent, this.root);
  }

  bindTimeline(timeline: Timeline, offset = 0): void {
    if (!this.target) return;
    const scope = this.scope();
    applyInitial(this.target, this.spec.initial as Record<string, unknown> | undefined, scope as unknown as Record<string, number>);
    applyKeyframes(timeline, this.target, this.spec.keyframes, this.duration!, scope as unknown as Record<string, number>, [], offset);
    // Hide before lifespan starts. GSAP's `set` only fires when the playhead
    // crosses its time, so without this baseline a sequence with at>0 (or any
    // non-zero offset from a nested composition) would render at t<startTime
    // on PIXI's default `renderable: true`.
    const startTime = offset + this.at;
    const endTime = startTime + this.duration!;
    this.target.renderable = startTime <= 0;
    timeline.set(this.target, { renderable: true }, startTime);
    timeline.set(this.target, { renderable: false }, endTime);
  }

  collectAudio(_out: AudioDescriptor[], _baseTime: number): void {
    // default: no audio
  }

  destroy(): void {
    this.target?.destroy?.();
    this.target = null;
  }
}
