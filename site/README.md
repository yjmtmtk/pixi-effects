# The pixi-effects site

The GitHub Pages site is three pages that share one look (the 1.0 design: `docs/superpowers/specs/2026-11-16-site-v1-design.md`):

- **Home**: one sentence and the video it made, the promo of this project, the samples, and how to start.
- **Lab**: a video that is not a file.
- **For AI**: what an AI reads and runs.

Everything an AI reads lives in `docs/` and `skills/`. This folder holds what the pages share.

## Where things are

| Page | Address | Source | Its own files |
|---|---|---|---|
| Home | `/` | `index.html` (repository root) | `site/landing/landing.css`, `landing.js` |
| Lab | `/lab/` | `lab/index.html`; its pieces in `lab/pieces/`, the one MP4 in `lab/media/` | `lab/lab.css`, `lab/lab.js` |
| For AI | `/for-ai.html` | `for-ai.html` (repository root); the recipe list is generated (`recipe-list` region) | `site/for-ai.css` |

The samples of the home page are data: `site/samples/samples.json`, with one folder per piece. See `site/samples/README.md`.

**Preview the whole site: `npm run site`.** It builds exactly what Pages serves into `_site/` and serves it on http://127.0.0.1:8080/. It uses `scripts/stage-site.mjs`, the same script the workflow runs. Run it again to pick up changes.

## What is shared (`site/shared/`)

- `tokens.css`: every colour, font and size of the 1.0 look. It is light only, with PixiJS's pink, violet, sky and orange as accents. **It is the only place to change a colour.** `tests/docs/SiteTokens.test.ts` checks the exact palette and the contrast.
- `site.css`: the base styles, the pill button, the card, the code chip, the live player, the header and the footer.
- `live.js`: the live player. A poster shows first, then the piece itself plays in an iframe:
  - one plays at a time;
  - under `prefers-reduced-motion`, nothing starts by itself;
  - a piece that cannot start says so.
- `copy.js`: the copy buttons (`data-copy="id"`). It selects the text where the clipboard is refused.
- The header, the footer and the `<head>` links are written by `scripts/site-parts.mjs` into each page, between the markers `<!--site:head-->…<!--/site:head-->`, `<!--site:header-->…<!--/site:header-->` and `<!--site:footer-->…<!--/site:footer-->`. Do not edit between the markers by hand.
- `scripts/sync-site.mjs` also writes the generated regions:
  - the samples: `samples-hero`, `samples-promo`, `samples-one` and `samples-refined`, from `site/samples/samples.json`;
  - the Lab's measured sizes: `lab-sizes`, from `lab/sizes.json`, which `scripts/lab-sizes.mjs` measures;
  - the recipe list: `recipe-list`.

## Common jobs

- **Change the navigation, the header or the footer**: edit `scripts/site-parts.mjs` (the entrances are `NAV`), then run `npm run site:sync`. A test fails while any page is out of date (`node scripts/sync-site.mjs --check`).
- **Add or replace a sample**: follow `site/samples/README.md`, then run `npm run site:sync`.
- **Change the Lab's comparison piece**: render its MP4 again (the command is in the comment at the top of `lab/pieces/compare.html`), then run `node scripts/lab-sizes.mjs` and `npm run site:sync`.
- **Add a page**: put the three markers and `<main id="main">` in it, add it to `site/pages.json`, run `npm run site:sync`, add it to `PAGES` in `tests/site/siteShellBrowser.test.ts`, and add its files to `scripts/stage-site.mjs`.

## Checks

- `npm run test:fast` runs the shell, the tokens, the samples, the Lab's sizes, and the link check of the staged site.
- The real-browser tests (Chrome) are:
  - `tests/site/siteShellBrowser.test.ts`: the header at 390 and 1440 px;
  - `livePlayer`: poster, one at a time, reduced motion, a piece that cannot start;
  - `landing`: the language tabs at 390 px, the keyboard, the copy fallback;
  - `lab`: the zoom redraws, a variable changes the picture, the touchable pieces start.
