# The site shows what it can do; the AI reads the docs (2026-10-15)

Status: design for the owner's review. Nothing is built. Decided with the owner on 2026-10-15 (see "Decisions").

## Why

The site was written for a human who learns the library: a 21-page Guide (23,000 words, 38 demos), a numbered tour of 15 examples, a landing page of 3,700 words in 8 sections, a comparison with other tools, a music lab. But the library is made for **AI to use**; no human is meant to learn it. A human needs to see only two things: **how expressive it is**, and that **telling an AI one sentence is enough to get a striking video**. Everything an AI reads comes from `docs/` and `skills/` (`llms-full.txt`, `help`, `recipe`, the skill): the Guide feeds none of it (checked 2026-10-15: the build of `llms-full.txt` reads `ai/` and `docs/`, and `help` reads `docs/dsl.md`, `docs/api.md`, `docs/media.md` and `skills/pixi-effects/reference/*`). So the Guide can leave the site and the AI loses nothing.

## Decisions (the owner, 2026-10-15)

1. Show, do not explain: the human site is the landing page (short), the gallery, interactive movies, the playground, and one page for AI. The Guide leaves the site.
2. **No comparison** with Remotion / fframes (they change; following them is not worth it): the section and every claim about them go.
3. **The two long films** (`ink-and-paper`, `light-as-material`) **stay on the landing page** (the top), played live as now. There is no films page, and they do not go into the gallery.
4. **Interactive movies** keep their own page and are one tile in the landing page's grid of what it can do.
5. **No music lab** on the site (a user need not know it; the AI knows the music layer from the docs).
6. **No new "examples".** An AI's tested examples are the recipes (`pixi-effects recipe`); a human's are the gallery. The numbered tour (01–15) and the check pages are the tests' net: they are kept as such and **not shown**.

## The site after

| Page | Address | Its one job | Size |
|---|---|---|---|
| Home | `/` | Show it: the reel, the one sentence to tell an AI (with the endings that swap), the two films, a strip of what came out, the way in | about 250 words (now 3,700) |
| Gallery | `/examples/gallery/` | The evidence of expressiveness: 43 pieces, each one file of data | one line a piece |
| Interactive | `/examples/interactive/` | A movie you can change while it plays: the demos | as now |
| Playground | `/examples/playground.html` | Try it, and the tools a browser AI agent drives (WebMCP) | as now |
| For AI | `/for-ai.html` (new) | What to paste to an AI, what it reads (`llms.txt`, `llms-full.txt`, `AGENTS.md`, the skill, `npx skills add`), the list of recipes | one short page |

Navigation: Home · Gallery · Interactive · Playground · For AI (+ GitHub, npm in the footer). The `NAV` in `scripts/site-parts.mjs` is the one place.

### The landing page (a skeleton, copy to be written short)

1. **Top**: the reel (play) and one promise line: tell an AI one sentence, get a video.
2. **The sentence**: the existing "tap an ending to swap it, then copy" block (it is the heart of the page); under it three or four pairs of *the sentence → the result* from real gallery pieces.
3. **The films**: the two 45 s films, a poster each and a click to play (as now, with their short caption).
4. **What it can do**: a grid of short looping clips with a label each and no paragraphs (2.5D camera, music written as text, shaders, three.js, an interactive movie, media tools).
5. **Way in**: the sentence to paste, `npx skills add yjmtmtk/pixi-effects`, links to For AI, GitHub, npm.

Removed from the page: the comparison section (830 words), "Written by AI, checked by AI" (409), the long "What you get" (567), the long "A movie you can change" (234), "Start in one minute" (300). What a visitor needs from them is one line each or lives on For AI.

## What goes, what moves, what stays

