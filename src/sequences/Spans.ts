// The sequence behind a text layer with `spans`: a composition of ordinary text layers (see src/text/spans.ts) that also owns the typewriter
// (`visibleChars`) of the whole text: it counts over every character of every piece, and tells each piece how many of its own to show.
import { CompositionSequence } from './Composition';
import { TextSequence, bindCounterKeyframes, resolveNumber, type CounterState } from './Text';
import { spansMeta, type SpansMeta } from '../text/spans';
import type { CompositionShape, SequenceSpec, Props } from '../types';
import type { Timeline } from '../core/timelineEngine';

const strip = (props: Props | undefined): Props | undefined => {
  if (!props || !('visibleChars' in props)) return props;
  const { visibleChars: _gone, ...rest } = props as Record<string, unknown>;
  return rest as unknown as Props;
};

export class SpansSequence extends CompositionSequence {
  private readonly _meta: SpansMeta | undefined;
  private readonly _count: CounterState = { value: 0, visibleChars: 0 };

  constructor(spec: SequenceSpec, parent: CompositionShape | null, root: CompositionShape) {
    super(spec, parent, root);
    this._meta = spansMeta.get(spec);
  }

  /** `visibleChars` is the group's own counter, not a property to write on the container. */
  protected override displayProps(): { initial: CompositionSequence['spec']['initial']; keyframes: CompositionSequence['spec']['keyframes'] } {
    const p = super.displayProps();
    if (!this._meta?.typed) return p;
    return {
      initial: strip(p.initial as Props | undefined) as never,
      keyframes: p.keyframes?.map(kf => ({ ...kf, set: strip(kf.set), to: strip(kf.to), from: strip(kf.from) })),
    };
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    if (!this._meta?.typed) return;
    const scope = this.scope();
    const first = (this.spec.initial as Record<string, unknown> | undefined)?.visibleChars;
    this._count.visibleChars = first === undefined ? 0 : resolveNumber(first, scope);          // like a text: it starts at 0 once it is animated
    bindCounterKeyframes(timeline, this._count, 'visibleChars', () => this._distribute(), this.spec.keyframes ?? [], this.duration!, offset + this.at, scope);
    this._distribute();
  }

  /** Every piece shows its part of the first N characters of the whole text. */
  private _distribute(): void {
    const pieces = this._meta!.pieces;
    const total = Math.max(0, Math.floor(this._count.visibleChars));
    let i = 0;
    for (const child of this._children) {
      if (!(child instanceof TextSequence)) continue;
      const p = pieces[i++];
      if (p) child.setVisibleChars(Math.min(p.length, Math.max(0, total - p.start)));
    }
  }
}
