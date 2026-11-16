# The pixi-effects 1.0 site — design

Status: agreed with the owner in conversation on 2026-11-16 (brainstorm). The site ships together with the 1.0.0 release. Mockups shown during the brainstorm are kept in `.superpowers/brainstorm/49364-1794811969/content/` (look.html: the chosen direction A; structure.html: the page order). That folder is git-ignored.

## Why

The site at https://yjmtmtk.github.io/pixi-effects/ (GitHub Pages, from this repository) is being rebuilt for 1.0. The owner's reasons, in their words:

- It does not feel like PixiJS, and it is plain (地味).
- The old gallery's quality is low.
- It does not get across how EASY it is: `npx skills add yjmtmtk/pixi-effects`, or one sentence to an AI.

The message to carry: asking an AI (Claude) to make a video WITH pixi-effects is fast, and the result is good.

**Success is a visitor who:**

- leaves the page and makes a demo video with their own Claude, quickly; and
- best of all, opens their own project, says "make a promo video for this project", gets a good video, and posts it on X.

## Goals

1. **The ease is visible on the first screen.** The first screen shows one sentence, the real video that sentence made, and the one-line install.
2. **The killer use is shown for real.** "Make a promo video for this project.", asked of an AI that has this repository open, with the video it made.
3. **A few sample videos of high quality.** Few, but excellent. They are varied, so that they also serve as debugging fixtures for the library.
4. **The maker's own interests are kept, but quietly** (the owner's 「知る人ぞ知る」). The video is a live web page and not only a file; it can be interactive; it can be made from data or variables. These go on one small Lab page.
5. **A PixiJS-family look:** light, bright and pop.

## Non-goals

- **Explaining how it works inside.** Visitors want results, not mechanisms. They do not need to know the internals.
- **The Playground.** The whole feature is removed, not only the page (owner, builder-check answer). That includes `examples/playground*`, its tests, `scripts/build-presets.mjs` if nothing else needs it, `tests/films/sandbox-runner.html`'s dependency on `examples/playground/host.js`, the Playground steps of `scripts/post-publish-check.mjs`, and the WebMCP / Playground path in AGENTS.md, `ai/CHAT.md`, the skill and the docs. A chat AI then verifies nothing itself; it hands the page over and the person checks it (as CHAT.md already does without WebMCP).
- **A large gallery.** The old 41-piece gallery, the two old films and the old showreel are removed, not migrated.
- **The photo-movie maker.** The owner's idea: load photos, reorder them, add a title, fit the length to a loaded audio file or else use built-in music, and choose one of three looks. It is too good to bury in the Lab, so the owner will do it later as a separate dedicated site. It is out of scope here.
- **Fable, Sonnet or Codex as authors of the samples.** Opus only (the owner: Fable is not much different).

## Anti-goals (a failure even if it works)

- **A sample that claims more than happened.** "One sentence" must mean one message, and the video must be unedited. If a piece was picked from several runs, the page says how many.
- **A site that looks like documentation, or like a developer tool for specialists.** The audience is not after maniac use.
- **Interactive features presented as the headline.** Interactivity is one property among several, and it lives in the Lab.
- **Numbers that are not measured.** There is no "N times faster than without" unless an honest, repeatable benchmark exists. None is planned here.

## Audience

- People arriving from X, mostly developers who have their own projects.
- They use Claude, either in Claude Code or as a chat.
- They do not want to learn a library. They want to ask, and then post the result.

## Design direction (decided)

**Direction A, "PixiJS sibling."** The tokens below were measured from pixijs.com on 2026-11-16.

- **Background:** light lavender, a gradient from `#fcfbfd` to `#efecf8`.
- **Ink:** a dark violet near-black, such as `#1d1630`.
- **Secondary text:** muted violet, such as `#5b5272`.
- **Accents:** PixiJS pink `#e91e63` (primary), violet `#8b5cf6`, sky `#38bdf8` and orange `#f2a65a`.
- **Shapes and type:** soft colour blobs, big bold type with tight tracking, pill buttons in pink, white cards with soft violet shadows.
- **Mood:** pop and friendly, but clean, like pixijs.com and not loud.
- **Motion:** the site may be lively. Where it is, the motion should come from pixi-effects itself. It must respect `prefers-reduced-motion`.
- **Language:** all site copy is in English. The only other languages are the example sentences on the first screen.
- **Dark mode:** not required. A light-only site matches pixijs.com's default. This is the builder's call; dark mode is optional.

