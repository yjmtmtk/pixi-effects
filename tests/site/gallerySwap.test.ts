// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const swap: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/gallery-swap.mjs')).href);

const page = (meta: object, extra = '', importmap = '"pixi-effects": "https://cdn.jsdelivr.net/npm/pixi-effects@0.35.0/dist/index.js", "pixi-effects/controller": "https://cdn.jsdelivr.net/npm/pixi-effects@0.35.0/dist/Controller.js", "pixi-effects/three": "https://cdn.jsdelivr.net/npm/pixi-effects@0.35.0/dist/three.js", "pixi.js": "https://esm.sh/pixi.js@8.22.0?bundle-deps"') =>
  `<!doctype html><html><head><title>t</title><script type="importmap">{ "imports": { ${importmap} } }</script></head><body>
<script type="application/json" id="piece-meta">${JSON.stringify(meta)}</script>${extra}</body></html>`;

const META_OLD = { title: 'Old Piece', subtitle: 'the weak one', tags: ['a'], width: 1280, height: 720, duration: 12, model: 'sonnet' };
const META_NEW = { title: 'New Piece', subtitle: 'the strong one', tags: ['b'], width: 720, height: 1280, duration: 10, model: 'opus' };

/** A miniature repository with every place a gallery piece is written down. */
function fixture() {
  const r = mkdtempSync(join(tmpdir(), 'swap-'));
  const g = join(r, 'examples/gallery');
  mkdirSync(join(g, 'posters'), { recursive: true }); mkdirSync(join(g, '_notes'), { recursive: true });
  mkdirSync(join(r, 'scripts')); mkdirSync(join(r, 'docs'), { recursive: true }); mkdirSync(join(r, 'site/landing'), { recursive: true });
  mkdirSync(join(r, 'skills/pixi-effects/reference'), { recursive: true }); mkdirSync(join(r, 'docs/superpowers/plans'), { recursive: true });
  writeFileSync(join(g, 'old.html'), page(META_OLD, '', '"pixi-effects": "../../dist/index.js"'));
  writeFileSync(join(g, 'other.html'), page({ ...META_OLD, title: 'Other', model: 'fable' }));
  writeFileSync(join(g, 'posters/old.jpg'), 'jpg'); writeFileSync(join(g, 'posters/other.jpg'), 'jpg');
  writeFileSync(join(g, 'posters/manifest.json'), JSON.stringify({ old: { poster: 1, posterFrame: 30, hash: 'x' }, other: { poster: 1, posterFrame: 30, hash: 'y' } }));
  writeFileSync(join(g, '_notes/old.md'), '# old notes');
  writeFileSync(join(g, 'MODELS.md'), `# Gallery\n\n| Model | Piece | Size | File |\n|---|---|---|---|\n| fable | Other — x | 1280×720 | other.html |\n| sonnet | Old Piece — the weak one | 1280×720 | old.html |\n\nCounts: fable 1, opus 0, sonnet 1, haiku 0 (2 pieces).\n\n\`old\` (sonnet): made on 2026-10-06.\n`);
  writeFileSync(join(r, 'scripts/build-gallery.mjs'), `export const FEATURED = [\n  'other',\n  'old',\n];\n`);
  writeFileSync(join(r, 'index.html'), `<h2>2 pieces</h2>\n<h2 id="h-gal">2 pieces, each one file of data</h2>\n      <a class="piece" href="examples/gallery/#other" data-piece="other"><figure style="margin:0"><div class="frame"><img src="examples/gallery/posters/other.jpg" width="640" height="360" loading="lazy" alt="Other"></div><figcaption><b>Other</b><span>1280×720 · 12 s · fable</span></figcaption></figure></a>\n      <a class="piece" href="examples/gallery/#old" data-piece="old"><figure style="margin:0"><div class="frame"><img src="examples/gallery/posters/old.jpg" width="640" height="360" loading="lazy" alt="Old"></div><figcaption><b>Old Piece</b><span>1280×720 · 12 s · sonnet</span></figcaption></figure></a>\n      <p class="tally"><span>2 pieces</span><span>written by <b>fable 1</b> · <b>sonnet 1</b></span></p>\n`);
  writeFileSync(join(r, 'docs/example.md'), `Some text.\n\nSee examples/gallery/old.html for springs.\n`);
  writeFileSync(join(r, 'site/landing/FACTS.md'), `- Gallery: 2 complete pieces (fable 1, opus 0, sonnet 1, haiku 0), from type to data.\n`);
  writeFileSync(join(r, 'skills/pixi-effects/reference/cheatsheet.md'), `See old for a worked example.\n`);
  writeFileSync(join(r, 'CHANGELOG.md'), `## 0.1\nAdded the old piece (old).\n`);
  writeFileSync(join(r, 'docs/superpowers/plans/p.md'), `old old old\n`);
  return r;
}

