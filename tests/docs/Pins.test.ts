// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');

describe('release pins', () => {
  it('the first-video page pins the current release on the CDN (bump it with README and skills/pixi-effects/template.html when you release)', () => {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    const page = readFileSync(join(root, 'tests/films/first-video.html'), 'utf8');
    expect([...page.matchAll(/pixi-effects@([\d.]+)\//g)].map(m => m[1])).toEqual([version, version]);
  });
});