## Pages

### 1. `index.html`: one page, top to bottom

**Section 1. Hero: one sentence, and the video it made.**

- Headline in the spirit of "One sentence. A finished video." The exact copy is the builder's call.
- The example sentence, with language tabs: **English, 日本語, 中文, Español, 한국어**.
- Each tab shows a sentence written in that language, in the form "Use https://github.com/yjmtmtk/pixi-effects to make a video: …". Each sentence links to the sample it actually made.
- Beside the sentence, the unedited video, with a caption of the form "Claude Opus · 1 message · N min".
- The calls to action: "Try it with your AI", plus the copyable `npx skills add yjmtmtk/pixi-effects`.

**Section 2. "Make a promo video for this project."**

- The video Opus made of pixi-effects itself, when asked exactly that in this repository.
- Shown with the message, the time taken and "unedited", then: "Open your own project and ask the same."

**Section 3. Made with one sentence: 4 or 5 pieces.**

- Each card has the video, its sentence in the language it was written in, the time it took, and "unedited".
- The pieces are deliberately different from each other: a vertical one, one with 3D, one led by type, one synced to music, one made from data or a chart. Together they cover the five languages of the hero.

**Section 4. A few more messages: 2 or 3 pieces.**

- Each starts as a one-sentence piece. A few follow-up messages then refine it ("warmer", "a slower ending", "add the logo" …).
- The follow-ups are shown as a short chat beside the final video.

**Section 5. Start in 30 seconds.** Two ways, side by side:

- Claude Code, Cursor or Codex: `npx skills add yjmtmtk/pixi-effects`, then ask.
- Any chat: paste one sentence.
- Either way, the MP4 comes from the player's download button or from `npx pixi-effects render`.

**Section 6. For the curious.**

- One quiet line of links into the Lab page and the For AI page. It should be visibly secondary.

**Footer:** GitHub, npm, CHANGELOG, MIT, "made with PixiJS".

### 2. The Lab page: "a video that is not a file"

The headline idea is that a pixi-effects video can be delivered as its source, running in the browser, instead of as an MP4. Interactivity is ONE consequence of that, not the theme (the owner corrected this explicitly).

The page states the claim ("This is not an MP4"). It then shows each property with a small live demonstration:

1. **Light.** The same piece as an MP4 and as the page, with both sizes shown. The sizes must be measured from the real files.
2. **Sharp at any zoom.** A zoom control on both versions: the MP4 blurs, the live one stays crisp.
3. **Changes while you watch.** The title, colours or language are rewritten live (variables / `setVars`).
4. **Touchable.** Two or three interactive pieces: one branches on a click, one turns in 3D on a drag, and one more (scroll or pointer) if it earns its place. Each also exports as an ordinary video when no one touches it.
5. **The same picture every time, and an MP4 when you need one.** A download button.
6. **Put it on your own site.** The few lines of HTML that embed a live video.

Each demonstration carries the sentence you would give an AI to get the same. The Lab pieces may be rebuilt from the current `examples/interactive` demos or made new, whichever reaches the quality bar. The builder decides.

### 3. `for-ai.html`

Kept, because AIs read it: the docs for AI, `llms.txt` and the recipes list. Restyle it to the new look. Its content is not changed by this project, beyond links that point to removed pages.

### Removed

- `examples/playground.html` and `examples/playground/`, as a whole feature (see Non-goals).
- `examples/gallery/` (all pieces and the gallery index).
- `examples/films/`.
- `examples/showreel/`.
- The current `examples/interactive/index.html` as a page. Its demos may be reused by the Lab.

Their tooling goes with them, or is changed:

- `scripts/build-gallery.mjs`, `gallery-swap.mjs`, `make-posters.mjs` and `build-showreel.mjs`;
- the tests in `tests/site/`;
- the page lists used by `scripts/compare-frames.mjs`;
- `scripts/stage-site.mjs`;
- the release pin list (`examples/films/light-as-material.html` holds a version pin);
- any link in the README, AGENTS.md, the skill and the docs that points to a removed page.

No library test may depend on a site page; that rule is already in force, see AGENTS.md.

## How the sample videos are made (decided)

