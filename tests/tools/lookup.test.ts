// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// `pixi-effects recipe | help | new`: the agent reads what it needs instead of 35 KB of cheatsheet and 69 KB of recipes.
const root = resolve(__dirname, '../..');
const lookup: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/lookup.mjs')).href);
const cli = (args: string[], cwd = root) => spawnSync(process.execPath, [join(root, 'ai/tools/pixi-effects.mjs'), ...args], { encoding: 'utf8', cwd });

const FIXTURE = [
  '# Recipes', '', 'intro text', '', '---', '',
  '## A pop-in (a card)', '', 'prose of the first', '', '```js', '// @recipe pop-in', 'const a = 1;', '```', '', '---', '',
  '## Words that slam', '', 'prose of the second', '', '```js', '// @recipe slam-words', 'const b = 2;', '```', '', '```js', '// @docs-only', 'other', '```', '',
].join('\n');

describe('recipes: parse and read', () => {
  it('a section is a "## " heading up to the next one; its ids are the `// @recipe` names inside it (a docs-only block has none)', () => {
    const r = lookup.parseRecipes(FIXTURE);
    expect(r.map((s: any) => [s.title, s.ids])).toEqual([['A pop-in (a card)', ['pop-in']], ['Words that slam', ['slam-words']]]);
    expect(r[0].text).toContain('prose of the first');
    expect(r[0].text).not.toContain('prose of the second');
    expect(r[0].text.trim().endsWith('---')).toBe(false);                      // the separator belongs to nobody
  });

  it('a section with no named block is still listed (by a name made from its title) and found by it, so no recipe hides from `recipe`', () => {
    const md = '## Hidden gem (a thing)\n\n```js\n// @docs-only\nx\n```\n';
    const r = lookup.parseRecipes(md);
    expect(r[0].ids).toEqual([]);
    expect(lookup.recipeId(r[0])).toBe('hidden-gem-a-thing');
    expect(lookup.findRecipe(r, 'hidden-gem-a-thing').section.title).toBe('Hidden gem (a thing)');
    expect(lookup.runLookup('recipe', [], { root: lookup.PACKAGE_ROOT }).stdout).toMatch(/placeholder-images/);
  });

  it('findRecipe: an exact id; a unique part of one; several matches are listed; nothing matches with a nearest guess', () => {
    const r = lookup.parseRecipes(FIXTURE);
    expect(lookup.findRecipe(r, 'slam-words').section.title).toBe('Words that slam');
    expect(lookup.findRecipe(r, 'slam').section.title).toBe('Words that slam');
    expect(lookup.findRecipe(r, 'a').many.map((s: any) => s.ids[0])).toEqual(['pop-in', 'slam-words']);
    const none = lookup.findRecipe(r, 'slam-wrods');
    expect(none.section).toBeUndefined();
    expect(none.nearest).toBe('slam-words');
  });

  it('the real recipes.md: every id is in exactly one section, there are at least 40, and each section carries its code', () => {
    const md = readFileSync(join(root, 'skills/pixi-effects/reference/recipes.md'), 'utf8');
    const r = lookup.parseRecipes(md);
    const ids = r.flatMap((s: any) => s.ids);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of r.filter((x: any) => x.ids.length)) expect(s.text).toContain('```js');
    expect(ids).toContain('slam-words');
    expect(ids).toContain('two-formats');
    for (const id of ['slideshow-cuts', 'placeholder-images']) expect(ids, id).toContain(id);       // a plain cut and generated images: asked for by two agents
    expect(r.filter((s: any) => s.ids.length === 0).map((s: any) => s.title), 'every recipe section has a name `recipe` can list').toEqual([]);
  });
});

describe('help: search the docs for a word', () => {
  it('finds the sections about it, headings first, each cut to a few lines with where the rest is; nothing for a word that is nowhere', () => {
    const hits = lookup.searchDocs(root, 'mask');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits[0].heading.toLowerCase()).toContain('mask');
    for (const h of hits) { expect(h.file).toMatch(/\.md$/); expect(h.lines.length).toBeLessThanOrEqual(30); }
    expect(lookup.searchDocs(root, 'qwertyzzzz')).toEqual([]);
  });

  it('knows the layer words an agent asks about, and the one that was removed', () => {
    expect(lookup.searchDocs(root, 'threeD').length).toBeGreaterThan(0);
    expect(lookup.searchDocs(root, 'keyframes').length).toBeGreaterThan(0);
    const inv = lookup.formatHelp(lookup.searchDocs(root, 'maskInverted'), 'maskInverted').join('\n');
    expect(inv).toMatch(/invert: true/);                                        // the pitfall that says what replaced it
  });

  it('formatHelp keeps the whole answer short (at most 170 lines) and ends with the next step', () => {
    const out = lookup.formatHelp(lookup.searchDocs(root, 'text'), 'text');
    expect(out.length).toBeLessThanOrEqual(170);
    expect(out.join('\n')).toMatch(/recipe|help/);
  });
});

