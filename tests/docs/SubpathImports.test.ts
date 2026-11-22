import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Every `pixi-effects/<name>` an agent is told to import exists in package.json "exports" (SKILL.md once said
// `pixi-effects/presenter`, which is not published: the import fails).
const root = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const published = new Set(Object.keys(pkg.exports).map((k: string) => k.replace(/^\.\//, '')));
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(root, 'skills/pixi-effects')), join(root, 'README.md'), join(root, 'docs/api.md'), join(root, 'docs/dsl.md'), join(root, 'ai/CHAT.md'), join(root, 'ai/chat-template.html')]
  .filter(f => /\.(md|html)$/.test(f));

describe('the import paths the docs give', () => {
  it('every quoted pixi-effects/<name> is published in package.json exports', () => {
    const wrong: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/[`'"]pixi-effects\/([\w.-]+)[`'"]/g)) {
        if (!published.has(m[1]!)) wrong.push(`${f.slice(root.length + 1)}: pixi-effects/${m[1]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
