// The samples of the 1.0 site: site/samples/samples.json, one folder per piece (site/samples/<id>/: the agent's page, its poster).
// sync-site writes them into the pages as static HTML (regions samples-hero, samples-promo, samples-refined; see REGIONS there).
// How a sample is made: site/samples/README.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The languages of the hero's sentence, in tab order, with their labels. */
export const LANGS = ['en', 'ja'];
export const LANG_LABEL = { en: 'English', ja: '日本語' };
const KINDS = ['one', 'refined', 'promo'];

export function loadSamples(root) {
  return JSON.parse(readFileSync(join(root, 'site/samples/samples.json'), 'utf8'));
}

/** What is wrong with a sample, as sentences ([] when it is fine). */
export function validateSample(s) {
  const out = [];
  const str = (k) => { if (typeof s[k] !== 'string' || !s[k]) out.push(`${k} must be a non-empty string`); };
  ['id', 'title', 'page', 'poster', 'alt', 'version'].forEach(str);
  if (!KINDS.includes(s.kind)) out.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!LANGS.includes(s.lang)) out.push(`lang must be one of ${LANGS.join(', ')}`);
  if (!Array.isArray(s.messages) || s.messages.some((m) => typeof m !== 'string' || !m)) out.push('messages must be a list of the messages sent');
  else if (s.kind === 'refined' ? s.messages.length < 2 : s.messages.length !== 1) out.push(`messages: a ${s.kind} piece has ${s.kind === 'refined' ? 'two or more' : 'exactly one'}`);
  if (!(typeof s.minutes === 'number' && s.minutes > 0)) out.push('minutes must be a positive number (wall clock, first message to the delivered MP4)');
  if (!Number.isInteger(s.runs) || s.runs < 1 || s.runs > 3) out.push('runs must be 1, 2 or 3 (best of N, at most 3)');
  if (s.model !== 'Claude Opus') out.push('model must be "Claude Opus" (the samples are made by Opus only)');
  if (s.placeholder !== undefined && s.placeholder !== true) out.push('placeholder is true or absent');
  return out;
}

/** The hero's samples: per language, in LANGS order, the first one-sentence piece written in it. */
export function heroSamples(samples) {
  return LANGS.map((l) => samples.find((s) => s.kind === 'one' && s.lang === l)).filter(Boolean);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The pixel size of a JPEG (its SOF marker), so the poster keeps its shape before it loads; null when it cannot be read. */
export function jpegSize(file) {
  let b;
  try { b = readFileSync(file); } catch { return null; }
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** What a piece's card says about how it was made: ["Claude Opus", "1 message", "3 min", "unedited"] (and "best of N" when it was picked from several runs). */
export function facts(s) {
  const parts = [s.model, `${s.messages.length} message${s.messages.length === 1 ? '' : 's'}`, `${s.minutes} min`];
  if (s.kind !== 'refined') parts.push('unedited');
  if (s.runs > 1) parts.push(`best of ${s.runs}`);
  return parts;
}
export const caption = (s) => facts(s).join(' · ');
const factsHtml = (s) => `<ul class="facts">${facts(s).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;

const pagePath = (ctx, s) => `${ctx.root}site/samples/${s.id}/${s.page}`;
const posterPath = (ctx, s) => `${ctx.root}site/samples/${s.id}/${s.poster}`;

const sizeOf = (ctx, s) => jpegSize(join(ctx.root_dir, 'site/samples', s.id, s.poster));

function figure(ctx, s, { autoplay = false, lazy = true } = {}) {
  const size = sizeOf(ctx, s);
  const wh = size ? ` width="${size.width}" height="${size.height}"` : '';
  const ar = size ? ` style="--ar:${(size.width / size.height).toFixed(4)}"` : '';            // its shape: the hero fits it to the screen's height
  return `<figure class="live" data-page="${esc(pagePath(ctx, s))}"${autoplay ? ' data-autoplay' : ''}${ar}>
  <img src="${esc(posterPath(ctx, s))}" alt="${esc(s.alt)}"${wh}${lazy ? ' loading="lazy"' : ''}>
  <button class="live-play" type="button" aria-label="Play ${esc(s.title)}">▶</button>
</figure>`;
}

const listOf = (ctx) => ctx.samples ?? loadSamples(ctx.root_dir).samples;

export function renderRefined(ctx) {
  return listOf(ctx).filter((s) => s.kind === 'refined').map((s) => `<article class="sample refined card" id="sample-${esc(s.id)}">
${figure(ctx, s)}
<div class="sample-body">
  <ol class="chat">
${s.messages.map((m, i) => `    <li class="msg" lang="${esc(s.lang)}"><span class="who">${i === 0 ? 'You' : 'Then'}</span>${esc(m)}</li>`).join('\n')}
  </ol>
  ${factsHtml(s)}
</div>
</article>`).join('\n');
}

export function renderPromo(ctx) {
  const s = listOf(ctx).find((x) => x.kind === 'promo');
  if (!s) return '';
  return `<div class="promo" id="sample-${esc(s.id)}">
${figure(ctx, s)}
<div class="promo-chat">
  <p class="msg you"><span class="prompt" aria-hidden="true">&gt;</span> ${esc(s.messages[0])}</p>
  <div class="msg done"><span class="ok" aria-hidden="true">✓</span> promo video delivered ${factsHtml(s)}</div>
</div>
</div>`;
}

export function renderHero(ctx) {
  const hero = heroSamples(listOf(ctx));
  if (!hero.length) return '';
  const first = hero[0];
  const tabs = hero.map((s, i) => { const z = sizeOf(ctx, s) ?? { width: 16, height: 9 }; return `<button type="button" role="tab" id="tab-${s.lang}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="hero-panel" data-page="${esc(pagePath(ctx, s))}" data-poster="${esc(posterPath(ctx, s))}" data-w="${z.width}" data-h="${z.height}" data-alt="${esc(s.alt)}" data-title="${esc(s.title)}" data-meta="${esc(caption(s))}">${LANG_LABEL[s.lang]}</button>`; }).join('\n  ');
  const sentences = hero.map((s, i) => `<p class="sentence" lang="${esc(s.lang)}" data-tab="tab-${s.lang}"${i ? ' hidden' : ''}>${esc(s.messages[0])}</p>`).join('\n  ');
  return `<div class="hero-tabs" role="tablist" aria-label="The sentence, in ${hero.length} languages">
  ${tabs}
</div>
<div class="hero-panel" id="hero-panel" role="tabpanel" aria-labelledby="tab-${first.lang}">
  ${sentences}
  <div class="hero-video">
${figure(ctx, first, { autoplay: true, lazy: false })}
  <div class="hero-facts">${factsHtml(first)}</div>
  </div>
</div>`;
}
