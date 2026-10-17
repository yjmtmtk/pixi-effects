// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// movie.pick({ alpha }) on a text layer: the letters, not the box. The truth is the picture itself: a white letter on black, read back from a snapshot.
runFilms('pick({ alpha }) looks at the glyphs of a text layer', () => {
  const grid = (name: string) => `(async () => {
    const img = await pixelsOf();
    const box = movie.inspect(0).then(r => r.layers.find(l => l.name === '${name}').bounds);
    const b = await box;
    let agree = 0, total = 0, boxHits = 0, glyphHits = 0, pixelsLit = 0;
    for (let y = Math.floor(b.y); y < b.y + b.height; y += 3) for (let x = Math.floor(b.x); x < b.x + b.width; x += 3) {
      const lit = img.data[(y * img.width + x) * 4] > 128;
      const hit = !!movie.pick(x, y, { only: ['${name}'], alpha: 0.3 });
      const inBox = !!movie.pick(x, y, { only: ['${name}'] });
      total++; if (hit === lit) agree++; if (inBox) boxHits++; if (hit) glyphHits++; if (lit) pixelsLit++;
    }
    return { agree, total, boxHits, glyphHits, pixelsLit };
  })()`;

  it("a point in the box but off the letters is not a hit with { alpha } (a plain word, an outlined one, a line of spans), and is a hit without it", async () => {
    await withFilm('pick-text', async (film) => {
      for (const name of ['word', 'outlined', 'line']) {
        const r = await film.eval<{ agree: number; total: number; boxHits: number; glyphHits: number; pixelsLit: number }>(grid(name));
        expect(r.boxHits / r.total, `${name}: without alpha the whole box is the layer (inspect's box is a little wider than the pieces': not every grid point on its edge)`).toBeGreaterThan(0.9);
        expect(r.glyphHits, `${name}: with alpha only the letters (the picture lights ${r.pixelsLit} of ${r.total} points)`).toBeLessThan(r.total * 0.9);
        expect(r.agree / r.total, `${name}: pick and the picture agree (edges aside)`).toBeGreaterThan(0.95);
      }
      expect(await film.eval('window.__logs')).toEqual([]);
    });
  }, 120_000);
});
