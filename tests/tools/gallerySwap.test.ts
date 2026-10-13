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
  mkdirSync(join(r, 'scripts')); mkdirSync(join(r, 'site/guide'), { recursive: true }); mkdirSync(join(r, 'site/landing'), { recursive: true });
  mkdirSync(join(r, 'skills/pixi-effects/reference'), { recursive: true }); mkdirSync(join(r, 'docs/superpowers/plans'), { recursive: true });
  writeFileSync(join(g, 'old.html'), page(META_OLD, '', '"pixi-effects": "../../dist/index.js"'));
  writeFileSync(join(g, 'other.html'), page({ ...META_OLD, title: 'Other', model: 'fable' }));
  writeFileSync(join(g, 'posters/old.jpg'), 'jpg'); writeFileSync(join(g, 'posters/other.jpg'), 'jpg');
  writeFileSync(join(g, 'posters/manifest.json'), JSON.stringify({ old: { poster: 1, posterFrame: 30, hash: 'x' }, other: { poster: 1, posterFrame: 30, hash: 'y' } }));
  writeFileSync(join(g, '_notes/old.md'), '# old notes');
  writeFileSync(join(g, 'MODELS.md'), `# Gallery\n\n| Model | Piece | Size | File |\n|---|---|---|---|\n| fable | Other — x | 1280×720 | other.html |\n| sonnet | Old Piece — the weak one | 1280×720 | old.html |\n\nCounts: fable 1, opus 0, sonnet 1, haiku 0 (2 pieces).\n\n\`old\` (sonnet): made on 2026-10-06.\n`);
  writeFileSync(join(r, 'scripts/build-gallery.mjs'), `export const FEATURED = [\n  'other',\n  'old',\n];\n`);
  writeFileSync(join(r, 'index.html'), `<h2>2 pieces</h2>\n      <a class="piece" href="examples/gallery/#other" data-piece="other"><figure style="margin:0"><div class="frame"><img src="examples/gallery/posters/other.jpg" width="640" height="360" loading="lazy" alt="Other"></div><figcaption><b>Other</b><span>1280×720 · 12 s · fable</span></figcaption></figure></a>\n      <a class="piece" href="examples/gallery/#old" data-piece="old"><figure style="margin:0"><div class="frame"><img src="examples/gallery/posters/old.jpg" width="640" height="360" loading="lazy" alt="Old"></div><figcaption><b>Old Piece</b><span>1280×720 · 12 s · sonnet</span></figcaption></figure></a>\n      <p class="tally"><span>2 pieces</span><span>written by <b>fable 1</b> · <b>sonnet 1</b></span><span>+ 15 numbered examples</span></p>\n`);
  writeFileSync(join(r, 'site/guide/motion.md'), `Some text.\n\n{{demo examples/gallery/old.html}}\n\nThe old piece above shows springs.\n`);
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

  it('rewrites every place that names the piece: MODELS row and counts, FEATURED, the landing card and tally, the guide embed, FACTS', async () => {
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
    expect(read(r, 'site/guide/motion.md')).toContain('{{demo examples/gallery/fresh.html}}');
    expect(read(r, 'site/landing/FACTS.md')).toContain('(fable 1, opus 1, sonnet 0, haiku 0)');
  });

  it('lists what only a person can fix (prose near an embed, other mentions) and leaves the history alone', async () => {
    const r = fixture(); const file = newPage();
    const res = await swap.swapPiece(r, { oldId: 'old', file, newId: 'fresh', posters: false });
    const review = res.review.join('\n');
    expect(review).toMatch(/site\/guide\/motion\.md/);                 // the prose after the embed may describe the old piece
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
    expect(read(r, 'site/guide/motion.md')).toContain('{{demo examples/gallery/old.html}}');
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
