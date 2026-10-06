import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { buildGallery, readPiece, MODELS, FEATURED } from '../../scripts/build-gallery.mjs';

const root = resolve(__dirname, '../..');
const gallery = resolve(root, 'examples/gallery');
const ids = readdirSync(gallery)
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => f.slice(0, -'.html'.length))
  .sort();

type Piece = {
  id: string; title: string; subtitle: string; tags: string[]; width: number; height: number;
  duration: number; posterFrame: number; model: string; page: string; poster: string; notes: string | null;
};

describe('examples/gallery pieces', () => {
  it('there are pieces', () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  describe.each(ids)('%s', (id) => {
    const html = readFileSync(resolve(gallery, `${id}.html`), 'utf8');

    it('has a valid #piece-meta block', () => {
      const r = readPiece(id, html, { posterExists: true, notesExists: true }) as { piece?: Piece; errors?: string[] };
      expect(r.errors, r.errors?.join('\n')).toBeUndefined();
      const p = r.piece!;
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.duration).toBeGreaterThan(0);
      expect(p.posterFrame).toBeGreaterThanOrEqual(0);
      expect(MODELS).toContain(p.model);
      expect(p.posterFrame).toBeLessThan(p.duration * 30 + 1);     // 30 fps pieces: the poster frame is inside the piece
    });

    it('has a poster at posters/<id>.jpg', () => {
      expect(existsSync(resolve(gallery, 'posters', `${id}.jpg`))).toBe(true);
    });

    it('has stumble notes at _notes/<id>.md', () => {
      expect(existsSync(resolve(gallery, '_notes', `${id}.md`))).toBe(true);
    });

    it('is listed in MODELS.md with the model from its meta', () => {
      const models = readFileSync(resolve(gallery, 'MODELS.md'), 'utf8');
      const row = models.split('\n').find((l) => l.includes(`${id}.html`));
      expect(row, `${id}.html is not in MODELS.md`).toBeDefined();
      const meta = JSON.parse(html.match(/id="piece-meta"[^>]*>([\s\S]*?)<\/script>/)![1]!);
      expect(row!.split('|').map((c) => c.trim())[1]).toBe(meta.model);
    });
  });
});

describe('examples/gallery/pieces.json', () => {
  // The generator refuses to run while any piece is incomplete (no meta / no poster). Keep that failure to one
  // test with the script's own message, so the per-piece checks above still say exactly which piece is at fault.
  let built: { pieces: Piece[]; json: string } | null = null;
  let buildError: unknown = null;
  try {
    built = buildGallery(root) as { pieces: Piece[]; json: string };
  } catch (e) {
    buildError = e;
  }
  const pieces = built?.pieces ?? [];
  const json = built?.json ?? '';

  it('the generator accepts every piece', () => {
    if (buildError) throw buildError;
  });

  it.skipIf(!built)('is committed and up to date (run `node scripts/build-gallery.mjs` after adding or editing a piece)', () => {
    const file = resolve(gallery, 'pieces.json');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(json);
  });

  it.skipIf(!built)('contains every piece exactly once', () => {
    expect(pieces.map((p) => p.id).sort()).toEqual(ids);
  });

  it.skipIf(!built)('is ordered: featured pieces first in FEATURED order, then by title', () => {
    const rank = new Map<string, number>((FEATURED as string[]).map((id, i) => [id, i]));
    const featured = pieces.filter((p) => rank.has(p.id)).map((p) => rank.get(p.id)!);
    expect(featured).toEqual([...featured].sort((a, b) => a - b));
    const rest = pieces.filter((p) => !rank.has(p.id)).map((p) => p.title);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')));
    expect(pieces.findIndex((p) => !rank.has(p.id))).toBe(featured.length ? (pieces.length === featured.length ? -1 : featured.length) : 0);
  });

  it('every featured id that exists on disk is a real piece (no typos in FEATURED)', () => {
    for (const id of FEATURED as string[]) expect(ids, `FEATURED lists ${id}, which has no ${id}.html`).toContain(id);
  });

  it.skipIf(!built)('every path it points to exists', () => {
    for (const p of pieces) {
      expect(existsSync(resolve(gallery, p.page)), p.page).toBe(true);
      expect(existsSync(resolve(gallery, p.poster)), p.poster).toBe(true);
      expect(p.notes, `${p.id} has no notes`).not.toBeNull();
      expect(existsSync(resolve(gallery, p.notes!)), p.notes!).toBe(true);
    }
  });
});

describe('examples/gallery/index.html', () => {
  const html = readFileSync(resolve(gallery, 'index.html'), 'utf8');

  it('loads pieces.json with a relative path and has a short title', () => {
    expect(html).toMatch(/fetch\(\s*['"]pieces\.json['"]/);
    const title = html.match(/<title>([^<]+)<\/title>/)![1]!.trim();
    expect(title.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    expect(title.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it('only talks to Google Fonts, never to other hosts', () => {
    const hosts = [...html.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map((m) => m[1]!);
    for (const h of new Set(hosts)) expect(['fonts.googleapis.com', 'fonts.gstatic.com', 'github.com']).toContain(h);
  });
});