const newPage = (extra = '') => { const d = mkdtempSync(join(tmpdir(), 'swap-new-')); const f = join(d, 'fresh.html'); writeFileSync(f, page(META_NEW, extra)); return f; };
const read = (r: string, p: string) => readFileSync(join(r, p), 'utf8');

describe('gallery-swap: replace one piece by another', () => {
  it('a dry run lists the changes and writes nothing', async () => {
    const r = fixture(); const file = newPage();
    const res = await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', dryRun: true, posters: false });
    expect(res.changes.join('\n')).toMatch(/examples\/gallery\/fresh\.html/);
    expect(existsSync(join(r, 'examples/gallery/fresh.html'))).toBe(false);
    expect(existsSync(join(r, 'examples/gallery/old.html'))).toBe(true);
  });

  it('swaps the files: new page in, old page, poster, notes and manifest entry out; the new importmap points at the local build', async () => {
    const r = fixture(); const file = newPage();
    await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', posters: false });
    const g = 'examples/gallery';
    expect(existsSync(join(r, g, 'fresh.html'))).toBe(true);
    for (const gone of ['old.html', 'posters/old.jpg', '_notes/old.md']) expect(existsSync(join(r, g, gone)), gone).toBe(false);
    const manifest = JSON.parse(read(r, `${g}/posters/manifest.json`));
    expect(manifest.old).toBeUndefined(); expect(manifest.other).toBeDefined();
    const html = read(r, `${g}/fresh.html`);
    expect(html).toContain('"pixi-effects": "../../dist/index.js"');
    expect(html).toContain('"pixi-effects/controller": "../../dist/Controller.js"');
    expect(html).toContain('"pixi-effects/three": "../../dist/three.js"');
    expect(html).toContain('https://esm.sh/pixi.js@8.22.0?bundle-deps');            // the other imports stay as they are
  });

  it('rewrites every place that names the piece: MODELS row and counts, FEATURED, the landing card and tally, FACTS', async () => {
    const r = fixture(); const file = newPage();
    await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', posters: false });
    const models = read(r, 'examples/gallery/MODELS.md');
    expect(models).toContain('| opus | New Piece — the strong one | 720×1280 | fresh.html |');
    expect(models).not.toContain('old.html');
    expect(models).toContain('Counts: fable 1, opus 1, sonnet 0, haiku 0 (2 pieces).');
    expect(read(r, 'scripts/build-gallery.mjs')).toContain("  'fresh',");
    expect(read(r, 'scripts/build-gallery.mjs')).not.toContain("'old'");
    const index = read(r, 'index.html');
    expect(index).toContain('data-piece="fresh"');
    expect(index).toContain('src="examples/gallery/posters/fresh.jpg" width="360" height="640"');       // a 9:16 card
    expect(index).toContain('<figcaption><b>New Piece</b><span>720×1280 · 10 s · opus</span></figcaption>');
    expect(index).not.toContain('data-piece="old"');
    expect(index).toContain('<span>written by <b>fable 1</b> · <b>opus 1</b></span>');
    expect(read(r, 'site/landing/FACTS.md')).toContain('(fable 1, opus 1, sonnet 0, haiku 0)');
  });

  it('lists what only a person can fix (other mentions) and leaves the history alone', async () => {
    const r = fixture(); const file = newPage();
    const res = await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', posters: false });
    const review = res.review.join('\n');
    expect(review).toMatch(/docs\/example\.md/);                       // prose that names the old piece
    expect(review).toMatch(/skills\/pixi-effects\/reference\/cheatsheet\.md/);
    expect(review).not.toMatch(/CHANGELOG|docs\/superpowers/);
    expect(read(r, 'CHANGELOG.md')).toContain('old');
    expect(read(r, 'docs/superpowers/plans/p.md')).toBe('old old old\n');
  });

  it('keeps the notes the author wrote under the new id', async () => {
    const r = fixture(); const file = newPage(); const notes = join(tmpdir(), 'n-' + Date.now() + '.md'); writeFileSync(notes, '# fresh notes');
    await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', notes, posters: false });
    expect(read(r, 'examples/gallery/_notes/fresh.md')).toBe('# fresh notes');
  });

  it('refuses, with a sentence: a missing old piece, a new id that exists, bad metadata, a duration outside 8-14 s, a web font or any outside file', async () => {
    const r = fixture();
    await expect(swap.swapPiece(r, { oldId: 'nope', file: newPage(), newId: 'fresh', posters: false })).rejects.toThrow(/no gallery piece "nope"/);
    await expect(swap.swapPiece(r, { oldId: 'old', file: newPage(), newId: 'other', posters: false })).rejects.toThrow(/"other" already exists/);
    const d = mkdtempSync(join(tmpdir(), 'bad-'));
    writeFileSync(join(d, 'nometa.html'), '<html><body>no meta</body></html>');
    await expect(swap.swapPiece(r, { oldId: 'old', file: join(d, 'nometa.html'), newId: 'fresh', posters: false })).rejects.toThrow(/piece-meta/);
    writeFileSync(join(d, 'long.html'), page({ ...META_NEW, duration: 40 }));
    await expect(swap.swapPiece(r, { oldId: 'old', file: join(d, 'long.html'), newId: 'fresh', posters: false })).rejects.toThrow(/8 to 14 s/);
    writeFileSync(join(d, 'font.html'), page(META_NEW, '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">'));
    await expect(swap.swapPiece(r, { oldId: 'old', file: join(d, 'font.html'), newId: 'fresh', posters: false })).rejects.toThrow(/web font/);
    writeFileSync(join(d, 'img.html'), page(META_NEW, '<img src="https://example.com/a.png">'));
    await expect(swap.swapPiece(r, { oldId: 'old', file: join(d, 'img.html'), newId: 'fresh', posters: false })).rejects.toThrow(/outside/);
    expect(existsSync(join(r, 'examples/gallery/old.html'))).toBe(true);        // a refusal changes nothing
  });

  it('the same id means "update this piece in place" (a retrofit): the page is replaced, its poster is made again, references stay', async () => {
    const r = fixture(); const file = newPage();
    await swap.swapPiece(r, { oldId: 'old', file, newId: 'old', posters: false });
    expect(read(r, 'examples/gallery/old.html')).toContain('New Piece');
    expect(existsSync(join(r, 'examples/gallery/posters/old.jpg'))).toBe(false);          // regenerated by make-posters
    expect(JSON.parse(read(r, 'examples/gallery/posters/manifest.json')).old).toBeUndefined();
    expect(read(r, 'docs/example.md')).toContain('examples/gallery/old.html');
    expect(read(r, 'scripts/build-gallery.mjs')).toContain("'old'");
  });

  it('an update in place keeps the landing card as it is (its hand-written alt text), and only the tally is recounted', async () => {
    const r = fixture(); const file = newPage();
    const before = read(r, 'index.html').match(/<a class="piece"[^\n]*data-piece="old">[\s\S]*?<\/a>/)![0];
    await swap.swapPiece(r, { oldId: 'old', file, newId: 'old', posters: false });
    expect(read(r, 'index.html')).toContain(before);
    expect(read(r, 'index.html')).toContain('<span>written by <b>fable 1</b> · <b>opus 1</b></span>');
  });
});

