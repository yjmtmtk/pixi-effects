import { describe, it, expect } from 'vitest';
import { collectVideoSequences } from '../../src/core/Movie';
import type { Sequence } from '../../src/sequences/Base';

// `out` has the same element type collectVideoSequences pushes into, taken
// structurally so this test doesn't need the (unexported) VideoLike type.
type Collected = Parameters<typeof collectVideoSequences>[1];

/** Minimal fake node shaped like Sequence for the parts collectVideoSequences reads. */
interface FakeNode {
  id: string;
  awaitFrameAt?: () => Promise<void>;
  maskSequence?: FakeNode | null;
  _children?: FakeNode[];
}

function node(id: string, opts: Partial<FakeNode> = {}): FakeNode {
  return { id, maskSequence: null, _children: [], ...opts };
}

function idsOf(out: Collected): string[] {
  return (out as unknown as FakeNode[]).map(n => n.id).sort();
}

describe('collectVideoSequences', () => {
  it('collects a frame-synced child', () => {
    const syncedLeaf = node('synced-leaf', { awaitFrameAt: async () => {} });
    const root = node('root', { _children: [syncedLeaf] });

    const out: Collected = [];
    collectVideoSequences(root as unknown as Sequence, out);

    expect(idsOf(out)).toEqual(['synced-leaf']);
  });

  it('collects a frame-synced mask on a non-synced child', () => {
    const maskSynced = node('mask-on-nonsynced-child', { awaitFrameAt: async () => {} });
    const nonSyncedChild = node('non-synced-child', { maskSequence: maskSynced });
    const root = node('root', { _children: [nonSyncedChild] });

    const out: Collected = [];
    collectVideoSequences(root as unknown as Sequence, out);

    expect(idsOf(out)).toEqual(['mask-on-nonsynced-child']);
  });

  it('collects a frame-synced mask nested inside a child composition', () => {
    const nestedMaskSynced = node('mask-nested-in-child-composition', { awaitFrameAt: async () => {} });
    const nestedNonSyncedLeaf = node('nested-non-synced-leaf', { maskSequence: nestedMaskSynced });
    const childComposition = node('child-composition', { _children: [nestedNonSyncedLeaf] });
    const root = node('root', { _children: [childComposition] });

    const out: Collected = [];
    collectVideoSequences(root as unknown as Sequence, out);

    expect(idsOf(out)).toEqual(['mask-nested-in-child-composition']);
  });

  it('does not collect a mask that is itself not frame-synced', () => {
    const nonSyncedMask = node('non-synced-mask'); // no awaitFrameAt
    const leafWithNonSyncedMask = node('leaf-with-non-synced-mask', { maskSequence: nonSyncedMask });
    const root = node('root', { _children: [leafWithNonSyncedMask] });

    const out: Collected = [];
    collectVideoSequences(root as unknown as Sequence, out);

    expect(idsOf(out)).toEqual([]);
  });

  it('collects exactly the right set across a mixed tree', () => {
    const syncedLeaf = node('synced-leaf', { awaitFrameAt: async () => {} });

    const maskSynced = node('mask-on-nonsynced-child', { awaitFrameAt: async () => {} });
    const nonSyncedChild = node('non-synced-child', { maskSequence: maskSynced });

    const nestedMaskSynced = node('mask-nested-in-child-composition', { awaitFrameAt: async () => {} });
    const nestedNonSyncedLeaf = node('nested-non-synced-leaf', { maskSequence: nestedMaskSynced });
    const childComposition = node('child-composition', { _children: [nestedNonSyncedLeaf] });

    const nonSyncedMask = node('non-synced-mask');
    const leafWithNonSyncedMask = node('leaf-with-non-synced-mask', { maskSequence: nonSyncedMask });

    const root = node('root', {
      _children: [syncedLeaf, nonSyncedChild, childComposition, leafWithNonSyncedMask],
    });

    const out: Collected = [];
    collectVideoSequences(root as unknown as Sequence, out);

    expect(idsOf(out)).toEqual([
      'mask-nested-in-child-composition',
      'mask-on-nonsynced-child',
      'synced-leaf',
    ].sort());
  });
});
