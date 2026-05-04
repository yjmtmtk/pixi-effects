import type {
  CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec,
  CrossfadeTransition, WipeTransition, IrisTransition, SlideTransition,
  DipTransition, ZoomTransition, DissolveTransition,
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
          if (cloned.type === 'composition') {
            // Nested composition inherits its parent's dimensions when not
            // explicitly set, so expandTransitions can compute filterArea
            // for any wipe / iris transitions inside it.
            const c = cloned as CompositionSequenceSpec;
            if (c.width === undefined) c.width = spec.width;
            if (c.height === undefined) c.height = spec.height;
            return expandTransitions(c);
          }
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
  const compW = out.width;
  const compH = out.height;

  // Pre-pass: any sequence participating in a transition that needs
  // composition-relative geometry gets wrapped in a full-composition-sized
  // wrapper Composition.
  //
  //   - mask transitions (wipe / iris / dissolve) need a target whose local
  //     coord origin matches the composition's world origin so the filter's
  //     canvas-relative math holds.
  //   - zoom needs the scale transform to rotate around the composition
  //     centre, not the sprite's top-left; the wrapper sits at the centre
  //     with pivot at the centre, so scaling stays centred.
  //
  // Wrapping is a no-op for sequences that are already full-size compositions.
  const masksParticipants = new Set<string>();
  for (const t of transitions) {
    if (t.kind === 'wipe' || t.kind === 'iris' || t.kind === 'dissolve' || t.kind === 'zoom') {
      masksParticipants.add(t.from);
      masksParticipants.add(t.to);
    }
  }
  if (masksParticipants.size > 0 && compW !== undefined && compH !== undefined) {
    for (let i = 0; i < sequences.length; i++) {
      const s = sequences[i]!;
      if (!s.name || !masksParticipants.has(s.name)) continue;
      // Reject user-supplied filters using the reserved prefix BEFORE wrapping
      // so the check sees the user's actual filter list, not the wrapper's
      // (clean) one.
      const userFilters = (s as { filters?: FilterSpec[] }).filters;
      if (userFilters) rejectReservedNameCollision(userFilters, s.name);
      sequences[i] = wrapAsFullComposition(s, compW, compH);
    }
  }

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
      case 'dip':
        expandDip(out, t, fromEntry.seq, toEntry.seq);
        break;
      case 'zoom':
        expandZoom(out, t, fromEntry.seq, toEntry.seq);
        break;
      case 'dissolve':
        expandDissolve(out, t, fromEntry.seq, toEntry.seq, i);
        break;
    }
  }

  delete (out as { transitions?: unknown }).transitions;
  return out;
}