describe('gallery-swap: remove a piece for good', () => {
  it('a dry run lists what would go and writes nothing', async () => {
    const r = fixture();
    const res = await swap.removePiece(r, { id: 'old', dryRun: true, posters: false });
    expect(res.changes.join('\n')).toMatch(/old\.html: removed/);
    expect(existsSync(join(r, 'examples/gallery/old.html'))).toBe(true);
  });

  it('takes the page, poster, notes and manifest entry away and leaves the other piece alone', async () => {
    const r = fixture(); const g = 'examples/gallery';
    await swap.removePiece(r, { id: 'old', posters: false });
    for (const gone of ['old.html', 'posters/old.jpg', '_notes/old.md']) expect(existsSync(join(r, g, gone)), gone).toBe(false);
    expect(existsSync(join(r, g, 'other.html'))).toBe(true);
    const manifest = JSON.parse(read(r, `${g}/posters/manifest.json`));
    expect(manifest.old).toBeUndefined(); expect(manifest.other).toBeDefined();
  });

  it('removes the MODELS row, the FEATURED line and the landing card, and fixes the counts and the tallies', async () => {
    const r = fixture();
    await swap.removePiece(r, { id: 'old', posters: false });
    const models = read(r, 'examples/gallery/MODELS.md');
    expect(models).not.toContain('old.html');
    expect(models).toContain('| fable | Other — x | 1280×720 | other.html |');
    expect(models).toContain('Counts: fable 1, opus 0, sonnet 0, haiku 0 (1 pieces).');
    expect(read(r, 'scripts/build-gallery.mjs')).not.toContain("'old'");
    expect(read(r, 'scripts/build-gallery.mjs')).toContain("'other'");
    const index = read(r, 'index.html');
    expect(index).not.toContain('data-piece="old"');
    expect(index).toContain('data-piece="other"');
    expect(index).toContain('<span>1 pieces</span>');
    expect(index).toContain('<h2>2 pieces</h2>');                                       // a heading that is not the tally is not touched
    expect(index).toContain('written by <b>fable 1</b></span>');
    expect(index).toContain('<h2 id="h-gal">1 pieces, each one file of data</h2>');
    expect(read(r, 'site/landing/FACTS.md')).toContain('(fable 1, opus 0, sonnet 0, haiku 0)');
    expect(read(r, 'site/landing/FACTS.md')).toContain('Gallery: 1 complete pieces');
  });

  it('lists the mentions for a person, and never touches the history files', async () => {
    const r = fixture();
    const { review } = await swap.removePiece(r, { id: 'old', posters: false });
    const text = review.join('\n');
    expect(text).toMatch(/docs\/example\.md:3/);
    expect(text).toMatch(/skills\/pixi-effects\/reference\/cheatsheet\.md:1/);
    expect(text).not.toMatch(/CHANGELOG|docs\/superpowers/);
    expect(read(r, 'CHANGELOG.md')).toContain('(old)');
  });

  it('refuses a piece that does not exist', async () => {
    await expect(swap.removePiece(fixture(), { id: 'nope', posters: false })).rejects.toThrow(/no gallery piece "nope"/);
  });
});

