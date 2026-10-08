import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// docs/philosophy.md, "Engine names": the spec language owns the neutral names (model, light, camera, scene3d, register3D, ...); an engine's name
// appears only where the code is truly specific to that engine. This guards the public names, so the first engine to arrive cannot take the neutral ones.
const root = resolve(__dirname, '../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

/** Names of 3D engines (`threeD`, the 2.5D flag, is a property name, not an exported name, and is not caught: it is not listed here on purpose). */
const ENGINE = /three|pixi-?3d|babylon|playcanvas|cannon/i;
/** The entries and files that are allowed to carry an engine's name. */
const ENGINE_ENTRIES = ['./three'];

/** The names a source file exports: `export { A, type B } from`, `export type { C }`, `export function|const|class|interface|type|enum D`. */
function exportedNames(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const piece = part.trim().replace(/^type\s+/, '');
      if (!piece) continue;
      names.push(piece.split(/\s+as\s+/).pop()!.trim());
    }
  }
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1]!);
  return [...new Set(names)];
}

describe('engine names (docs/philosophy.md: Engine names)', () => {
  it('the main entry exports no engine\'s name', () => {
    const names = exportedNames(read('src/index.ts'));
    expect(names.length).toBeGreaterThan(20);                       // the parser found the exports
    expect(names.filter(n => ENGINE.test(n))).toEqual([]);
  });

  it('the spec types (src/types.ts) name no engine: the neutral names belong to the spec language', () => {
    const names = exportedNames(read('src/types.ts'));
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter(n => ENGINE.test(n))).toEqual([]);
  });

  it('package entries: only the explicit engine entries carry an engine\'s name', () => {
    const entries = Object.keys(JSON.parse(read('package.json')).exports as Record<string, unknown>);
    expect(entries).toContain('./three');
    expect(entries.filter(e => ENGINE.test(e) && !ENGINE_ENTRIES.includes(e))).toEqual([]);
  });

  it('everything the three entry exports says "three" (an engine\'s entry is engine-named all the way down)', () => {
    const names = exportedNames(read('src/three/index.ts'));
    expect(names).toEqual(expect.arrayContaining(['ThreeSequence', 'registerThree']));
    expect(names.filter(n => !/three/i.test(n))).toEqual([]);
  });

  it('the rule is written down: philosophy.md has the section "Engine names"', () => {
    const doc = read('docs/philosophy.md');
    expect(doc).toMatch(/^### Engine names$/m);
    expect(doc).toMatch(/neutral name/i);
  });
});
