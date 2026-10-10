# Leave GSAP (the pure timeline becomes the only one) — plan

> Executed inline (the owner's standing choice). Owner decision 2026-10-10 after the spike: "では完全に乗り換えよう". Spec: `docs/superpowers/specs/2026-10-10-pure-timeline-design.md` (Results). Breaking changes are fine (sole experimental user). Do not push or publish.

**Goal.** No `gsap` import anywhere in `src/`; `gsap` leaves `peerDependencies` (it stays a devDependency: the oracle of the parity tests); every page, template and doc loads without it.

**Global constraints.** Frames stay equal to the GSAP build's on the 92 pages that were compared (expo: GSAP 3.15's formula, decided). Eases keep warning on an unknown name. No behaviour added beyond the spike's. Commits end with the Co-Authored-By line. Ledger: `.superpowers/sdd/2026-10-10-leave-gsap/progress.md`.

## Task 1: core without GSAP
- `src/core/timelineEngine.ts` becomes `src/core/timeline.ts`-style helpers with no engine switch: `createTimeline`, `lengthen`, `setNow`, `parseEase`, `interpolateColors`; no `isPure`, no `?pe-timeline`, no `PE_TIMELINE`. The `Timeline` type is `PureTimeline`; every `ReturnType<typeof gsap.timeline>` alias uses it.
- `Movie.ts` (no PixiPlugin), `spring.ts` / `cubicBezier.ts` (no `registerEase`; pure parse only), `core/ease.ts` (`checkEase` asks the pure parser: a name is known when the pure table knows it), `colorTween.ts`, `gradientAnim.ts`, `revertibleSet.ts` (only the pure branch), `colorLerp.ts` (strings it cannot read go through Pixi's `Color` to rgba, no GSAP fallback), presets `_ease.ts`.
- Delete the GSAP-only code beside each pure branch (proxy `p`, `onStart` interpolators).
- Gate: `npx tsc --noEmit`, `npm run test:fast` (tests that import gsap for their own timelines are Task 2).

## Task 2: tests
- The 4 files pinned to GSAP (`MaskTiming`, `KeyframeOrigin`, `TimelineNesting`, `KeyframeLoop`) read the pure timeline's segments instead of `getChildren`; the others already build through `createTimeline`.
- Parity tests keep `gsap` as the oracle (devDependency) and set nothing global.
- Gate: `npm run test:fast` green, no `PE_TIMELINE` anywhere.

## Task 3: package, pages, docs
- `package.json` (peer dependency removed, keyword kept or dropped), `tsup.config.ts` externals, `scripts/build-llms.mjs`, `scripts/site-parts.mjs`.
- Every `importmap` with `gsap` / `gsap/PixiPlugin` (examples, gallery, `_checks`, showreel, site/guide, templates, `ai/chat-template.html`, skill template) loses those two lines (scripted, then a grep proves none is left outside history: `docs/superpowers/plans|specs|spikes`).
- Docs and skill text: "GSAP ease" becomes "ease"; the ease table says what we run; CHANGELOG `Unreleased` (breaking: no GSAP, expo formula, `delay` / callbacks said); `npm run build:ai`.
- Gate: `grep -ril gsap` outside history and tests/oracle is empty or intentional.

## Task 4: prove it
- `npm run build`; capture the 92 pages (`compare-frames.mjs`, no query) against the stored GSAP capture; the only larger differences are the known ones (four expo pages, `named-filters`, `solar-system`).
- Browser tests: `npm test` once (Chrome). Fix what the removal broke.
- Memory note; final summary with what was left.

## Review focus
- A page that still imports `gsap` through its importmap fails silently? (it must not matter: nothing imports it).
- A user spec using a GSAP-only ease name (`CustomEase`, `rough`, `slow`): the warning must say it is not available, not run `power1.out` silently.
- `delay` / `onStart` in a user's keyframe (keyframe type has no such keys: check the lint).
