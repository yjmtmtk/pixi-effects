import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Presenter is deprecated (removed in 2.0): wherever a doc an agent reads names it, it says so nearby; nothing tells an agent to use it.
const root = resolve(__dirname, '../..');
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(root, 'skills/pixi-effects')), 'README.md', 'docs/api.md', 'docs/dsl.md', 'ai/CHAT.md', 'ai/chat-template.html', 'llms.txt', 'scripts/build-llms.mjs']
  .map(f => (f.startsWith('/') ? f : join(root, f))).filter(f => /\.(md|html|txt|mjs)$/.test(f));

describe('Presenter is deprecated in every doc an agent reads', () => {
  it('every mention of Presenter has "deprecated" or "2.0" within its sentence or the next lines', () => {
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/Presenter\b/g)) {
        const near = text.slice(Math.max(0, m.index! - 400), m.index! + 400);
        if (!/deprecated|removed in 2\.0|2\.0/i.test(near)) bad.push(`${f.slice(root.length + 1)}: …${text.slice(Math.max(0, m.index! - 60), m.index! + 60).replace(/\n/g, ' ')}…`);
      }
    }
    expect(bad).toEqual([]);
  });
});
