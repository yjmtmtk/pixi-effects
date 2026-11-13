import { describe, it, expect } from 'vitest';
import { commitReuse, reusePoolOf } from '../../src/core/reuse';
import type { CompositionSequence } from '../../src/sequences/Composition';
import type { Sequence } from '../../src/sequences/Base';

// The pool a rebuild hands the new tree: a layer that claims a donor is committed at the swap even where the walk of the tree's layers does not reach it
// (a layer used as a matte source is not among its composition's layers).
const tree = (layers: Sequence[]): CompositionSequence => ({ layers: () => layers.map((seq) => ({ seq })) }) as unknown as CompositionSequence;
const lender = (key: string) => ({ reuseKey: () => key }) as unknown as Sequence;
const borrower = () => { const b = { commits: 0, commitReuse() { b.commits++; } }; return b; };

describe('reuse pool', () => {
  it('commits a borrower the tree walk does not reach, once; and one it reaches, once', () => {
    const pool = reusePoolOf(tree([lender('a'), lender('b')]));
    const hidden = borrower(), listed = borrower();
    expect(pool.claim('a', hidden as unknown as Sequence)).not.toBeNull();
    expect(pool.claim('b', listed as unknown as Sequence)).not.toBeNull();
    expect(pool.claim('a', borrower() as unknown as Sequence), 'a donor is lent once').toBeNull();
    commitReuse(tree([listed as unknown as Sequence]), pool);
    expect(hidden.commits).toBe(1);
    expect(listed.commits).toBe(1);
  });
});
