import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lintSequence } from '../../src/space/lint';
import type { SequenceSpec } from '../../src/types';

const md = readFileSync(resolve(__dirname, '../../docs/dsl.md'), 'utf8');

function section(): string {
  const start = md.indexOf('\n## 3D layers & camera');
  if (start < 0) throw new Error('docs/dsl.md has no "## 3D layers & camera" section');
  const rest = md.slice(start + 1);
  const next = rest.indexOf('\n## ', 3);
  return next < 0 ? rest : rest.slice(0, next);
}

function jsonBlocks(text: string): string[] {
  return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]!);
}

function sequencesOf(node: unknown, out: SequenceSpec[] = []): SequenceSpec[] {
  const n = node as { sequences?: SequenceSpec[] };
  for (const s of n.sequences ?? []) {
    out.push(s);
    sequencesOf(s, out);
  }
  return out;
}

const KNOWN = new Set(['text', 'image', 'video', 'audio', 'composition', 'shape', 'camera']);

describe('docs/dsl.md — 3D layers & camera', () => {
  const blocks = jsonBlocks(section());

  it('has at least three runnable examples', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  blocks.forEach((block, i) => {
    it(`example ${i + 1} is valid JSON, uses known layer types, and lints clean`, () => {
      const spec = JSON.parse(block);
      const seqs = sequencesOf(spec);
      expect(seqs.length).toBeGreaterThan(0);
      for (const s of seqs) {
        expect(KNOWN.has(s.type)).toBe(true);
        const warnings: string[] = [];
        lintSequence(s, m => warnings.push(m));
        expect(warnings).toEqual([]);
      }
    });
  });
});
