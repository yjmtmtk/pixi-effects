# The pixi-effects site

The GitHub Pages site is four entrances that share one look: **Home** (the landing page), **Gallery**, **Interactive**, **Playground**, and **For AI** (the one page for AI). It shows what the library can do; everything an AI reads lives in `docs/` and `skills/`.
This folder holds what they share. The rest of each page lives next to its own content.

## Where things are

| Entrance | Address | Source | Its own styles |
|---|---|---|---|
| Home | `/` | `index.html` (repository root) | `site/landing/landing.css` |
| Gallery | `/examples/gallery/` | `examples/gallery/index.html` + `pieces.json` (pieces: `<id>.html`) | `examples/gallery/gallery.css` |
| Interactive | `/examples/interactive/` | `examples/interactive/index.html` + the sample pages | inline |
| For AI | `/for-ai.html` | `for-ai.html` (repository root); the recipe list is generated (`recipe-list` region) | `site/landing/landing.css` |
| Playground | `/examples/playground.html` | `examples/playground.html` | inline (an app, not a document) |

**Preview the whole site: `npm run site`.** It builds exactly what Pages serves (`scripts/stage-site.mjs`, the same script the workflow runs) into `_site/` and serves it on http://127.0.0.1:8080/. Run it again to pick up changes.
The repository root is also the site root, but the staged copy is the truth: `stage-site.mjs` copies a list (never `examples/_checks`).

## What is shared (`site/shared/`)

- `tokens.css`: every colour, font and size, for the dark and the light theme. **The only place to change a colour.** `tests/docs/SiteTokens.test.ts` checks the contrast.
- `site.css`: base styles, buttons, the chapter heading, the header and the footer.
- `site.js`: the theme switch (auto / light / dark, remembered in the browser).
- The header, footer and `<head>` links are written by `scripts/site-parts.mjs` into each page, between markers:
  `<!--site:head-->…<!--/site:head-->`, `<!--site:header-->…<!--/site:header-->`, `<!--site:footer-->…<!--/site:footer-->`.
  Do not edit between the markers by hand.

## Common jobs

- **Change the navigation, the header or the footer**: edit `scripts/site-parts.mjs` (the entrances are `NAV`; the footer is built from it too), run `npm run site:sync`. A test fails while any page is out of date (`node scripts/sync-site.mjs --check`).
- **Add a page**: put the three markers and `<main id="main">` in it, add it to `site/pages.json` (`current` is the nav entry it belongs to; `parts` limits the markers, `regions` asks for generated lists), run `npm run site:sync`, and add it to `PAGES` in `tests/tools/siteShell.test.ts`.
- **Add a gallery piece**: see `examples/gallery/BRIEF.md`; `node scripts/build-gallery.mjs` and `node scripts/make-posters.mjs`.
- **Where a style goes**: shared by two or more pages → `site/shared/site.css`; used by one page → that page's own stylesheet.

## Checks

- `npm run test:fast`: includes the shell, the tokens, the examples list and the link check of the staged site: in every page, each `href` / `src` / `poster` / `srcset`, each import-map target and each relative `import` in an inline module script must resolve to a file, and none may start with `/` (which breaks under `/pixi-effects/`). It does not follow links inside separate script or style files, and it does not run the pages (the real-browser tests do).
- `node scripts/site-links.mjs _site`: the same link check on a staged folder.
- `tests/tools/siteShell.test.ts` and `tests/tools/gallery.test.ts` (real Chrome): the header fits at 390 and 1440 px, the theme switch changes the colours, the gallery filters and theatre still work.

## Release

The landing page names the release in several places (`tests/docs/Landing.test.ts` checks that they are all the current version). Bump them with the other version pins; `site/landing/FACTS.md` lists the facts the page rests on.
