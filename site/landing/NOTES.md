# pixi-effects site (1.0) — design notes

The site's job: a visitor gets their own AI to make a video, fast. The killer use is "Make a promo video for this project." asked in their own project, then posted. Everything else is quiet.

## Look

Direction A, "PixiJS sibling": light lavender (`#fcfbfd` → `#efecf8`), ink `#1d1630`, PixiJS pink `#e91e63` with violet `#8b5cf6`, sky `#38bdf8` and orange `#f2a65a`. Tokens in `site/shared/tokens.css`; the pink is split for contrast (`--pink` shapes and large type, `--pink-deep` under white text, `--pink-text` small text). System type stack; no web fonts at load.

## Pages

- **Home** (`index.html`, `site/landing/`): the hero (one sentence in English or Japanese, the video it made, the install chip), "Make a promo video for this project." (the promo of this repository, its messages beside it), "A few more messages" (one refined piece with its conversation), Start, and a quiet line for the curious.
- **Gallery** (`gallery/`): pieces the owner picked from the old gallery (`site/gallery/`). Each opens in a window over the page at its own pixel size, smaller only when the screen is.
- **Lab** (`lab/`): a video that is not a file: light (measured sizes), sharp (zoom), changes while you watch (variables), touchable (the sneaker), embed.
- **For AI** (`for-ai.html`).

## How the pieces play

`site/shared/live.js`: a poster first; nothing plays until it is pressed (no autoplay); one piece at a time; the piece's own page in an iframe, fitted so the canvas fills the frame whatever the page around it does; the piece's own pixi-effects loader shows while it gets ready (a "Loading" note bridges until then); a piece that cannot start leaves its poster and says so.

## Where the samples come from

`site/samples/` (made by Claude Opus on the published library, unedited, best of 3 at most, every message shown) and `site/samples/harness/` (how they were made). The owner reviews every piece.
