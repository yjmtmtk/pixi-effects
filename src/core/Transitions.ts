import type {
  CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec,
  CrossfadeTransition, WipeTransition, IrisTransition, SlideTransition,
  Keyframe, FilterSpec,
} from '../types';
import { resolveAt } from './Timeline';
import { TransitionMaskFilter, type TransitionMode } from '../filters/TransitionMask';

/**
 * Pure function: validate the composition's `transitions[]` and rewrite the
 * spec by macro-expanding each transition into existing primitives (extra
 * keyframes / filters on the participating sequences). Returns a new spec
 * tree; does NOT mutate the input.
 *
 * Recurses into nested compositions.
 */
export function expandTransitions<T extends CompositionSpec | CompositionSequenceSpec>(spec: T): T {
  // Shallow-clone every sequence (and recurse into nested compositions) so we
  // can append keyframes / set initial without touching the user's input spec.
  const out = {
    ...spec,
    sequences: spec.sequences
      ? spec.sequences.map((s) => {
          const cloned: SequenceSpec = {
            ...s,
            // Deep-clone the mutation surfaces only.
            initial: 'initial' in s && s.initial ? { ...s.initial } : undefined,
            // Shallow: Keyframe / FilterSpec elements are shared references.
            // Expansion only pushes new literals — never mutate existing ones.
            keyframes: 'keyframes' in s && s.keyframes ? s.keyframes.slice() : undefined,
            filters:   'filters'   in s && s.filters   ? s.filters.slice()   : undefined,
          } as SequenceSpec;
          if (cloned.type === 'composition') return expandTransitions(cloned);
          return cloned;
        })
      : undefined,
  };
  if (!out.transitions || out.transitions.length === 0) {
    delete (out as { transitions?: unknown }).transitions;
    return out;
  }

  const transitions = out.transitions;
  const sequences = out.sequences ?? [];
  const parentDuration = out.duration ?? Infinity;

  // Build a name → { index, sequence } map for O(1) lookup, and detect duplicate names.
  const byName = new Map<string, { index: number; seq: SequenceSpec }>();
  for (let i = 0; i < sequences.length; i++) {
    const s = sequences[i]!;
    if (!s.name) continue;
    if (byName.has(s.name)) {
      throw new Error(`pixi-effects: composition has two sequences named "${s.name}" (transitions need unique names)`);
    }
    byName.set(s.name, { index: i, seq: s });
  }

  // Track usage so we can detect a sequence being the `from` of two transitions.
  const fromCount = new Map<string, number>();
  const toCount = new Map<string, number>();

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    const tag = `transitions[${i}] (${t.kind})`;

    if (t.from === t.to) {
      throw new Error(`pixi-effects: ${tag} cannot transition a sequence to itself ("${t.from}")`);
    }
    if (!(t.duration > 0)) {
      throw new Error(`pixi-effects: ${tag} duration must be > 0 (got ${t.duration})`);
    }

    const fromEntry = byName.get(t.from);
    if (!fromEntry) {
      throw new Error(`pixi-effects: ${tag} \`from\` "${t.from}" is not found among sibling sequences`);
    }
    const toEntry = byName.get(t.to);
    if (!toEntry) {
      throw new Error(`pixi-effects: ${tag} \`to\` "${t.to}" is not found among sibling sequences`);
    }

    if (toEntry.index <= fromEntry.index) {
      throw new Error(`pixi-effects: ${tag} \`to\` "${t.to}" must be declared after \`from\` "${t.from}" in sibling order`);
    }

    const fromUses = (fromCount.get(t.from) ?? 0) + 1;
    fromCount.set(t.from, fromUses);
    if (fromUses > 1) {
      throw new Error(`pixi-effects: ${tag} sequence "${t.from}" is used as \`from\` in more than one transition`);
    }

    const toUses = (toCount.get(t.to) ?? 0) + 1;
    toCount.set(t.to, toUses);
    if (toUses > 1) {
      throw new Error(`pixi-effects: ${tag} sequence "${t.to}" is used as \`to\` in more than one transition`);
    }

    // Time-coverage validation. Negative `at` ("from the end") is supported
    // for both the sequences and the transition itself; resolveAt() implements
    // that semantic, matching how `normalizeKeyframe` later resolves `at`
    // when the expansion's keyframes are built.
    const tStart = resolveAt(t.at, parentDuration);
    const tEnd = tStart + t.duration;
    const fromSeq = fromEntry.seq;
    const fromStart = resolveAt(fromSeq.at, parentDuration);
    const fromEnd = fromStart + (fromSeq.duration ?? parentDuration);
    if (tStart < fromStart || tEnd > fromEnd) {
      throw new Error(`pixi-effects: ${tag} window [${tStart}, ${tEnd}] is not covered by \`from\` "${t.from}" (lives [${fromStart}, ${fromEnd}], so it ends at ${fromEnd})`);
    }
    const toSeq = toEntry.seq;
    const toStart = resolveAt(toSeq.at, parentDuration);
    const toEnd = toStart + (toSeq.duration ?? parentDuration);
    if (tStart < toStart || tEnd > toEnd) {
      throw new Error(`pixi-effects: ${tag} window [${tStart}, ${tEnd}] is not covered by \`to\` "${t.to}" (lives [${toStart}, ${toEnd}], so it starts at ${toStart})`);
    }
    // Validation passed; expand this transition into existing primitives.
    switch (t.kind) {
      case 'crossfade':
        expandCrossfade(out, t, fromEntry.seq, toEntry.seq);
        break;
      case 'wipe':
        expandMask(out, t, fromEntry.seq, toEntry.seq, i, wipeMode(t.direction), t.smoothing);
        break;
      case 'iris':
        expandMask(out, t, fromEntry.seq, toEntry.seq, i, t.mode === 'out' ? 'iris-out' : 'iris-in', t.smoothing);
        break;
      case 'slide':
        expandSlide(out, t, fromEntry.seq, toEntry.seq);
        break;
    }
  }

  delete (out as { transitions?: unknown }).transitions;
  return out;
}

