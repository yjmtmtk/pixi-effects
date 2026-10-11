// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// A workflow file that is not valid YAML does not fail "a test": GitHub shows a run named ".github/workflows/ci.yml" that failed in a second, and nothing runs.
// The usual slip is a plain value with a colon and a space inside (`name: Unit tests (skipped here: see ...)`). No YAML parser is installed, so this checks that one rule.
const root = resolve(__dirname, '../..');
const dir = join(root, '.github/workflows');

/** The lines whose plain (unquoted, not block) value contains ": ", which YAML reads as a nested mapping. */
export function plainValuesWithColon(text: string): string[] {
  const bad: string[] = [];
  text.split('\n').forEach((line, i) => {
    const m = /^\s*(?:- )?[A-Za-z_][\w.-]*: (.+)$/.exec(line);
    if (!m) return;
    const value = m[1]!.replace(/\s+#.*$/, '').trim();
    if (/^["'|>\[{&*!]/.test(value)) return;
    if (value.includes(': ')) bad.push(`${i + 1}: ${line.trim()}`);
  });
  return bad;
}

describe('the workflow files are valid YAML (as far as the usual slip goes)', () => {
  it('the checker finds a plain value with ": " in it (the file that GitHub refused)', () => {
    expect(plainValuesWithColon("      - name: Unit tests (skipped here: they run elsewhere)\n")).toHaveLength(1);
    expect(plainValuesWithColon("      - name: 'Unit tests (skipped here: they run elsewhere)'\n        run: npm test # a note: fine\n")).toEqual([]);
    expect(plainValuesWithColon("    runs-on: ubuntu-latest\n    env:\n      CHROME: /usr/bin/google-chrome\n")).toEqual([]);
  });

  for (const f of readdirSync(dir).filter(n => /\.ya?ml$/.test(n))) {
    it(`${f}: no plain value contains ": "`, () => {
      expect(plainValuesWithColon(readFileSync(join(dir, f), 'utf8'))).toEqual([]);
    });
  }
});
