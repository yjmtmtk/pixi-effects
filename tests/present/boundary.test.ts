import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';

// pixi-effects/present is built on the core's PUBLIC API only (src/index.ts): that is what lets it live apart from the core, and
// what a third-party extension has to manage too. A file here may import its own folder and `../index`, and packages; nothing else.
const root = resolve(__dirname, '../..');
const dir = join(root, 'src/present');
const files = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
const specifiers = (src: string): string[] =>
  [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map(m => m[1]!)
    .concat([...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]!))
    .concat([...src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map(m => m[1]!));

describe('src/present uses the core only through its public API', () => {
  const list = files(dir);
  it('there are files to check', () => { expect(list.length).toBeGreaterThan(5); });
  for (const file of list) {
    it(`${relative(root, file)} imports only its own folder, ../index and packages`, () => {
      const bad = specifiers(readFileSync(file, 'utf8')).filter(s => s.startsWith('.')).filter(s => {
        const target = resolve(dirname(file), s);
        return !(target.startsWith(dir + '/') || target === join(root, 'src/index'));
      });
      expect(bad, `${relative(root, file)} reaches past the public API: ${bad.join(', ')}`).toEqual([]);
    });
  }
});
