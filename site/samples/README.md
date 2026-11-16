# The samples of the site

Every video on the landing page was made by **Claude Opus**, from a message a visitor could send, on the published release. Nothing here is edited by hand; the page shows the message(s), the time it took and how many runs it was picked from (at most 3). Design: `docs/superpowers/specs/2026-11-16-site-v1-design.md`.

## Where things are

- `samples.json` — the list. One entry per piece:

  | key | |
  |---|---|
  | `id` | the folder name: `site/samples/<id>/` |
  | `kind` | `one` (one message), `refined` (a first message, then a few follow-ups in the same session), `promo` ("Make a promo video for this project.", in a clean clone of this repository) |
  | `lang` | `en` `ja` `zh` `es` `ko`: the language the message is written in |
  | `title`, `alt` | a short English title for the card; what the video shows, for people who cannot see it |
  | `messages` | exactly what was sent, in order (one for `one` and `promo`, two or more for `refined`) |
  | `page`, `poster` | the agent's page (as delivered) and its poster, inside the folder |
  | `minutes` | wall clock, from the first message to the delivered MP4 |
  | `runs` | 1–3: the piece is the best of this many runs of the same message |
  | `model` | `Claude Opus` |
  | `version` | the pixi-effects version the page pins |
  | `placeholder` | `true` only on the stand-ins used while the site is built (none are left at launch) |

- `<id>/` — the agent's page and its poster (`poster.jpg` from `pixi-effects check`). The MP4 is not committed: the site plays the page itself.
- `harness/` — how the pieces are made (plan Task 12): the briefs and the script that runs a fresh `claude -p` for each.

## The hero

The landing page's first screen shows, for each language (English, 日本語, 中文, Español, 한국어 in that order), the first `one` piece written in it: its sentence and the video it made. The same piece also has its card further down.

## After changing samples.json

`npm run site:sync` writes the pages again (`tests/docs/Samples.test.ts` checks the list and the generated HTML).
