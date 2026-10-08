# The pixi-effects site

The GitHub Pages site is five entrances that share one look: **Home** (the landing page), **Guide**, **Gallery**, **Examples** and **Playground**.
This folder holds what they share. The rest of each page lives next to its own content.

## Where things are

| Entrance | Address | Source | Its own styles |
|---|---|---|---|
| Home | `/` | `index.html` (repository root) | `site/landing/landing.css` |
| Guide | `/guide/` | `site/guide/*.md`, built by `scripts/build-guide.mjs` | `site/guide/guide.css` |
| Gallery | `/examples/gallery/` | `examples/gallery/index.html` + `pieces.json` (pieces: `<id>.html`) | `examples/gallery/gallery.css` |
| Examples | `/examples/` | `examples/index.html`, list in `examples/examples.json`, pages `NN-*.html` | `examples/examples.css` |
| Playground | `/examples/playground.html` | `examples/playground.html` | inline (an app, not a document) |

The repository root is the site root: open it with any static server (`npx serve .`) and every link works as it does on Pages. The guide is built, not stored: `npm run guide` writes `guide-preview/`.
`node scripts/stage-site.mjs _site` builds exactly what Pages serves; the workflow runs the same script.

## What is shared (`site/shared/`)

- `tokens.css`: every colour, font and size, for the dark and the light theme. **The only place to change a colour.** `tests/docs/SiteTokens.test.ts` checks the contrast.
- `site.css`: base styles, buttons, the chapter heading, the header and the footer.
- `site.js`: the theme switch (auto / light / dark, remembered in the browser).
- The header, footer and `<head>` links are written by `scripts/site-parts.mjs` into each page, between markers:
  `<!--site:head-->…<!--/site:head-->`, `<!--site:header-->…<!--/site:header-->`, `<!--site:footer-->…<!--/site:footer-->`.
  Do not edit between the markers by hand.

## Common jobs

- **Change the navigation, the header or the footer**: edit `scripts/site-parts.mjs`, run `npm run site:sync`. A test fails while any page is out of date (`node scripts/sync-site.mjs --check`).
- **Add a page**: put the three markers and `<main id="main">` in it, add it to `site/pages.json` (`current` is the nav entry it belongs to; `parts` limits the markers, `regions` asks for generated lists), run `npm run site:sync`, and add it to `PAGES` in `tests/tools/siteShell.test.ts`.
- **Add an example**: add the file as `examples/NN-name.html` and an entry to `examples/examples.json`, then `npm run site:sync` (a test fails if a numbered file is missing from the list).
- **Add a gallery piece**: see `examples/gallery/BRIEF.md`; `node scripts/build-gallery.mjs` and `node scripts/make-posters.mjs`.
- **Where a style goes**: shared by two or more pages → `site/shared/site.css`; used by one page → that page's own stylesheet.

## Checks

- `npm run test:fast`: includes the shell, the tokens, the examples list and the link check of the staged site (every local link in every page resolves, and no link starts with `/`, which breaks under `/pixi-effects/`).
- `node scripts/site-links.mjs _site`: the same link check on a staged folder.
- `tests/tools/siteShell.test.ts` and `tests/tools/gallery.test.ts` (real Chrome): the header fits at 390 and 1440 px, the theme switch changes the colours, the gallery filters and theatre still work.

## Release

The landing page names the release in several places (`tests/docs/Landing.test.ts` checks that they are all the current version). Bump them with the other version pins; `site/landing/FACTS.md` lists the facts the page rests on.