describe('gallery-swap: add a piece (no old one to replace)', () => {
  it('a dry run lists the changes and writes nothing', async () => {
    const r = fixture(); const file = newPage();
    const res = await swap.addPiece(r, { file, id: 'fresh', dryRun: true, posters: false });
    expect(res.changes.join('\n')).toMatch(/examples\/gallery\/fresh\.html/);
    expect(existsSync(join(r, 'examples/gallery/fresh.html'))).toBe(false);
  });

  it('puts the page in with its importmap on the local build, keeps the notes, and leaves every other piece alone', async () => {
    const r = fixture(); const file = newPage(); const g = 'examples/gallery';
    const notes = join(mkdtempSync(join(tmpdir(), 'swap-notes-')), 'n.md'); writeFileSync(notes, '# usability');
    await swap.addPiece(r, { file, id: 'fresh', notes, posters: false });
    expect(read(r, `${g}/fresh.html`)).toContain('"pixi-effects": "../../dist/index.js"');
    expect(read(r, `${g}/_notes/fresh.md`)).toBe('# usability');
    for (const kept of ['old.html', 'other.html', 'posters/old.jpg']) expect(existsSync(join(r, g, kept)), kept).toBe(true);
  });

  it('adds the MODELS row and recounts: the counts, the landing tally, the heading and FACTS; the landing cards are not touched', async () => {
    const r = fixture(); const file = newPage();
    await swap.addPiece(r, { file, id: 'fresh', posters: false });
    const models = read(r, 'examples/gallery/MODELS.md');
    expect(models).toContain('| opus | New Piece — the strong one | 720×1280 | fresh.html |');
    expect(models).toContain('Counts: fable 1, opus 1, sonnet 1, haiku 0 (3 pieces).');
    const index = read(r, 'index.html');
    expect(index).toContain('<span>3 pieces</span>');
    expect(index).toContain('<span>written by <b>fable 1</b> · <b>opus 1</b> · <b>sonnet 1</b></span>');
    expect(index).toContain('<h2 id="h-gal">3 pieces, each one file of data</h2>');
    expect(index).not.toContain('data-piece="fresh"');
    expect(read(r, 'site/landing/FACTS.md')).toContain('Gallery: 3 complete pieces (fable 1, opus 1, sonnet 1, haiku 0)');
  });

  it('refuses an id that exists, a bad id and a page that breaks the gallery rules, and changes nothing', async () => {
    const r = fixture();
    await expect(swap.addPiece(r, { file: newPage(), id: 'old', posters: false })).rejects.toThrow(/already exists/);
    await expect(swap.addPiece(r, { file: newPage(), id: 'Bad Id', posters: false })).rejects.toThrow(/kebab-case/);
    const d = mkdtempSync(join(tmpdir(), 'swap-long-')); const f = join(d, 'long.html'); writeFileSync(f, page({ ...META_NEW, duration: 30 }));
    await expect(swap.addPiece(r, { file: f, id: 'long', posters: false })).rejects.toThrow(/8 to 14 s/);
    expect(existsSync(join(r, 'examples/gallery/long.html'))).toBe(false);
  });
});
