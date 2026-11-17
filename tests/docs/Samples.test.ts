// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { loadSamples, validateSample, heroSamples, LANGS } from '../../scripts/samples.mjs';
// @ts-expect-error plain ESM script without types
import { REGIONS } from '../../scripts/sync-site.mjs';

// The samples of the 1.0 site (docs/superpowers/specs/2026-11-16-site-v1-design.md, "How the sample videos are made"): one JSON file,
// written into the pages as static HTML by sync-site. Plan Task 6.
const root = resolve(__dirname, '../..');
const { samples } = loadSamples(root);
const ctx = { root: '', root_dir: root, current: 'home' };
const region = (name: string) => REGIONS[name](ctx) as string;
const cardsIn = (html: string) => [...html.matchAll(/<figure class="live"[^>]*data-page="([^"]+)"/g)].map((m) => m[1]);

describe('site/samples/samples.json', () => {
  it('every sample is valid and its files exist', () => {
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(validateSample(s), s.id).toEqual([]);
      expect(existsSync(resolve(root, 'site/samples', s.id, s.page)), `${s.id}/${s.page}`).toBe(true);
      expect(existsSync(resolve(root, 'site/samples', s.id, s.poster)), `${s.id}/${s.poster}`).toBe(true);
    }
  });

  it('no placeholder is left: every sample is a real piece made on 1.0.0 (the site goes live with them)', () => {
    expect(samples.filter((s: any) => s.placeholder).map((s: any) => s.id)).toEqual([]);
    for (const s of samples) expect(s.version, s.id).toBe('1.0.0');
    const kinds = samples.map((s: any) => s.kind);
    expect(kinds.filter((k: string) => k === 'one').length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k: string) => k === 'refined').length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k: string) => k === 'promo')).toHaveLength(1);
  });

  it('validateSample names what is wrong', () => {
    const good = samples.find((s: any) => s.kind === 'one');
    expect(validateSample({ ...good, runs: 4 }).join(' ')).toMatch(/runs/);
    expect(validateSample({ ...good, messages: ['a', 'b'] }).join(' ')).toMatch(/messages/);
    expect(validateSample({ ...good, kind: 'refined', messages: ['a'] }).join(' ')).toMatch(/messages/);
    expect(validateSample({ ...good, lang: 'fr' }).join(' ')).toMatch(/lang/);
    expect(validateSample({ ...good, lang: 'zh' }).join(' ')).toMatch(/lang/);
    expect(validateSample({ ...good, model: 'Fable' }).join(' ')).toMatch(/model/);
  });

  it('the hero has one sentence per language, English and Japanese only, in that order (a language with no sample has no tab)', () => {
    expect(LANGS).toEqual(['en', 'ja']);
    const hero = heroSamples(samples);
    expect(hero.map((s: any) => s.lang)).toEqual(LANGS.filter((l: string) => samples.some((s: any) => s.kind === 'one' && s.lang === l)));
    expect(hero.every((s: any) => s.kind === 'one')).toBe(true);
  });
});

describe('the sample regions sync-site writes', () => {
  it('the hero says "best of N" when a piece was picked from several runs', () => {
    const one = samples.find((s: any) => s.kind === 'one');
    const html = REGIONS['samples-hero']({ ...ctx, samples: [{ ...one, runs: 3 }] });
    expect(html).toMatch(/best of 3/);
  });

  it('there is no one-sentence card list any more (the hero shows the one-sentence pieces; the gallery took the section)', () => {
    expect(REGIONS['samples-one']).toBeUndefined();
  });

  it('samples-refined: every message, in order, and "N messages"', () => {
    const html = region('samples-refined');
    for (const s of samples.filter((x: any) => x.kind === 'refined')) {
      let at = -1;
      for (const m of s.messages) { const i = html.indexOf(m.replace(/&/g, '&amp;')); expect(i, m).toBeGreaterThan(at); at = i; }
      expect(html).toContain(`${s.messages.length} messages`);
    }
  });

  it('samples-promo: every message sent, in order, "N messages" when there were several, and the video it made', () => {
    const html = region('samples-promo');
    const p = samples.find((s: any) => s.kind === 'promo');
    expect(html).toContain('Make a promo video for this project.');
    let at = -1;
    for (const m of p.messages) { const i = html.indexOf(m.replace(/&/g, '&amp;').replace(/"/g, '&quot;')); expect(i, m).toBeGreaterThan(at); at = i; }
    if (p.messages.length > 1) expect(html).toContain(`${p.messages.length} messages`);
    expect(cardsIn(html)).toEqual([`site/samples/${p.id}/${p.page}`]);
    expect(validateSample({ ...p, messages: [p.messages[0], 'Then fix this.'] })).toEqual([]);   // a promo may take follow-ups, shown as they were sent
    expect(validateSample({ ...p, messages: [] }).join(' ')).toMatch(/messages/);
  });

  it('samples-hero: a tab per language (role, aria-selected on the first); the sentence carries its language; no link to a card', () => {
    const html = region('samples-hero');
    const hero = heroSamples(samples);
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(hero.length);
    expect(tabs[0]).toMatch(/aria-selected="true"/);
    hero.forEach((s: any, i: number) => {
      expect(html).toContain(`lang="${s.lang}"`);
    });
    expect(cardsIn(html)).toHaveLength(1);                                   // one hero player; the tabs swap what it plays
    expect(html).toMatch(/data-autoplay/);
    expect(html).not.toMatch(/hero-card|data-card/);
  });
});