| Thing | Fate |
|---|---|
| `site/guide/` (21 pages), `scripts/build-guide.mjs`, `scripts/build-guide-demos.mjs`, `site/guide/guide.css`, `examples/_guide/` (17 pages), the guide parts of `stage-site.mjs` and `preview-site.mjs` | Removed from the site. `docs/` stays (the AI's source), and so do the AI's recipes (`skills/pixi-effects/reference/recipes.md` feeds `pixi-effects recipe`; it does not depend on the Guide). The Guide's **24 `// @recipe` blocks are tested library coverage** (`Recipes.test.ts` builds and lints them): each one is merged into the AI recipes if it teaches something they lack, or dropped knowingly (plan, step 1) |
| Comparison section, `site/landing/NOTES.md` and `FACTS.md` lines about Remotion / fframes, the matching `Landing.test.ts` checks, the mention in `SKILL.md` | Removed |
| `examples/films/`, the films block on the landing page, `landing.css` rules for it | **Stay** (the top of the landing page); `stage-site.mjs` copies the folder |
| `examples/music-lab.html`, its tests (`MusicLab.test.ts`, `musicLab.test.ts`), its nav entry, the mentions in README, `docs/api.md`, `docs/dsl.md`, `FACTS.md` | Removed. The music layer itself and its docs stay |
| `examples/01-15-*.html`, `examples/examples.json`, `examples/index.html`, `examples/examples.css`, `ExamplesIndex.test.ts`, the examples part of `sync-site.mjs` and `pages.json` | The pages **move to `tests/pages/`** (the tests that scan them follow: `ease.test.ts` and others); the index, its list and its test are removed; nothing of them is published |
| `examples/_checks/` (51 pages used by about 25 tests) | **Moves to `tests/pages/_checks/`** in the same mechanical step (decided: the tests' net is kept clean and separate) |
| `examples/gallery`, `showreel`, `interactive`, `playground*`, `_assets` | Stay. `stage-site.mjs` stops copying all of `examples/` and copies only these and `films` (a list), so nothing else can ship by accident |
| `README.md` (3 links to `/guide/`), `docs/*.md` (12), tests (8) that name `/guide/` | Re-pointed: to For AI, or to the `docs/` file |

The npm package does not ship `examples/` (`files` lists `dist`, `ai`, `skills`, three docs, `llms*`), so none of this changes the package. It is a documentation and site change: the release gate treats it as "documents only" if no `src/` or tool file changes.

## Plan (each step ends green: `npm run test:fast`, and the site link check on the staged folder)

1. **The Guide's 24 recipe blocks.** `Recipes.test.ts` builds and lints every `// @recipe` block of the AI recipes and of the Guide's cookbook. List the 24, compare each with `recipes.md`, merge the ones that add a case the AI recipes lack (as AI recipes, with the same tests), and drop the rest knowingly (the feature they exercised is still covered by the numbered tour moved to `tests/pages/`). The `recipe` command and its tests do not change.
2. **For AI page and the new landing page** (written short; `FACTS.md` and `Landing.test.ts` updated to the new claims; the endings widget kept). Both old and new coexist until step 3.
3. **Navigation and removals**: new `NAV`, remove the Guide, the comparison, the music lab, the films block; `stage-site.mjs` copies a list; `pages.json`, `sync-site.mjs` and `site/README.md` updated.
4. **The tests' net**: move `examples/NN-*.html` and `examples/_checks/` to `tests/pages/`, change the paths in the tests that read them with one mechanical replacement; delete the index, its list and its test.
5. **Docs**: README, `docs/`, `skills/` and `llms*` regenerated (`npm run build:ai`); the roadmap's site lines rewritten.

Not in this design: new examples, a redesign of the look (the tokens and header stay), a human tutorial of any kind.

## Risks

- Old addresses (`/guide/...`, `/examples/`, `/examples/music-lab.html`) stop working. The only user is the owner: accepted.
- The Guide's 24 recipe blocks are test coverage, not an AI-facing feature (the `recipe` command reads `recipes.md`): step 1 decides each one before anything is deleted.
- About 25 tests read `examples/_checks`: moving them is mechanical but wide; it is done as its own commit, so a red run for a path is fixed or the commit is reverted without touching the rest.

## Decided after review (2026-10-15)

- The films stay on the landing page's top; no films page, none in the gallery.
- The tests' net is moved clean: the numbered tour and `_checks` both go to `tests/pages/`.
- What "fewer tests" means here, exactly: only the Guide's own tests (`Guide.test.ts`, `guideDemo*.test.ts`, the guide parts of the site tests) and its 24 recipe blocks are at risk, because the Guide itself goes; each recipe block is decided in step 1. The numbered tour and `_checks` are moved, not deleted, so no test is lost there.
