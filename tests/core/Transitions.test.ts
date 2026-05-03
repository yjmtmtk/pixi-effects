import { describe, it, expect } from 'vitest';
import { expandTransitions } from '../../src/core/Transitions';
import type { CompositionSpec, CompositionSequenceSpec, CustomFilterSpec, Keyframe } from '../../src/types';

function spec(overrides: Partial<CompositionSpec> = {}): CompositionSpec {
  return {
    width: 100, height: 100, duration: 10,
    sequences: [
      { type: 'text', name: 'A', text: 'a', at: 0, duration: 5 },
      { type: 'text', name: 'B', text: 'b', at: 4, duration: 5 },
    ],
    ...overrides,
  };
}

describe('expandTransitions — validation', () => {
  it('passes through a composition with no transitions field', () => {
    const s = spec({ transitions: undefined });
    expect(expandTransitions(s)).toEqual(s);
  });

  it('passes through an empty transitions array and strips the field', () => {
    const out = expandTransitions(spec({ transitions: [] }));
    expect(out.transitions).toBeUndefined();
  });

  it('throws when `from` references an unknown sibling', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'X', to: 'B', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*from.*"X".*not found/i);
  });

  it('throws when `to` references an unknown sibling', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'Y', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*to.*"Y".*not found/i);
  });

  it('throws when `to` is declared before `from`', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'B', to: 'A', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"A".*declared after.*"B"/i);
  });

  it('throws when from === to', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'A', at: 4, duration: 1 }],
    }))).toThrow(/transitions\[0\].*cannot transition.*itself/i);
  });

  it('throws when duration is zero or negative', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 0 }],
    }))).toThrow(/duration must be > 0/);
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: -1 }],
    }))).toThrow(/duration must be > 0/);
  });

  it('throws when window extends past `from`\'s lifespan', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4.5, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"A".*ends at 5/i);
  });

  it('throws when window starts before `to`\'s lifespan', () => {
    expect(() => expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 3, duration: 1 }],
    }))).toThrow(/transitions\[0\].*"B".*starts at 4/i);
  });

  it('throws when one sequence is the `from` of two transitions', () => {
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 10 },
        { type: 'text', name: 'B', text: 'b', at: 2, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 5, duration: 5 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: 2, duration: 1 },
        { kind: 'crossfade', from: 'A', to: 'C', at: 5, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).toThrow(/"A".*used as `from`/i);
  });

  it('allows the same sequence to be `to` of one and `from` of another (chained A→B→C)', () => {
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 4 },
        { type: 'text', name: 'B', text: 'b', at: 3, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 6, duration: 4 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: 3, duration: 1 },
        { kind: 'crossfade', from: 'B', to: 'C', at: 6, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).not.toThrow();
  });

  it('resolves negative `at` on the transition itself ("from the end") just like Keyframe.at', () => {
    // Composition duration = 10. Transition `at: -1` means start at t=9.
    // Sequence A lives [0..10] (covers it), B lives [4..9] — but with the
    // shifted window [9, 10] B's lifespan covers right up to its end.
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 10 },
        { type: 'text', name: 'B', text: 'b', at: 4,  duration: 6 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: -1, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).not.toThrow();
  });

  it('throws when one sequence is the `to` of two transitions', () => {
    const s = spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 4 },
        { type: 'text', name: 'B', text: 'b', at: 3, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 0, duration: 8 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'C', at: 3, duration: 1 },
        { kind: 'crossfade', from: 'B', to: 'C', at: 6, duration: 1 },
      ],
    });
    expect(() => expandTransitions(s)).toThrow(/"C".*used as `to`/i);
  });

  it('recurses into nested compositions and validates the inner transitions independently', () => {
    const inner: CompositionSpec = {
      type: 'composition',
      width: 100, height: 100, duration: 8,
      sequences: [
        { type: 'text', name: 'Inner-A', text: 'ia', at: 0, duration: 4 },
        { type: 'text', name: 'Inner-B', text: 'ib', at: 3, duration: 4 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'Inner-A', to: 'Inner-B', at: 3, duration: 1 },
      ],
    } as unknown as CompositionSpec;

    const out = expandTransitions(spec({
      sequences: [
        { type: 'text', name: 'Outer', text: 'o', at: 0, duration: 10 },
        inner as unknown as CompositionSequenceSpec,
      ],
    }));

    // Inner composition should have its `transitions` field stripped.
    const innerOut = out.sequences!.find((s) => 'sequences' in s) as { transitions?: unknown };
    expect(innerOut.transitions).toBeUndefined();
  });

  it('throws when a nested composition has invalid transitions (e.g. unknown name)', () => {
    const inner: CompositionSpec = {
      type: 'composition',
      width: 100, height: 100, duration: 8,
      sequences: [
        { type: 'text', name: 'Inner-A', text: 'ia', at: 0, duration: 4 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'Inner-A', to: 'Ghost', at: 3, duration: 1 },
      ],
    } as unknown as CompositionSpec;

    expect(() => expandTransitions(spec({
      sequences: [
        { type: 'text', name: 'Outer', text: 'o', at: 0, duration: 10 },
        inner as unknown as CompositionSequenceSpec,
      ],
    }))).toThrow(/transitions\[0\].*to.*"Ghost".*not found/i);
  });
});

