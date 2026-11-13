/**
 * Keeping a layer's expensive state across a rebuild (`setVars`, `resize`, `rebuild`): the new tree is built while the old one still plays, and a layer that cannot be told apart from
 * one of the old tree (same name, same setup, same size and options) may take over that layer's scene and renderer instead of building its own. Today only the `three` layer does:
 * its setup may load a model, and its renderer owns a graphics context.
 *
 * It is a loan until the swap: the new layer borrows, the old one goes on drawing, and `commitReuse` (called by the movie once the new tree is on stage) makes it the owner. A new tree that
 * is thrown away before that leaves the old layers as they were.
 */
import type { Sequence } from '../sequences/Base';
import { CompositionSequence } from '../sequences/Composition';

/** What a layer that can lend its state answers to (duck-typed: the core does not import the layers). */
export interface Lendable { reuseKey(): string | null }
/** What a layer that can borrow calls: `claim(key, by)` hands it a layer of the old tree (or null), and remembers `by` so the swap commits it wherever it sits in the new tree. */
export interface ReusePool { claim(key: string, by?: Sequence): Sequence | null; readonly borrowers?: readonly Sequence[] }

const lendable = (s: Sequence): s is Sequence & Lendable => typeof (s as Partial<Lendable>).reuseKey === 'function';
const borrower = (s: Sequence): s is Sequence & { commitReuse(): void } => typeof (s as { commitReuse?: unknown }).commitReuse === 'function';

function walk(root: CompositionSequence, visit: (seq: Sequence) => void): void {
  for (const { seq } of root.layers()) {
    visit(seq);
    const mask = (seq as { maskSequence?: Sequence | null }).maskSequence;
    if (mask) visit(mask);
    if (seq instanceof CompositionSequence) walk(seq, visit);
  }
}

/** The layers of the old tree that can lend, by their key: each is claimed by at most one new layer. */
export function reusePoolOf(old: CompositionSequence | null): ReusePool {
  const free = new Map<string, Sequence[]>();
  if (old) walk(old, (seq) => {
    if (!lendable(seq)) return;
    const key = seq.reuseKey();
    if (key !== null) free.set(key, [...(free.get(key) ?? []), seq]);
  });
  const borrowers: Sequence[] = [];
  return {
    claim: (key, by) => { const d = free.get(key)?.shift() ?? null; if (d && by) borrowers.push(by); return d; },
    borrowers,
  };
}

/** The new tree is on stage: every layer that borrowed from the old tree owns what it borrowed now. */
export function commitReuse(root: CompositionSequence, pool?: ReusePool | null): void {
  const done = new Set<Sequence>();
  const commit = (seq: Sequence): void => { if (!done.has(seq) && borrower(seq)) { done.add(seq); seq.commitReuse(); } };
  walk(root, commit);
  // a borrower the walk does not reach (a layer used as a matte source is not among its composition's layers) is committed all the same
  for (const seq of pool?.borrowers ?? []) commit(seq);
}