// Wrap an arbitrary sequence in a Composition that fills the parent. The
// wrapper takes over the sequence's name / at / duration (so the user's
// transitions DSL still references the right scene), and the original
// sequence becomes its sole child.
//
// The wrapper is positioned so its pivot sits at the composition centre and
// its world position is the centre too — visually identical to position
// (0,0) with no pivot, but it lets the zoom macro scale the wrapper around
// the centre instead of around its top-left corner. Mask filters
// (wipe / iris / dissolve) are unaffected because their canvas-relative math
// only depends on the wrapper's *bbox*, which is still (0,0)-(W,H) in world
// coords either way.
//
// If `seq` is already a Composition that fills the parent, no-op.
function wrapAsFullComposition(seq: SequenceSpec, compW: number, compH: number): SequenceSpec {
  if (seq.type === 'composition' && seq.width === compW && seq.height === compH) {
    return seq;
  }
  const inner: SequenceSpec = { ...(seq as object) } as SequenceSpec;
  // The inner sequence runs across the whole wrapper lifetime; its name
  // belongs to the wrapper now (so transitions still resolve), and so do
  // its at / duration on the parent timeline.
  delete (inner as { name?: string }).name;
  delete (inner as { at?: number }).at;
  delete (inner as { duration?: number }).duration;
  return {
    type: 'composition',
    name: seq.name,
    at: seq.at,
    duration: seq.duration,
    width: compW,
    height: compH,
    initial: {
      x: compW / 2,
      y: compH / 2,
      pivotX: compW / 2,
      pivotY: compH / 2,
    },
    sequences: [inner],
  } as SequenceSpec;
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
  comp: CompositionSpec | CompositionSequenceSpec,
  t: WipeTransition | IrisTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
  transitionIndex: number,
  mode: TransitionMode,
  smoothing: number | undefined,
): void {
  const ease = t.ease ?? 'none';
  const inName  = transitionFilterName(transitionIndex);             // on `to`
  const outName = `${transitionFilterName(transitionIndex)}-out`;    // on `from`
  const sm = smoothing ?? 0.02;

  // Force the filter region to span the WHOLE composition. Without this PIXI
  // would clip the filter to each sprite's bbox, so a wipe / iris on a small
  // text sprite would only ever modify pixels inside the text's bounding box
  // — the cut would appear to land at different canvas positions for sprites
  // of different sizes (the bbox edge becomes the visual edge). With the
  // filter area expanded to the whole composition, the wipe / iris geometry
  // is computed in canvas space and the boundary is consistent across every
  // participating sprite.
  const compW = comp.width ?? 0;
  const compH = comp.height ?? 0;
  const fullArea = { x: 0, y: 0, width: compW, height: compH };

  // Incoming (B): soft mask that reveals B as uProgress 0 → 1.
  const toFilters = ensureFilters(toSeq);
  rejectReservedNameCollision(toFilters, toSeq.name);
  toFilters.push({
    type: 'custom',
    name: inName,
    filter: new TransitionMaskFilter({ mode, smoothing: sm, progress: 0 }),
  });
  ensureKeyframes(toSeq).push({
    at: t.at,
    to: { [`filters.${inName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
  (toSeq as { filterArea?: typeof fullArea }).filterArea = fullArea;

  // Outgoing (A): inverted mask with a HARD binary cutoff (see TransitionMask
  // shader for the `step(0.99, reveal)` rationale). A stays at alpha=1 across
  // B's smoothstep zone and snaps off only where B fully covers, giving an
  // alpha-correct blend with no background bleed.
  const fromFilters = ensureFilters(fromSeq);
  rejectReservedNameCollision(fromFilters, fromSeq.name);
  fromFilters.push({
    type: 'custom',
    name: outName,
    filter: new TransitionMaskFilter({ mode, smoothing: sm, progress: 0, invert: true }),
  });
  ensureKeyframes(fromSeq).push({
    at: t.at,
    to: { [`filters.${outName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
  (fromSeq as { filterArea?: typeof fullArea }).filterArea = fullArea;
}

function expandDip(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: DipTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  // A fades to 0 over the first half, B fades from 0 over the second half.
  // The visible color in between is whatever sits behind A and B (canvas
  // background or any persistent layer), so the user can dip-to-black /
  // dip-to-white by setting `background` on Movie.init().
  const ease = t.ease ?? 'none';
  const half = t.duration / 2;

  ensureKeyframes(fromSeq).push({
    at: t.at, to: { alpha: 0 }, duration: half, ease,
  });

  const toInitial = ensureInitial(toSeq);
  if (toInitial.alpha !== undefined && toInitial.alpha !== 0) {
    throw new Error(
      `pixi-effects: dip "${t.from}"→"${t.to}" requires "${t.to}" to start invisible, ` +
      `but it already has initial.alpha=${String(toInitial.alpha)}. Remove the manual setting.`,
    );
  }
  toInitial.alpha = 0;
  ensureKeyframes(toSeq).push({
    at: t.at + half, to: { alpha: 1 }, duration: half, ease,
  });
}

function expandZoom(
  _comp: CompositionSpec | CompositionSequenceSpec,
  t: ZoomTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
): void {
  // mode 'in' (default): B is the focus. B starts large + invisible, zooms
  //   to scale 1 + alpha 1. A simply fades.
  // mode 'out': A is the focus. A grows large + fades. B simply fades in.
  const ease = t.ease ?? 'none';
  const startScale = t.fromScale ?? 4;
  const mode = t.mode ?? 'in';

  if (mode === 'in') {
    ensureKeyframes(fromSeq).push({
      at: t.at, to: { alpha: 0 }, duration: t.duration, ease,
    });
    const toInitial = ensureInitial(toSeq);
    toInitial.alpha = 0;
    toInitial.scale = startScale;
    ensureKeyframes(toSeq).push({
      at: t.at, to: { alpha: 1, scale: 1 }, duration: t.duration, ease,
    });
  } else {
    ensureKeyframes(fromSeq).push({
      at: t.at, to: { alpha: 0, scale: startScale }, duration: t.duration, ease,
    });
    const toInitial = ensureInitial(toSeq);
    toInitial.alpha = 0;
    ensureKeyframes(toSeq).push({
      at: t.at, to: { alpha: 1 }, duration: t.duration, ease,
    });
  }
}

function expandDissolve(
  comp: CompositionSpec | CompositionSequenceSpec,
  t: DissolveTransition,
  fromSeq: SequenceSpec,
  toSeq: SequenceSpec,
  transitionIndex: number,
): void {
  const ease = t.ease ?? 'none';
  const inName  = transitionFilterName(transitionIndex);
  const outName = `${transitionFilterName(transitionIndex)}-out`;
  const sm = t.smoothing ?? 0.05;
  const scale = t.scale ?? 30;
  const seed  = t.seed ?? 0;
  const compW = comp.width ?? 0;
  const compH = comp.height ?? 0;
  const fullArea = { x: 0, y: 0, width: compW, height: compH };

  // Incoming (B): noise-thresholded reveal, B appears as uProgress 0→1.
  const toFilters = ensureFilters(toSeq);
  rejectReservedNameCollision(toFilters, toSeq.name);
  toFilters.push({
    type: 'custom',
    name: inName,
    filter: new TransitionMaskFilter({ mode: 'dissolve', smoothing: sm, progress: 0, scale, seed }),
  });
  ensureKeyframes(toSeq).push({
    at: t.at,
    to: { [`filters.${inName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
  (toSeq as { filterArea?: typeof fullArea }).filterArea = fullArea;

  // Outgoing (A): inverted mask. Same noise pattern (same seed) so the
  // pixel reveal pattern is consistent — pixels A loses are the pixels B
  // reveals at every progress step.
  const fromFilters = ensureFilters(fromSeq);
  rejectReservedNameCollision(fromFilters, fromSeq.name);
  fromFilters.push({
    type: 'custom',
    name: outName,
    filter: new TransitionMaskFilter({ mode: 'dissolve', smoothing: sm, progress: 0, scale, seed, invert: true }),
  });
  ensureKeyframes(fromSeq).push({
    at: t.at,
    to: { [`filters.${outName}.uProgress`]: 1 },
    duration: t.duration,
    ease,
  });
  (fromSeq as { filterArea?: typeof fullArea }).filterArea = fullArea;
}

// User-supplied filters with the reserved prefix collide with our internal
// naming and should fail loud. Our own injected names (`_pe-transition-N` /
// `_pe-transition-N-out`) are tolerated so a sequence can be `to` of one
// transition and `from` of another.
const OWN_NAME_PATTERN = /^_pe-transition-\d+(-out)?$/;

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