function findSeqKfs(s: CompositionSpec, name: string): Keyframe[] {
  const seq = s.sequences!.find((x) => x.name === name)!;
  return ('keyframes' in seq && seq.keyframes) ? seq.keyframes : [];
}

function findSeqInitial(s: CompositionSpec, name: string): Record<string, unknown> {
  const seq = s.sequences!.find((x) => x.name === name)!;
  return ('initial' in seq && seq.initial) ? (seq.initial as Record<string, unknown>) : {};
}

describe('expandTransitions — crossfade', () => {
  it('appends an alpha=0 fade-out keyframe to `from`', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    const kfs = findSeqKfs(out, 'A');
    expect(kfs).toContainEqual({ at: 4, to: { alpha: 0 }, duration: 1, ease: 'none' });
  });

  it('sets initial.alpha=0 on `to` and appends an alpha=1 fade-in keyframe', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    expect(findSeqInitial(out, 'B').alpha).toBe(0);
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { alpha: 1 }, duration: 1, ease: 'none' });
  });

  it('honors the `ease` field on both keyframes', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1, ease: 'sine.inOut' }],
    }));
    expect(findSeqKfs(out, 'A').slice(-1)[0]!.ease).toBe('sine.inOut');
    expect(findSeqKfs(out, 'B').slice(-1)[0]!.ease).toBe('sine.inOut');
  });

  it('throws if `to` already has a manual `initial.alpha`', () => {
    const s = spec();
    s.sequences![1] = { ...s.sequences![1]!, initial: { alpha: 0.5 } } as typeof s.sequences[1];
    expect(() => expandTransitions({
      ...s,
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    })).toThrow(/"B".*already has.*initial\.alpha/i);
  });

  it('strips `transitions` from the returned spec', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    expect(out.transitions).toBeUndefined();
  });

  it('chained A→B→C: B gets both a fade-in and a fade-out keyframe', () => {
    const out = expandTransitions(spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 4 },
        { type: 'text', name: 'B', text: 'b', at: 3, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 6, duration: 4 },
      ],
      transitions: [
        { kind: 'crossfade', from: 'A', to: 'B', at: 3, duration: 1 },
        { kind: 'crossfade', from: 'B', to: 'C', at: 6, duration: 1 },
      ],
    }));
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 3, to: { alpha: 1 }, duration: 1, ease: 'none' });
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 6, to: { alpha: 0 }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').alpha).toBe(0);
  });

  it('does not mutate the input spec', () => {
    const input = spec({ transitions: [{ kind: 'crossfade', from: 'A', to: 'B', at: 4, duration: 1 }] });
    const before = JSON.stringify(input);
    expandTransitions(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

function findCustomFilter(s: CompositionSpec, seqName: string, filterName: string): CustomFilterSpec | undefined {
  const seq = s.sequences!.find((x) => x.name === seqName)!;
  const filters = ('filters' in seq && seq.filters) ? seq.filters : [];
  return filters.find((f) => f.type === 'custom' && f.name === filterName) as CustomFilterSpec | undefined;
}

describe('expandTransitions — wipe', () => {
  it('attaches a TransitionMaskFilter to `to` with deterministic name', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    }));
    const f = findCustomFilter(out, 'B', '_pe-transition-0');
    expect(f).toBeDefined();
    expect(f!.type).toBe('custom');
    // The filter instance should be a TransitionMaskFilter with mode set to wipe-left (uMode=0).
    const inst = f!.filter as { uMode: number };
    expect(inst.uMode).toBe(0);
  });

  it('appends a uProgress 0→1 keyframe path on `to`', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'right', ease: 'sine.in' }],
    }));
    const kfs = findSeqKfs(out, 'B');
    expect(kfs).toContainEqual({
      at: 4,
      to: { 'filters._pe-transition-0.uProgress': 1 },
      duration: 1,
      ease: 'sine.in',
    });
  });

  it('encodes direction in uMode (left=0, right=1, up=2, down=3)', () => {
    for (const [dir, code] of [['left', 0], ['right', 1], ['up', 2], ['down', 3]] as const) {
      const out = expandTransitions(spec({
        transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: dir }],
      }));
      const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
      expect(inst.uMode).toBe(code);
    }
  });

  it('honors smoothing override', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left', smoothing: 0.1 }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uSmoothing: number };
    expect(inst.uSmoothing).toBeCloseTo(0.1, 5);
  });

  it('throws if `to` already has a filter named with the reserved transition prefix', () => {
    const s = spec();
    s.sequences![1] = {
      ...s.sequences![1]!,
      filters: [{ type: 'custom', name: '_pe-transition-0', filter: { apply() {} } as unknown }],
    } as typeof s.sequences[1];
    expect(() => expandTransitions({
      ...s,
      transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    })).toThrow(/reserved.*name.*_pe-transition-/i);
  });

  it('assigns distinct filter names for two transitions with different indices (chained)', () => {
    const out = expandTransitions(spec({
      sequences: [
        { type: 'text', name: 'A', text: 'a', at: 0, duration: 4 },
        { type: 'text', name: 'B', text: 'b', at: 3, duration: 4 },
        { type: 'text', name: 'C', text: 'c', at: 6, duration: 4 },
      ],
      transitions: [
        { kind: 'wipe', from: 'A', to: 'B', at: 3, duration: 1, direction: 'left' },
        { kind: 'wipe', from: 'B', to: 'C', at: 6, duration: 1, direction: 'right' },
      ],
    }));
    expect(findCustomFilter(out, 'B', '_pe-transition-0')).toBeDefined();
    expect(findCustomFilter(out, 'C', '_pe-transition-1')).toBeDefined();
  });

  it('does not mutate the input spec', () => {
    const input = spec({ transitions: [{ kind: 'wipe', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }] });
    const before = JSON.stringify(input);
    expandTransitions(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('expandTransitions — iris', () => {
  it('uses uMode=4 by default (iris-in)', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1 }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
    expect(inst.uMode).toBe(4);
  });

  it('uses uMode=5 when mode=out', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1, mode: 'out' }],
    }));
    const inst = findCustomFilter(out, 'B', '_pe-transition-0')!.filter as { uMode: number };
    expect(inst.uMode).toBe(5);
  });

  it('appends a uProgress 0→1 keyframe path on `to`', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'iris', from: 'A', to: 'B', at: 4, duration: 1, ease: 'power2.out' }],
    }));
    const kfs = findSeqKfs(out, 'B');
    expect(kfs).toContainEqual({
      at: 4,
      to: { 'filters._pe-transition-0.uProgress': 1 },
      duration: 1,
      ease: 'power2.out',
    });
  });
});