describe('new: a page to start from', () => {
  it('says where the file is, in full, and which folder it is in (an agent that works from another folder finds it again)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-'));
    const out = lookup.runLookup('new', ['where'], { root: lookup.PACKAGE_ROOT, cwd: dir }).stdout;
    expect(out).toContain(join(dir, 'where.html'));
    expect(out).toMatch(/created where\.html/);
    expect(out).toMatch(/in the folder/);
  });

  it('writes <name>.html from the template, titled with the name and pinned to this package\'s version; it will not overwrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-'));
    const r = lookup.newPage('My Film', { cwd: dir, root });
    expect(r.file).toBe(join(dir, 'My-Film.html'));
    const html = readFileSync(r.file, 'utf8');
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    expect(html).toContain('<title>My Film</title>');
    expect(html).toContain(`pixi-effects@${version}/dist/index.js`);
    expect(html).toContain('window.__logs');
    expect(() => lookup.newPage('My Film', { cwd: dir, root })).toThrow(/already exists/);
    expect(lookup.newPage('My Film', { cwd: dir, root, force: true }).file).toBe(r.file);
  });

  it('a name that is already a .html file keeps it; a path is kept (a folder that exists)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-'));
    expect(lookup.newPage('clip.html', { cwd: dir, root }).file).toBe(join(dir, 'clip.html'));
  });
});

describe('help finds what is there: a heading written with spaces, a table row, a function-like word', () => {
  const top = (w: string, n = 1) => lookup.searchDocs(root, w).slice(0, n).map((h: { file: string; heading: string }) => `${h.file}: ${h.heading}`);

  it('motionBlur (one word) finds the section "Motion blur" (two words)', () => {
    expect(top('motionBlur')[0]).toMatch(/Motion blur/);
  });

  it('path finds the shapes table where `path` is a row among the first three, not only the helpers whose name contains it (followPath, cameraPath)', () => {
    expect(top('path', 3).join('\n')).toMatch(/dsl\.md: `shape`/);
  });

  it('steps finds the easing section, where `steps(n)` is written, before the music and the stops', () => {
    expect(top('steps')[0]).toMatch(/Easing/);
  });

  it('a section whose heading IS the word comes first: canvas finds the `canvas` layer, shader the `shader` layer', () => {
    expect(top('canvas')[0]).toMatch(/dsl\.md: `canvas`/);
    expect(top('shader')[0]).toMatch(/dsl\.md: `shader`/);
  });

  it('a word that merely stands before a bracket in plain prose (a sentence like "behind the camera (the warning …") is not a call: camera still finds the Camera section first', () => {
    expect(top('camera')[0]).toMatch(/dsl\.md: Camera/);
  });

  it('a word that is only a prefix of a heading still works as before (mask, threeD, keyframes)', () => {
    for (const w of ['mask', 'threeD', 'keyframes']) expect(lookup.searchDocs(root, w).length).toBeGreaterThan(0);
  });
});

describe('new --size WxH --duration S: the page starts at the size and length asked for (the template had to be edited in three places)', () => {
  it('sets the canvas attributes and the W / H / DURATION constants; the poster follows the duration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-size-'));
    const r = cli(['new', 'tall', '--size', '1080x1920', '--duration', '24'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/1080x1920 page/);
    const html = readFileSync(join(dir, 'tall.html'), 'utf8');
    expect(html).toContain('<canvas id="stage" width="1080" height="1920">');
    expect(html).toContain('const W = 1080, H = 1920, FPS = 30, DURATION = 24;');
    expect(html).not.toContain('1280');
    expect(html).toContain('poster: DURATION * 0.75');
  });

  it('a tall or square page is shown at a width that fits a laptop screen (about 760 px high at most), a wide one stays 960 px wide', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-size-'));
    const stage = (args: string[], name: string) => { cli(['new', name, ...args], dir); return readFileSync(join(dir, `${name}.html`), 'utf8').match(/\.stage \{ position: relative; width: ([^;]+);/)![1];  };
    expect(stage(['--size', '1280x720'], 'wide')).toBe('min(960px, 100%)');
    expect(stage([], 'plain')).toBe('min(960px, 100%)');
    expect(stage(['--size', '1080x1920'], 'tall')).toBe('min(428px, 100%)');
    expect(stage(['--size', '1080x1080'], 'square')).toBe('min(760px, 100%)');
    expect(stage(['--size', '1080x1350'], 'four-five')).toBe('min(608px, 100%)');
  });

  it('without them the page is the usual 1280x720, 6 s; a bad size or duration says what is accepted and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-size-'));
    expect(readFileSync(lookup.newPage('plain', { cwd: dir, root }).file, 'utf8')).toContain('const W = 1280, H = 720, FPS = 30, DURATION = 6;');
    for (const bad of [['--size', '1080'], ['--size', '0x720'], ['--size', '9000x9000'], ['--duration', '0'], ['--duration', 'long'], ['--duration', '0x10'], ['--duration', '-5'], ['--size']]) {
      const r = cli(['new', 'bad', ...bad], dir);
      expect(r.status, bad.join(' ')).toBe(1);
      expect(r.stderr).toMatch(/--size 1920x1080|--duration 12|--duration takes/);
      expect(existsSync(join(dir, 'bad.html'))).toBe(false);
    }
  });
});

