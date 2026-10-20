// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The answers below come from the documents, written before the film was run:
// - docs/dsl.md line 93 ("Wrapping and fonts for Japanese, Chinese and Korean") and pitfalls.md 108:
//   "`wordWrap: true` breaks a line at spaces. Japanese and Chinese have none: with `wordWrap` alone a long line does not wrap
//   and runs off the canvas, and `breakWords: true` makes it break between any two characters, so a line can end with one to
//   three characters alone (an orphan) and split a word or phrase in the middle." ... "`check` lists a line that is cut by the canvas edge".
//   Nothing in the documents promises kinsoku (no 、。 or small kana at the start of a line) for horizontal text; docs/api.md line 148
//   says outright "a line is only cut at `\n` (no kinsoku)" for vertical splitText. So "between any two characters" is the rule:
//   the lines are the sentence cut greedily every `per` characters, and a line MAY start with 、 or ゃ.
// - docs/api.md line 137: measureText gives "the same numbers a text layer with that `style` has"; `lines` is "Number of lines" (src/text/measure.ts).
// - docs/api.md line 160: inspect's `issues` lists "text off the canvas / cut by an edge"; `onCanvas` is 'full' | 'partial' | 'none'.

const TEXT = 'わたしたちは、ちいさなしゃしんをとった。';
// per = 6 (the film's default): wordWrapWidth = 6.5 characters, so 6 characters fit on a line.
const LINES_6 = ['わたしたちは', '、ちいさなし', 'ゃしんをとっ', 'た。'];
// per = 4 (?per=4): wordWrapWidth = 4.5 characters.
const LINES_4 = ['わたした', 'ちは、ち', 'いさなし', 'ゃしんを', 'とった。'];

const read = (film: any) => film.eval(`(async () => {
  const f = window.__film;
  const rep = await movie.inspect(0, { layers: 'all' });
  const layer = (n) => rep.layers.find(l => l.name === n);
  const noWrap = { ...f.base };
  return {
    f, logs: window.__logs, issues: rep.issues,
    wrap: layer('wrap'), nowrap: layer('nowrap'),
    drawnWrap: window.__drawnLines(f.wrapStyle), drawnNowrap: window.__drawnLines(f.nowrapStyle),
    measuredWrap: window.__measureText(f.TEXT, f.wrapStyle),
    oneLine: window.__measureText(f.TEXT, noWrap),
    heights: [1, 2, 3, 4, 5, 6].map(n => window.__measureText(Array(n).fill('あ').join('\\n'), noWrap).height),
  };
})()`);

const heightFor = (r: any, lines: number) => r.heights[lines - 1];

runFilms('Text: Japanese wrapping in a narrow box (wordWrap, breakWords)', () => {
  it('wordWrap alone does not wrap a Japanese line: one line, as wide as the sentence, cut by the canvas edge and reported', async () => {
    await withFilm('text-japanese-wrap', async (film) => {
      const r: any = await read(film);
      expect(r.logs).toEqual([]);
      // precondition of the film: every character of the sentence is one full-width cell
      expect(new Set(r.f.charWidths.map((x: number) => Math.round(x * 100))).size, `character widths ${r.f.charWidths}`).toBe(1);
      expect(r.f.per).toBe(6);
      expect(r.drawnNowrap).toEqual([TEXT]);
      expect(Math.abs(r.nowrap.bounds.width - TEXT.length * r.f.w)).toBeLessThanOrEqual(1);
      expect(r.nowrap.bounds.width).toBeGreaterThan(r.f.W * 3);
      expect(Math.abs(r.nowrap.bounds.height - heightFor(r, 1))).toBeLessThanOrEqual(1);
      expect(r.nowrap.onCanvas).toBe('partial');
      expect(r.issues.filter((s: string) => s.includes('nowrap') && /cut/.test(s)).length, JSON.stringify(r.issues)).toBeGreaterThanOrEqual(1);
    });
  }, 120_000);

  it('breakWords breaks between any two characters: the sentence cut every 6 characters, a line may start with 、 or a small kana, the last is an orphan', async () => {
    await withFilm('text-japanese-wrap', async (film) => {
      const r: any = await read(film);
      expect(r.logs).toEqual([]);
      expect(r.drawnWrap).toEqual(LINES_6);
      expect(r.drawnWrap[1][0]).toBe('、');
      expect(r.drawnWrap[2][0]).toBe('ゃ');
      expect(r.drawnWrap.at(-1).length).toBeLessThanOrEqual(3);          // the orphan the docs warn of
      // the layer that is drawn: as tall as 4 lines, never wider than the box, on the canvas, and not reported
      expect(Math.abs(r.wrap.bounds.height - heightFor(r, LINES_6.length))).toBeLessThanOrEqual(1);
      expect(r.wrap.bounds.width).toBeLessThanOrEqual(r.f.W);
      expect(Math.abs(r.wrap.bounds.width - 6 * r.f.w)).toBeLessThanOrEqual(1);
      expect(r.wrap.onCanvas).toBe('full');
      expect(r.issues.filter((s: string) => /\bwrap\b/.test(s) && !s.includes('nowrap'))).toEqual([]);
      // measureText gives the same height as the layer
      expect(Math.abs(r.measuredWrap.height - r.wrap.bounds.height)).toBeLessThanOrEqual(1);
    });
  }, 120_000);

  it('a narrower box (?per=4) gives 5 lines, cut every 4 characters, with ゃ starting a line and no orphan', async () => {
    await withFilm('text-japanese-wrap', async (film) => {
      const r: any = await read(film);
      expect(r.logs).toEqual([]);
      expect(r.f.per).toBe(4);
      expect(r.drawnWrap).toEqual(LINES_4);
      expect(r.drawnWrap[3][0]).toBe('ゃ');
      expect(Math.abs(r.wrap.bounds.height - heightFor(r, LINES_4.length))).toBeLessThanOrEqual(1);
      expect(Math.abs(r.wrap.bounds.width - 4 * r.f.w)).toBeLessThanOrEqual(1);
    }, { query: 'per=4' });
  }, 120_000);

  // docs/api.md line 137: measureText's numbers are "the same numbers a text layer with that `style` has", and `lines` is the number of lines.
  // (it counted only the `\n` and reported 1 line for a wrapped text of 4 lines: found by this film, fixed in 0.47.3)
  it('measureText(text, wrapping style).lines is the number of lines the layer draws (4), not the number of \\n + 1', async () => {
    await withFilm('text-japanese-wrap', async (film) => {
      const r: any = await read(film);
      expect(r.measuredWrap.lines).toBe(LINES_6.length);
    });
  }, 120_000);
});