describe('expandTransitions — slide', () => {
  it('left: A.x → -W and B.x: W → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { x: '-W' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').x).toBe('W');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { x: 0 }, duration: 1, ease: 'none' });
  });

  it('right: A.x → W and B.x: -W → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'right' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { x: 'W' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').x).toBe('-W');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { x: 0 }, duration: 1, ease: 'none' });
  });

  it('up: A.y → -H and B.y: H → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'up' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { y: '-H' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').y).toBe('H');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { y: 0 }, duration: 1, ease: 'none' });
  });

  it('down: A.y → H and B.y: -H → 0', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'down' }],
    }));
    expect(findSeqKfs(out, 'A')).toContainEqual({ at: 4, to: { y: 'H' }, duration: 1, ease: 'none' });
    expect(findSeqInitial(out, 'B').y).toBe('-H');
    expect(findSeqKfs(out, 'B')).toContainEqual({ at: 4, to: { y: 0 }, duration: 1, ease: 'none' });
  });

  it('honors ease', () => {
    const out = expandTransitions(spec({
      transitions: [{ kind: 'slide', from: 'A', to: 'B', at: 4, duration: 1, direction: 'left', ease: 'power2.inOut' }],
    }));
    const aLast = findSeqKfs(out, 'A').slice(-1)[0]!;
    expect(aLast.ease).toBe('power2.inOut');
  });
});
