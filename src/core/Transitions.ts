import type { CompositionSpec, CompositionSequenceSpec, SequenceSpec, TransitionSpec } from '../types';
import { resolveAt } from './Timeline';

/**
 * Pure function: validate the composition's `transitions[]` and rewrite the
 * spec by macro-expanding each transition into existing primitives (extra
 * keyframes / filters on the participating sequences). Returns a new spec
 * tree; does NOT mutate the input.
 *
 * Recurses into nested compositions.
 */
export function expandTransitions<T extends CompositionSpec | CompositionSequenceSpec>(spec: T): T {
  const out = { ...spec, sequences: spec.sequences ? [...spec.sequences] : undefined };
  // Recurse into nested compositions first.
  if (out.sequences) {
    out.sequences = out.sequences.map((s) => {
      if (s.type === 'composition') return expandTransitions(s);
      return s;
    });
  }
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
  }

  // Macro expansion happens in later tasks; for now just strip the field
  // (every transition validated successfully).
  delete (out as { transitions?: unknown }).transitions;
  return out;
}
