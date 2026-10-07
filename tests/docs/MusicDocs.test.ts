import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INSTRUMENTS, DRUMS } from '../../src/audio/music/instruments';
import { CHORD_KINDS } from '../../src/audio/music/notation';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const dsl = read('docs/dsl.md');
const music = dsl.slice(dsl.indexOf('#### Music written as text'), dsl.indexOf('### `composition`'));

describe('music is documented as it is built', () => {
  it('the DSL reference names every instrument, every drum and every chord kind', () => {
    expect(music.length).toBeGreaterThan(2000);
    for (const i of INSTRUMENTS) expect(music, `instrument ${i}`).toContain(`\`${i}\``);
    for (const d of DRUMS) expect(music, `drum ${d}`).toContain(d);
    for (const kind of Object.keys(CHORD_KINDS).filter(k => k !== '')) expect(music, `chord kind ${kind}`).toContain(`\`${kind}\``);
  });

  it('the cheatsheet, SKILL and the audio guide name every instrument and drum', () => {
    for (const file of ['ai/reference/cheatsheet.md', 'site/guide/audio.md']) {
      const text = read(file);
      for (const i of INSTRUMENTS) expect(text, `${file}: ${i}`).toContain(i);
      for (const d of DRUMS) expect(text, `${file}: ${d}`).toContain(d);
    }
    for (const i of INSTRUMENTS) expect(read('ai/SKILL.md'), `SKILL: ${i}`).toContain(i);
  });

  it('the CHAT guide, the README and llms.txt point at music', () => {
    expect(read('ai/CHAT.md')).toContain('Music with no file');
    expect(read('README.md')).toMatch(/music.*written as text|Music from text/i);
    expect(read('llms.txt')).toMatch(/music/i);
  });

  it('every option the resolver knows is in the DSL reference (so a new option cannot go undocumented)', () => {
    const src = read('src/audio/music/resolve.ts');
    const keys = (name: string) => [...(new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(src)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]!);
    for (const k of [...keys('OPTION_KEYS'), ...keys('TRACK_KEYS')]) expect(music, `option ${k}`).toContain(k);
  });
});