function ensureKeyframes(seq: SequenceSpec): Keyframe[] {
  // Sequences are loosely typed; treat keyframes as optional.
  const s = seq as { keyframes?: Keyframe[] };
  if (!s.keyframes) s.keyframes = [];
  return s.keyframes;
}

function ensureInitial(seq: SequenceSpec): Record<string, unknown> {
  const s = seq as { initial?: Record<string, unknown> };
  if (!s.initial) s.initial = {};
  return s.initial;
}

function ensureFilters(seq: SequenceSpec): FilterSpec[] {
  const s = seq as { filters?: FilterSpec[] };
  if (!s.filters) s.filters = [];
  return s.filters;
}

function expandCrossfade(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: CrossfadeTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  const ease = t.ease ?? 'none';

  // Outgoing sequence fades to alpha 0 over the window.
  const fromKfs = ensureKeyframes(fromSeq);
  fromKfs.push({ at: t.at, to: { alpha: 0 }, duration: t.duration, ease });

  // Incoming sequence starts invisible (initial.alpha = 0). Reject if user
  // already set initial.alpha — that would be a silent override.
  const toInitial = ensureInitial(toSeq);
  if (toInitial.alpha !== undefined && toInitial.alpha !== 0) {
    throw new Error(
      `pixi-effects: crossfade "${t.from}"→"${t.to}" requires "${t.to}" to start invisible, ` +
      `but it already has initial.alpha=${String(toInitial.alpha)}. Remove the manual setting.`,
    );
  }
  toInitial.alpha = 0;

  // Fade in.
  const toKfs = ensureKeyframes(toSeq);
  toKfs.push({ at: t.at, to: { alpha: 1 }, duration: t.duration, ease });
}

function wipeMode(direction: WipeTransition['direction']): TransitionMode {
  switch (direction) {
    case 'left':  return 'wipe-left';
    case 'right': return 'wipe-right';
    case 'up':    return 'wipe-up';
    case 'down':  return 'wipe-down';
  }
}

function transitionFilterName(index: number): string {
  return `_pe-transition-${index}`;
}

