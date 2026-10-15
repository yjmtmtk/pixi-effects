# Site restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The human site shows only what the library can do and that one sentence to an AI is enough: Guide, comparison, music lab and the numbered tour leave; a short landing page and a new "For AI" page replace them.

**Architecture:** Add the new things first (For AI page, short landing, new navigation), then remove the old ones one family at a time (Guide, music lab, numbered tour), each task ending green with the staged-site link check. `examples/_checks` stays where it is: it is the seed of the test films and moves with their groups, not here. Nothing is released or pushed.

**Tech Stack:** static HTML, `scripts/site-parts.mjs` + `scripts/sync-site.mjs` (shared header/footer/regions), `scripts/stage-site.mjs` (what Pages serves), vitest (+ real Chrome for `tests/tools/siteShell.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-15-site-restructure-design.md` (decisions of the owner, 2026-10-15). Test-film context: `docs/superpowers/specs/2026-10-15-test-films-design.md`, `tests/films/COVERAGE.md`.

## Global Constraints

- Navigation after: **Home · Gallery · Interactive · Playground · For AI** (ids `gallery`, `interactive`, `playground`, `forai`; Home is the brand link). `NAV` in `scripts/site-parts.mjs` is the only place.
- The two films (`ink-and-paper`, `light-as-material`) **stay at the top of the landing page**, played live as now. No films page, none in the gallery.
- No comparison with Remotion / fframes anywhere (page, `FACTS.md`, `NOTES.md`, tests, `SKILL.md`, `README`).
- No music lab, no Guide, no numbered tour (`examples/01-…15-*.html`, `examples.json`, `examples/index.html`, `examples.css`) on the site or in the repository after Task 5.
- `stage-site.mjs` copies a **list**, not all of `examples/`: `examples/{gallery,interactive,showreel,films,_assets}`, `examples/playground.html`, `examples/playground/`. `examples/_checks` is never shipped.
- The landing page keeps `Use https://github.com/yjmtmtk/pixi-effects to make a video:` (also in `README.md`), the ending-swap widget, `npx skills add yjmtmtk/pixi-effects` exactly once, mentions of `AGENTS.md` and `ai/CHAT.md`, and every version pin equal to `package.json`'s version (`Landing.test.ts`).
- Visible words of the landing page's `<main>` (outside `<pre>`, `<script>`, tags): at most 520 (the old page: about 3,700).
- No link in any page starts with `/` (breaks under `/pixi-effects/`); `scripts/site-links.mjs` is the check.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No push, tag push, release or publish (those need the owner's fresh go). A **local** tag `pre-test-films` is made in Task 4 before anything is deleted.
- Breaking changes are fine (the owner is the only user): old addresses `/guide/…`, `/examples/`, `/examples/music-lab.html` simply stop existing.

## Review Focus

1. Every internal link on the staged site still resolves, including links *into* removed pages from places that are easy to miss: the gallery and interactive index pages, `playground.html`, `examples/films/*.html`, the footer, `llms.txt`, the README. (`scripts/site-links.mjs` on the staged folder; every removal task runs it.)
2. A test that read a deleted file is deleted or rewritten, never left passing vacuously (e.g. `noFalseWarnings` must still run the 43 gallery pieces after the numbered list is gone, and say the right count).
3. Nothing the AI reads is lost: `help`, `recipe`, `llms-full.txt`, `skills/` do not depend on `site/guide` (Task 1 checks `Recipes.test.ts` no longer reads it; Task 6 regenerates and diffs `llms-full.txt`).
4. `first-video.html` (a CDN pin the post-publish check loads) survives the removal of `examples/_guide`.
5. The landing page still works as a page: reel, films, hero demo, ending widget, gallery piece player dialog all have the script ids they need after sections are removed (a removed section must not take an element the inline script looks up; run it in Chrome and read the console).
6. The mobile layout (390 px) of the landing and For AI pages: no horizontal scroll, header fits with five entries.

---

### Task 1: The Guide's recipe blocks: one merged, 23 dropped knowingly

Decision (checked 2026-10-15 by comparing the words each block uses with the 54 AI recipe blocks): the Guide's 24 `// @recipe` blocks are 4–32 lines each and use no API the AI recipes lack, except the pattern of `subtitles` (a cue list as timed text layers, which the AI recipes only mention in a sentence). So `subtitles` becomes an AI recipe and the other 23 are dropped.

**Files:**
- Modify: `skills/pixi-effects/reference/recipes.md` (add the section)
- Modify: `tests/docs/Recipes.test.ts:46-49` (stop reading `site/guide/*.md`; assert `subtitles`)
- Read first: `site/guide/cookbook.md:162-195` (the block), `tests/tools/lookup.test.ts` (recipe sections need ids)

**Interfaces:**
- Consumes: the `// @recipe <id>` block convention; `recipe` command lists ids from `recipes.md`.
- Produces: AI recipe id `subtitles`; `Recipes.test.ts` reads only `skills/pixi-effects/reference/{recipes,quickstart}.md`.

- [ ] **Step 1: Write the failing test.** In `tests/docs/Recipes.test.ts` replace the `md` definition so it reads only the two skill files, and add to the first `describe` of "skills/pixi-effects/reference/recipes.md":

```ts
const md = ['skills/pixi-effects/reference/recipes.md', 'skills/pixi-effects/reference/quickstart.md']
  .map(f => readFileSync(resolve(__dirname, '../..', f), 'utf8')).join('\n');
// …inside describe('skills/pixi-effects/reference/recipes.md', …):
  it('has the subtitles recipe (a cue list as timed text layers), merged from the old Guide', () => {
    expect(recipes.map(r => r.name)).toContain('subtitles');
  });
```

- [ ] **Step 2: Run it.** `npx vitest run tests/docs/Recipes.test.ts` → Expected: FAIL on `subtitles` (and nothing else fails: the Guide blocks no longer run).
- [ ] **Step 3: Add the recipe.** Copy the block from `site/guide/cookbook.md` (the one starting `// @recipe subtitles`) into `recipes.md` under a new heading `## Subtitles: a list of cues as timed text` placed after "Slideshow with transitions and background music"; keep the id `subtitles`; add one sentence under the heading: cues are `[from, to, text]` triples and each becomes a text layer with `at`/`duration`; keep captions above the bottom ~60 px.
- [ ] **Step 4: Run.** `npx vitest run tests/docs/Recipes.test.ts tests/tools/lookup.test.ts` → Expected: PASS (the new block builds with no warning).
- [ ] **Step 5: Commit.**

```bash
git add skills/pixi-effects/reference/recipes.md tests/docs/Recipes.test.ts
git commit -m "docs: the subtitles recipe joins the AI recipes; Recipes.test no longer reads the Guide (the other 23 Guide blocks add no API)"
```

---

### Task 2: For AI page, the new navigation, the stage list

**Files:**
- Create: `for-ai.html` (repository root, next to `index.html`)
- Modify: `scripts/site-parts.mjs` (NAV, footer), `scripts/sync-site.mjs` (region `recipe-list`), `site/pages.json`, `scripts/stage-site.mjs` (copy list, `for-ai.html`)
- Modify tests: `tests/docs/SiteShell.test.ts:20-34`, `tests/tools/siteShell.test.ts:17`, new `tests/docs/ForAi.test.ts`

**Interfaces:**
- Consumes: `renderHead/renderHeader/renderFooter`, `REGIONS` in `sync-site.mjs`, `recipes.md` `// @recipe <id>` ids.
- Produces: `NAV` ids `['gallery','interactive','playground','forai']` with hrefs `examples/gallery/`, `examples/interactive/`, `examples/playground.html`, `for-ai.html`; region `recipe-list` (`<li><code>id</code></li>` for every id in `recipes.md`); page `for-ai.html` with `current: "forai"`.

The page (write it plain and short; the same tokens/classes as the landing: `wrap`, `ch`, `deck`, `quote`, `btn`):

```
h1  For AI
p   Everything an AI needs, and nothing it has to read twice.
1 · Paste this   — the sentence block (same markup/ids as the landing: promptText, ending chips, copyPrompt) 
2 · What it reads — list, each a link on raw.githubusercontent / GitHub:
      AGENTS.md (first screen of the repo) · skills/pixi-effects/SKILL.md (npx skills add yjmtmtk/pixi-effects — NOT repeated here: see below) ·
      llms.txt · llms-full.txt · ai/CHAT.md (chat with no shell) · `npx pixi-effects help <word>` · `npx pixi-effects recipe [id]`
3 · The tools     — check · render · view · probe · frames · trim · sound · concat (one line each, from docs/media.md and the AGENTS.md steps)
4 · Recipes       — <!--site:recipe-list--> region
5 · Honest notes  — the four bullets that were on the landing under "Works in"
```
`npx skills add yjmtmtk/pixi-effects` appears **once on the whole site's landing**; on For AI it may appear once too (the landing test counts only `index.html`).

- [ ] **Step 1: Write the failing tests.** New `tests/docs/ForAi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('for-ai.html');

describe('for-ai.html (the one page for AI)', () => {
  it('has the sentence, the reading list and the tools', () => {
    const plain = html.replace(/<[^>]+>/g, '');
    expect(plain).toContain('Use https://github.com/yjmtmtk/pixi-effects to make a video:');
    for (const need of ['AGENTS.md', 'SKILL.md', 'llms.txt', 'llms-full.txt', 'ai/CHAT.md', 'npx skills add yjmtmtk/pixi-effects', 'pixi-effects help', 'pixi-effects recipe', 'pixi-effects check', 'pixi-effects render']) expect(plain, need).toContain(need);
  });
  it('lists every AI recipe id, generated (a stale list fails sync-site --check)', () => {
    const ids = [...read('skills/pixi-effects/reference/recipes.md').matchAll(/\/\/ @recipe ([^\n]+)/g)].map(m => m[1]!.trim());
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) expect(html, id).toContain(`<code>${id}</code>`);
  });
  it('says nothing about other tools and links nothing from the root with a leading slash', () => {
    expect(html).not.toMatch(/remotion|fframes/i);
    expect(html).not.toMatch(/(?:href|src)="\//);
  });
});
```
Update `tests/docs/SiteShell.test.ts`: NAV ids expected `['gallery','interactive','playground','forai']`; header hrefs `['../../', '../../examples/gallery/', '../../examples/interactive/', '../../examples/playground.html', '../../for-ai.html']`; footer `need` list: replace `'../guide/'`, `'../examples/'`, `'../examples/music-lab.html'` by `'../for-ai.html'`. In `tests/tools/siteShell.test.ts` add `['for-ai.html']` to `PAGES` (leave the others until they are removed in Tasks 3–5).

- [ ] **Step 2: Run.** `npx vitest run tests/docs/ForAi.test.ts tests/docs/SiteShell.test.ts` → Expected: FAIL (file missing; NAV differs).
- [ ] **Step 3: Implement.** `NAV` as in Interfaces; in `renderFooter` remove the Music lab link and keep the rest (it is built from NAV). In `sync-site.mjs` add

```js
REGIONS['recipe-list'] = ({ root_dir }) => {
  const md = readFileSync(join(root_dir, 'skills/pixi-effects/reference/recipes.md'), 'utf8');
  const ids = [...md.matchAll(/\/\/ @recipe ([^\n]+)/g)].map((m) => esc(m[1].trim()));
  return `<ul class="recipe-ids">\n${ids.map((id) => `<li><code>${id}</code></li>`).join('\n')}\n</ul>`;
};
```
Add `{ "file": "for-ai.html", "current": "forai", "regions": ["recipe-list"] }` to `site/pages.json`; write `for-ai.html` with the three site markers and `<!--site:recipe-list-->…<!--/site:recipe-list-->` where the list belongs, `<main id="main">`, and the page's few styles inline in a `<style>` (or in `site/landing/landing.css` if it is shared by two pages). `stage-site.mjs`: replace `for (const dir of ['dist','examples','ai','skills']) copy(dir)` by `for (const dir of ['dist','ai','skills']) copy(dir)` plus a loop over the examples list in Global Constraints (`copy('examples/gallery')` …, `copy('examples/playground.html')`, `copy('examples/playground')`; **until Tasks 4–6 are done also keep copying `examples/index.html`, `examples/music-lab.html`, `examples/music-lab`, `examples/examples.css`, `examples/0*.html`, `examples/_guide`** so nothing breaks; each of those lines is deleted in the task that removes the thing), and `copy('for-ai.html')`.
- [ ] **Step 4: Run.** `npm run site:sync` then `npx vitest run tests/docs tests/tools/siteShell.test.ts` and `node scripts/stage-site.mjs _site && node scripts/site-links.mjs _site` → Expected: all PASS, link check clean.
- [ ] **Step 5: Look.** `npm run site`, open `/for-ai.html` at 1440 and 390 px (Playwright screenshot), read both; no horizontal scroll at 390.
- [ ] **Step 6: Commit** `site: the For AI page, the new navigation (Home Gallery Interactive Playground For AI), the stage copy list`.

---

### Task 3: The short landing page

**Files:**
- Modify: `index.html`, `site/landing/landing.css` (remove rules of removed sections only)
- Modify: `site/landing/FACTS.md`, `site/landing/NOTES.md`, `tests/docs/Landing.test.ts`

**Interfaces:**
- Consumes: the inline script's element ids (`reelBtn/reelFacade`, `inkBtn/inkFacade`, `lightBtn/lightFacade`, `playBtn/facade/heroStill/heroCode/heroCanvas/vbar/vstatus/replayBtn`, `kmBtn/kmFacade`, `player/pframe/ptitle/popen/pclose` and `a.piece[data-piece]`, `ending/chip/copyPrompt/promptText`, `.copy`).
- Produces: sections `hero` (with `#reel`, `#films`, `#demo`), `#one`, `#gallery`, `#interactive`, and a closing `#way` (three links); removed: `#get`, `#ai`, `#compare`, `#start`.

What stays / goes:
| Part | Fate |
|---|---|
| Hero: eyebrow, h1 "Video, written as data.", reel, films (poster + title + one line each, drop the long paragraphs), `#demo` composition panel | stay; lede becomes ONE sentence: "A video is a tree of plain objects. Tell an AI one sentence and it writes one." CTA: "Watch the gallery", "For AI"; the two `cta-note` lines stay (sentence anchor, `npx skills add`). The `slate` key-facts list goes. |
| `#one` (sentence widget) | stays: deck shortened to one line; the three `.stp` steps and `.works` block go (the honest notes live on For AI) |
| `#get`, `#ai`, `#compare`, `#start` | removed |
| `#gallery` | keeps the Kinetic Manifesto feature (title + one line), the masonry and the foot link; deck paragraph and tally shortened to "43 pieces" |
| `#interactive` | keeps the masonry and foot link; deck is one line; the code figure goes |
| `#way` (new) | three links in a row: "Tell an AI → For AI", "GitHub", "npm"; plus the status line "v0.39.0 · experimental · pre-1.0 · MIT" |

- [ ] **Step 1: Write the failing tests** (`tests/docs/Landing.test.ts`): delete the two comparison/benchmark tests; add

```ts
  const mainText = () => html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  it('is short: at most 520 visible words in <main> (it was about 3,700)', () => {
    expect(mainText().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(520);
  });
  it('shows, it does not teach: no Guide link, no comparison, no music lab, and the removed sections are gone', () => {
    expect(html).not.toMatch(/href="(?:\.\/)?guide\//);
    expect(html).not.toMatch(/remotion|fframes|music-lab/i);
    for (const id of ['get', 'ai', 'compare', 'start']) expect(html, id).not.toContain(`<section id="${id}"`);
    for (const id of ['reel', 'films', 'one', 'gallery', 'interactive', 'way']) expect(html, id).toMatch(new RegExp(`id="${id}"`));
  });
  it('keeps both films at the top, before the sentence', () => {
    expect(html.indexOf('id="films"')).toBeGreaterThan(0);
    expect(html.indexOf('id="films"')).toBeLessThan(html.indexOf('id="one"'));
    expect(html).toContain('examples/films/ink-and-paper.html');
    expect(html).toContain('examples/films/light-as-material.html');
  });
  it('points the AI to the For AI page', () => { expect(html).toContain('href="for-ai.html"'); });
```
In the existing "every picture it links to exists" test keep as is (pictures stay). Remove from `FACTS.md` the Remotion/fframes sections, the mediabunny-benchmark bullet, the "How to compare" section, the music-lab URL and the "Guide for people" sentence; remove the matching lines of `NOTES.md`.

- [ ] **Step 2: Run** `npx vitest run tests/docs/Landing.test.ts` → Expected: FAIL (words, guide link, sections).
- [ ] **Step 3: Edit `index.html`** per the table (remove whole `<section>` blocks by their markers `<!-- ================= 02 …` through the next marker; renumber the `ch` headers 01, 02, 03). Delete the CSS rules of removed classes from `landing.css` (`compare`, `ways`, `way`, `steps`, `stp`, `works`, `status` only if no longer used; `grep` each class in `index.html` first). Keep the `<dialog id="player">` and the script; delete script lines whose element no longer exists only if they throw (run the page in Chrome and read the console: no errors).
- [ ] **Step 4: Run** `npx vitest run tests/docs tests/tools/siteShell.test.ts tests/tools/landing.test.ts`; `node scripts/stage-site.mjs _site && node scripts/site-links.mjs _site` → PASS. If the word limit is not met, shorten the copy, not the limit.
- [ ] **Step 5: Look.** `npm run site`; screenshot `/` at 1440 and 390 px, full page; click the reel, a film, the hero demo, a masonry piece (dialog opens), an ending chip, the copy button: all work, console clean. Read the words once as a stranger would.
- [ ] **Step 6: Commit** `site: the landing page shows and says one sentence (520 words max, no Guide, no comparison)`.

---

### Task 4: Remove the Guide

**Files (delete):** `site/guide/` (all), `scripts/build-guide.mjs`, `scripts/build-guide-demos.mjs`, `examples/_guide/` (except `first-video.html`, moved), `tests/docs/Guide.test.ts`, `tests/tools/guideDemo.test.ts`, `tests/tools/guideDemoFit.test.ts`
**Files (modify):** `scripts/stage-site.mjs`, `scripts/preview-site.mjs`, `package.json` (`guide` script), `site/README.md`, `tests/tools/siteShell.test.ts`, `tests/docs/SitePreview.test.ts`, `scripts/gallery-swap.mjs` + `tests/tools/gallerySwap.test.ts`, `tests/tools/check.test.ts`, `scripts/post-publish-check.mjs`, `scripts/release-scope.mjs` (comment), `scripts/test-changed.mjs`, `tests/tools/releaseScope.test.ts:34`, `tests/docs/MusicDocs.test.ts`, `tests/docs/Skill.test.ts`, `tests/tools/playground.test.ts`, `examples/gallery/index.html`, `examples/interactive/index.html`
**Create:** `examples/_checks/first-video.html` (moved), `tests/docs/Pins.test.ts`

**Interfaces:**
- Consumes: Task 2 stage list, Task 3 landing (no Guide link).
- Produces: no `site/guide`, no `build-guide*`; `first-video.html` at `examples/_checks/first-video.html`; `Pins.test.ts` keeps the assertion "the first-video page pins the current release on the CDN" that lived in `Guide.test.ts:180`.

- [ ] **Step 1: Safety tag (local).** `git tag pre-test-films` (do not push it; pushing needs the owner's go).
- [ ] **Step 2: Move first-video and keep its pin test.** `git mv examples/_guide/first-video.html examples/_checks/first-video.html`; new `tests/docs/Pins.test.ts` copying the assertion of `Guide.test.ts:180-190` with the new path; run it → PASS. Update `tests/tools/check.test.ts:13,226,229` and `scripts/post-publish-check.mjs:21` (the `-t first-video` filter still matches the renamed test title if you keep the words "first-video page"; rename the test title to "the first-video page …").
- [ ] **Step 3: Write the failing tests** that say the Guide is gone: in `tests/docs/SitePreview.test.ts` replace the two guide assertions by

```ts
  it('the staged site has no Guide', async () => {
    const out = join(tmpdir(), `site-${process.pid}`);
    await stageSite(out);
    expect(existsSync(join(out, 'guide'))).toBe(false);
    rmSync(out, { recursive: true, force: true });
  });
```
(import `stageSite` from `scripts/stage-site.mjs`). Run → FAIL (the guide is still built).
- [ ] **Step 4: Remove.** `git rm -r site/guide examples/_guide scripts/build-guide.mjs scripts/build-guide-demos.mjs tests/docs/Guide.test.ts tests/tools/guideDemo.test.ts tests/tools/guideDemoFit.test.ts`. In `stage-site.mjs` delete the `buildGuide` import and call (the staged `_site` must not contain `guide/`) and the `examples/_guide` copy; `preview-site.mjs` comment; `package.json` remove `"guide"`; `siteShell.test.ts` remove the `buildGuide` import, the `beforeAll` and the `guide-preview/getting-started.html` PAGES entry; `site/README.md` rewrite the entrances table (Home, Gallery, Interactive, Playground, For AI) and the Guide paragraphs; `test-changed.mjs` area "site and landing": drop `tests/tools/guideDemo.test.ts`.
- [ ] **Step 5: gallery-swap.** Read `scripts/gallery-swap.mjs` around lines 19 and 139–175: remove the part that rewrites/lists guide embeds (`{{demo …}}` in `site/guide/*.md`); in `tests/tools/gallerySwap.test.ts` remove the `site/guide` fixture lines (23, 33), the guide-embed expectations (83, 91, 126, 176-180) and keep every other expectation. Run `npx vitest run tests/tools/gallerySwap.test.ts` → PASS.
- [ ] **Step 6: Other mentions.** `grep -rnE "guide/|build-guide|guide-preview|_guide|\bGuide\b" --include='*.{ts,mjs,json,md,html,yml,css,txt}' . | grep -vE "node_modules|^./(dist|\.superpowers|_site|CHANGELOG|docs/superpowers)"` → fix each hit (README, `docs/*.md`, `examples/gallery/index.html`, `examples/interactive/index.html`, `examples/music-lab.html` (removed in Task 5), `tests/docs/MusicDocs.test.ts` (the audio guide → `skills/pixi-effects/reference/cheatsheet.md` only), `tests/docs/Skill.test.ts`, `tests/tools/playground.test.ts`, `tests/films/COVERAGE.md` last sentence). Expected at the end: no hits except history files (CHANGELOG, `docs/superpowers/`) and the words "guide" meaning other things (`direction.md` "style guide", "chat guide").
- [ ] **Step 7: Run.** `npx vitest run tests/docs tests/tools/siteShell.test.ts tests/tools/gallerySwap.test.ts tests/tools/testChanged.test.ts tests/tools/releaseScope.test.ts`; `node scripts/stage-site.mjs _site && node scripts/site-links.mjs _site` → PASS, no `_site/guide`.
- [ ] **Step 8: Commit** `site: the Guide leaves (pages, builders, demos, tests); first-video moves to examples/_checks; local tag pre-test-films before the deletions`.

---

### Task 5: Remove the music lab

**Files (delete):** `examples/music-lab.html`, `examples/music-lab/`, `tests/docs/MusicLab.test.ts`, `tests/tools/musicLab.test.ts`
**Files (modify):** `site/pages.json`, `scripts/stage-site.mjs`, `scripts/test-changed.mjs` (audio area: drop `tests/tools/musicLab.test.ts`), `tests/tools/siteShell.test.ts` (PAGES), `tests/docs/MusicDocs.test.ts`, `docs/api.md`, `docs/dsl.md`, `README.md`, `llms-full.txt` (regenerated in Task 7), `examples/gallery/index.html`, `examples/interactive/index.html`, `examples/index.html` (deleted in Task 6), `site/landing/FACTS.md`

**Interfaces:** Consumes: Task 4 (Guide gone). Produces: music is documented only in `docs/dsl.md`, `docs/api.md`, `cheatsheet.md`, recipes (`music-lofi`).

- [ ] **Step 1: Failing test.** In `tests/docs/SitePreview.test.ts` add to the staged-site test: `expect(existsSync(join(out, 'examples/music-lab.html'))).toBe(false);` → FAIL.
- [ ] **Step 2: Remove** the files above, the `music-lab.html` entry in `pages.json`, its copy lines in `stage-site.mjs`, the PAGES entry, the area test name; in `MusicDocs.test.ts` drop the lab assertions and keep "names every instrument and drum" for `cheatsheet.md`.
- [ ] **Step 3: Mentions.** `grep -rniE "music-lab|music lab|musicLab" … | grep -vE "node_modules|dist|\.superpowers|_site|CHANGELOG|docs/superpowers"` → fix every hit (the sentence in `docs/api.md`, `docs/dsl.md`, README: remove the lab pointer, keep the facts about `music`).
- [ ] **Step 4: Run** `npx vitest run tests/docs tests/tools/siteShell.test.ts tests/tools/testChanged.test.ts`; staged link check → PASS. The `music` layer's own tests (`tests/audio/*`) must still pass: `npx vitest run tests/audio`.
- [ ] **Step 5: Commit** `site: the music lab leaves; the music layer and its docs stay`.

---

### Task 6: Delete the numbered tour

**Files (delete):** `examples/01-hello.html … 15-custom-player.html`, `examples/examples.json`, `examples/index.html`, `examples/examples.css`, `tests/docs/ExamplesIndex.test.ts`
**Files (modify):** `scripts/sync-site.mjs` (remove `REGIONS['examples-list']`, `isNumbered`), `site/pages.json` (remove the `examples/index.html` entry), `scripts/stage-site.mjs` (remove the remaining temporary copy lines of Task 2), `scripts/test-changed.mjs` (area "numbered examples" removed), `tests/tools/noFalseWarnings.test.ts:16-25`, `tests/tools/siteShell.test.ts` (PAGES), `site/README.md` ("Add an example"), `tests/films/COVERAGE.md` (last paragraph), README, `docs/roadmap.md`

**Interfaces:** Consumes: the tag `pre-test-films` (Task 4), `COVERAGE.md` (the groups that will carry what the tour showed). Produces: the gallery's 43 pieces are the only "pieces the repository shows as correct" (`noFalseWarnings`).

The owner decided (2026-10-15) "delete first, then build from what must be guaranteed": the tour is not gated on the films. What it showed is listed in `COVERAGE.md` by group; the tag keeps the files.

- [ ] **Step 1: Failing tests.** In `tests/tools/noFalseWarnings.test.ts` remove `numbered` (line 16) and its use (line 25) and change the title to ``runs the ${pieces.length} gallery pieces with no warning at all``; in the staged-site test assert `readdirSync(join(out,'examples'))` has no file matching `/^\d\d-/` and no `index.html`/`examples.json`. Run → FAIL on the second.
- [ ] **Step 2: Delete** the files; remove the region and its page entry; remove the temporary copy lines; fix `siteShell.test.ts` PAGES (remove `examples/index.html`, `examples/music-lab.html`); `site/README.md`: delete the Examples row and "Add an example".
- [ ] **Step 3: Mentions.** `grep -rnE "examples/[0-9]{2}|examples\.json|examples/index|examples\.css|numbered example" … | grep -vE "node_modules|dist|\.superpowers|_site|CHANGELOG|docs/superpowers"` → fix each (README, `docs/roadmap.md`, `tests/films/COVERAGE.md`: say the tour is deleted, kept at tag `pre-test-films`; `skills/pixi-effects/reference/cheatsheet.md` and `src/core/ease.ts` comments if they point at a numbered example: point at the gallery piece or a recipe).
- [ ] **Step 4: Run** the whole suite: `npx vitest run` → PASS; `node scripts/stage-site.mjs _site && node scripts/site-links.mjs _site` → clean.
- [ ] **Step 5: Commit** `site: the numbered tour (01–15), its list and index leave; the gallery is the one set of pieces`.

---

### Task 7: Docs, generated texts, and the final look

**Files:** `README.md`, `docs/*.md` hits, `docs/roadmap.md` (status + "After 0.39.0"), `llms.txt` / `llms-full.txt` (generated), `skills/pixi-effects/SKILL.md` (comparison mention), `site/README.md`, memory

- [ ] **Step 1:** `grep -rniE "remotion|fframes" … | grep -vE "node_modules|dist|\.superpowers|_site|CHANGELOG|docs/superpowers"` → remove each remaining claim (SKILL.md line, `NOTES.md`).
- [ ] **Step 2:** `npm run build:ai`; `git diff --stat llms.txt llms-full.txt` → the diff is only the removed Guide/music-lab/examples pointers; read it.
- [ ] **Step 3:** README: the entrances are Gallery, Interactive, Playground, For AI (`https://yjmtmtk.github.io/pixi-effects/for-ai.html`); no `/guide/`.
- [ ] **Step 4:** Whole suite `npx vitest run > /tmp/claude-501/suite.log` → all pass; `npm run site:sync -- --check`; staged link check.
- [ ] **Step 5: Look at the result** (screenshots at 1440 and 390 of `/`, `/for-ai.html`, `/examples/gallery/`, `/examples/interactive/`, `/examples/playground.html`): header with five entries fits at 390; no page shows a dead link; read them.
- [ ] **Step 6: Commit** `docs: README, roadmap and the generated texts follow the new site`.
- [ ] **Step 7:** Report to the owner: what the site is now, the 23 dropped recipes, the local tag, and that nothing is pushed.