All samples are made by **Claude Opus**, through the clean fresh-agent harness used in the trials:

- `claude -p "<sentence>"` run in a neutral folder;
- `--setting-sources project,local`;
- no access to this repository's source, except for the promo piece below.

**One-sentence pieces (hero and section 3).**

- The input is exactly one message: "Use https://github.com/yjmtmtk/pixi-effects to make a video: <brief>".
- The output is published unedited. If several runs were made and one was chosen, the page says so ("best of 3").
- The brief for each language is written natively in that language.
- The briefs are chosen for variety and for showing off: vertical, 3D, type, music sync, data.

**Refined pieces (section 4).**

- The same start, then a few follow-up messages, sent in the same session (`--resume`).
- All the messages are kept and shown on the page.

**The promo of this project (section 2).**

- Opus runs inside a clean clone of the finished site branch, after 1.0.0 is published, given exactly "Make a promo video for this project." (the owner's phrase, in English).
- Whether the promo shows the site is up to the agent: nothing tells it to (my call: the site is not live yet at that moment, and coaching would break "one message").
- AGENTS.md is the only guidance.
- If the result is weak, that is a finding about AGENTS.md and the skill, not a reason to coach the agent. Fix the docs, then run it again in a fresh session.

**For every piece:**

- Keep the page (.html), the MP4, the poster, the exact messages, the time and the run count.
- The time shown is wall-clock from the first message to the delivered MP4.
- Pieces are checked with `pixi-effects check`, and looked at, before they are published.
- On-screen text in the videos is English, except where a piece's subject needs another language.

Each sample page stays in the repository as a fixture: it is the "varied but minimal" debugging set the owner asked for.

## Constraints

- **Hosting:** static files on GitHub Pages, built by `scripts/stage-site.mjs` in the Pages workflow. Keep that pipeline: what is tested is what ships.
- **Library:** pages load the released library from the jsDelivr CDN with pinned versions. The site's own pages pin 1.0.0. The samples pin whatever the agent wrote, which is 1.0.0 because they are made after it.
- **Videos on the site: everything plays live, as today** (owner, builder-check answer: the current site already does this). A poster image (JPG, committed) shows first; a click, or the hero coming into view, starts the page itself, playing live. No MP4 files are served, except ONE small MP4 committed for the Lab's "MP4 vs page" comparison. Posters stay small: the current 66 posters are 3.2 MB in all.
- **Performance:** the first screen must be fast. Do not start many WebGPU movies at once on load; play on view or on hover.
- **Mobile:** the layout must work at phone width.
- **Accessibility:** captions or alt text for the videos, keyboard-usable tabs and controls, and `prefers-reduced-motion`.
- **Release:** the owner gives an explicit go before any push, tag or release, and runs `npm publish` themselves.

## Order of work (decided)

The samples are made on the published 1.0.0, so every piece is "1.0, unedited" (owner, builder-check answer). In order:

1. **Build the new site on a branch.** Use placeholder samples. Pages deploys every push to main, so main keeps the old site until the end.
2. **Bring the library's AI-facing docs to their 1.0 state on main:**
   - AGENTS.md, the skill, `ai/CHAT.md`, README and the docs;
   - no Playground, no links to removed pages.
   These are what a fresh agent reads from GitHub main.
3. **Release 1.0.0:** the owner's go, then the owner's `npm publish`.
4. **Make the samples on 1.0.0** with fresh Opus sessions (see "How the sample videos are made"), and make the promo of this project in a clean clone of the site branch.
5. **Owner review:** the owner looks at every chosen piece and says OK before it goes on the site.
6. **Put the samples in and merge the site branch:** the site goes live. The gap between 1.0.0 and the live site is expected to be about a day.

**When a one-sentence piece is weak** (owner, builder-check answer):

- Run each sentence at most 3 times and publish the best, labelled "best of 3".
- If all three are weak, fix the docs or the library first, then run it again in a fresh session. 1.0 (or a 1.0.x) may wait for that.

## Left to the builder

- Exact copy, typography, spacing and motion details, within direction A.
- The briefs for the samples, within the variety above.
- Whether the Lab demos are reused or rebuilt.
- How cards play video.
- The file and folder layout of the new pages and assets.
- Whether to add dark mode.
- How the site and test tooling is reorganised once the gallery goes.