function expandSlide(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: SlideTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  const ease = t.ease ?? 'none';
  const isHorizontal = t.direction === 'left' || t.direction === 'right';
  const axis = isHorizontal ? 'x' : 'y';
  const dim = isHorizontal ? 'W' : 'H';
  // sign of A's motion: -1 for left/up, +1 for right/down. B starts on the
  // opposite side (so it can travel through the natural position in the same
  // direction A is leaving).
  const sign = (t.direction === 'left' || t.direction === 'up') ? -1 : 1;

  // Outgoing: slide A from its natural position to (natural ± W/H).
  const fromInitial = ensureInitial(fromSeq);
  const fromNatural = fromInitial[axis];
  const fromTarget = composeDimOffset(fromNatural, sign, dim);
  const fromKfs = ensureKeyframes(fromSeq);
  fromKfs.push({ at: t.at, to: { [axis]: fromTarget }, duration: t.duration, ease });

  // Incoming: B starts on the opposite side and slides back to its natural
  // position. We preserve the user's existing initial[axis] (if any) as the
  // destination, so a centered sequence stays centered after the slide.
  const toInitial = ensureInitial(toSeq);
  const toNatural = toInitial[axis];
  toInitial[axis] = composeDimOffset(toNatural, -sign, dim);
  const toKfs = ensureKeyframes(toSeq);
  toKfs.push({ at: t.at, to: { [axis]: (toNatural ?? 0) as string | number }, duration: t.duration, ease });
}

// Compose `natural + sign*dim` as a string expression (or short literal when
// natural is 0/undefined). `dim` is 'W' or 'H' (parent width/height), `sign`
// is +1 or -1.
function composeDimOffset(natural: unknown, sign: number, dim: 'W' | 'H'): string {
  const signed = sign === 1 ? dim : `-${dim}`;
  if (natural === undefined || natural === 0) return signed;
  if (typeof natural === 'number') {
    return sign === 1 ? `${natural} + ${dim}` : `${natural} - ${dim}`;
  }
  // String expression: parenthesize to keep precedence intact.
  return sign === 1 ? `(${String(natural)}) + ${dim}` : `(${String(natural)}) - ${dim}`;
}

function expandMask(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: WipeTransition | IrisTransition,
  _fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
  transitionIndex: number,
  mode: TransitionMode,
  smoothing: number | undefined,
): void {
  // Only the incoming sequence gets a mask. With standard alpha "over"
  // blending, an inverse mask on the outgoing would dim the smoothing zone
  // (B*0.5 + A*0.5*0.5 → 25% black bleed at the edge), and at p=0 the iris
  // smoothstep produces a half-visible centre pixel that shows through. The
  // assumption is that scenes are opaque (a solid background covers the
  // canvas) so B's reveal alone cleanly replaces A as `uProgress` advances.
  // Transparent / text-only scenes should crossfade rather than wipe.
  const ease = t.ease ?? 'none';
  const filterName = transitionFilterName(transitionIndex);

  const toFilters = ensureFilters(toSeq);
  rejectReservedNameCollision(toFilters, toSeq.name);
  toFilters.push({
    type: 'custom',
    name: filterName,
    filter: new TransitionMaskFilter({ mode, smoothing: smoothing ?? 0.02, progress: 0 }),
  });
  ensureKeyframes(toSeq).push({
    at: t.at,
    to: { [`filters.${filterName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
}

// User-supplied filters with the reserved prefix collide with our internal
// naming and should fail loud. Our own injected names (`_pe-transition-N`)
// are tolerated so a sequence can be `to` of one transition and `from` of
// another (the `from` side gets no filter today, but allowing the pattern
// keeps the door open for future expansion).
const OWN_NAME_PATTERN = /^_pe-transition-\d+$/;

function rejectReservedNameCollision(filters: FilterSpec[], seqName: string | undefined): void {
  for (const f of filters) {
    if (
      typeof f.name === 'string'
      && f.name.startsWith('_pe-transition-')
      && !OWN_NAME_PATTERN.test(f.name)
    ) {
      throw new Error(
        `pixi-effects: sequence "${seqName}" already has a filter named "${f.name}" — ` +
        `the reserved name prefix "_pe-transition-" is for internally generated transition filters`,
      );
    }
  }
}