describe('new: an option nobody knows is refused, not turned into a page name', () => {
  it('`new vid --fps 60` and `new --width 1920 vid` exit 1 naming the accepted options and write nothing; --size=WxH and a name after the flags work', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-flags-'));
    for (const args of [['vid', '--fps', '60'], ['--width', '1920', 'vid'], ['vid', '-o', 'x']]) {
      const r = cli(['new', ...args], dir);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.stderr).toMatch(/unknown option (--fps|--width|-o).*--size WxH, --duration S/);
    }
    expect(existsSync(join(dir, 'vid.html'))).toBe(false);
    expect(existsSync(join(dir, '--fps.html'))).toBe(false);
    expect(cli(['new', '--size=1920x1080', 'ok'], dir).status).toBe(0);
    expect(readFileSync(join(dir, 'ok.html'), 'utf8')).toContain('const W = 1920, H = 1080, FPS = 30, DURATION = 6;');
  });
});

describe('the command: pixi-effects recipe | help | new', () => {
  it('recipe with no id lists them; with an id prints the section; an id nobody has says the nearest and exits 1', () => {
    const list = cli(['recipe']);
    expect(list.status).toBe(0);
    expect(list.stdout).toMatch(/slam-words/);
    const one = cli(['recipe', 'slam-words']);
    expect(one.status).toBe(0);
    expect(one.stdout).toContain('// @recipe slam-words');
    expect(one.stdout).not.toContain('// @recipe lower-third');
    const none = cli(['recipe', 'slam-wrods']);
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/did you mean "slam-words"/);
  });

  it('help <word> prints the sections; help alone says what to ask; a word that is nowhere exits 1', () => {
    const h = cli(['help', 'mask']);
    expect(h.status).toBe(0);
    expect(h.stdout.length).toBeGreaterThan(200);
    expect(cli(['help']).stdout).toMatch(/help <word>/);
    expect(cli(['help', 'qwertyzzzz']).status).toBe(1);
  });

  it('new makes the page in the current folder and says what to type next', () => {
    const dir = mkdtempSync(join(tmpdir(), 'new-'));
    const r = cli(['new', 'demo'], dir);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'demo.html'))).toBe(true);
    expect(r.stdout).toMatch(/pixi-effects view demo\.html/);
    expect(cli(['new', 'demo'], dir).status).toBe(1);                           // exists
  });

  it('the usage and the unknown-command message name the new commands', () => {
    expect(cli([]).stdout + cli([]).stderr).toMatch(/recipe/);
    expect(cli(['zzz']).stderr).toMatch(/check, render, view, probe, trim, frames, sound, audio, concat, recipe, help, new/);
    expect(cli(['recepie']).stderr).toMatch(/did you mean "recipe"/);
  });
});

describe('quickstart: the first page, as a command (an agent typed `npx pixi-effects quickstart`; AGENTS.md names a file)', () => {
  it('prints the quickstart of the package and is a command like recipe and help', () => {
    const r = cli(['quickstart']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(readFileSync(join(root, 'skills/pixi-effects/reference/quickstart.md'), 'utf8').replace(/\n?$/, '\n'));
    expect(r.stdout.length).toBeGreaterThan(500);
    expect(lookup.LOOKUP_COMMANDS).toContain('quickstart');
    expect(cli([]).stdout + cli([]).stderr, 'the usage lists it').toMatch(/quickstart/);
  });
});
