#!/usr/bin/env node
/**
 * Run the tests a change needs, not all of them (the full run is for the release gate).
 *
 *   npm run test:changed                  what differs from HEAD (staged, unstaged, new files)
 *   npm run test:changed -- main~3        what differs from that revision
 *   npm run test:changed -- --dry         only say what would run
 *
 * The fast unit tests always run (about 20 s). The browser tests (the slow ones) are chosen by what changed, from the table below.
 * A changed file this table does not know, or one of the build and the test tools, means EVERYTHING runs: when in doubt, run it all.
 */
import { execFileSync, spawnSync } from 'node:child_process';

/** area → the files that belong to it (prefix match on the path) and the browser tests that watch them. */
export const AREAS = [
  { name: 'spring easing', paths: ['src/core/spring.ts', 'src/core/ease.ts', 'src/core/Timeline.ts', 'src/presets/stagger.ts', 'src/presets/_ease.ts'], tests: ['tests/tools/springSeek.test.ts', 'tests/tools/animateText.test.ts'] },
  { name: 'cubic-bezier easing', paths: ['src/core/cubicBezier.ts', 'src/core/ease.ts', 'examples/_checks/cubic-bezier.html'], tests: ['tests/tools/cubicBezier.test.ts'] },
  { name: 'time remap', paths: ['src/core/remap.ts', 'src/core/audioRemap.ts', 'src/core/sourceTime.ts', 'src/core/FrameCache.ts', 'src/sequences/Video.ts', 'src/sequences/Audio.ts', 'src/sequences/Composition.ts', 'src/core/inspect.ts', 'src/core/timelineChart.ts', 'src/core/AudioMixer.ts', 'src/core/inspectAudio.ts', 'examples/_checks/time-remap.html'], tests: ['tests/tools/timeRemap.test.ts', 'tests/tools/timeRemapAudio.test.ts'] },
  { name: 'gradients', paths: ['src/sequences/gradient', 'src/sequences/Shape.ts', 'src/sequences/Text.ts', 'src/expr/colorTween.ts', 'src/expr/colorInterp.ts'], tests: ['tests/tools/gradientAnim.test.ts', 'tests/tools/maskBugs.test.ts', 'tests/tools/lastFrame.test.ts'] },
  { name: 'grain and filters', paths: ['src/filters/', 'src/core/timeFilters.ts'], tests: ['tests/tools/grain.test.ts'] },
  { name: 'key warnings', paths: ['src/core/lint.ts', 'src/core/layerKeys.ts', 'src/core/options.ts', 'src/sequences/Composition.ts'], tests: ['tests/tools/noFalseWarnings.test.ts'] },
  { name: 'gallery pieces', paths: ['examples/gallery/'], tests: ['tests/tools/gallery.test.ts', 'tests/tools/noFalseWarnings.test.ts'] },
  { name: 'numbered examples', paths: ['examples/0', 'examples/1'], tests: ['tests/tools/noFalseWarnings.test.ts'] },
  { name: 'text, motion, seeking', paths: ['src/text/', 'src/presets/animateText.ts', 'src/presets/wiggle.ts', 'src/presets/followPath.ts', 'src/presets/cameraPath.ts', 'src/presets/orbit.ts'], tests: ['tests/tools/animateText.test.ts', 'tests/tools/pathMotion.test.ts', 'tests/tools/seeded.test.ts'] },
  { name: 'particles', paths: ['src/presets/particles.ts'], tests: ['tests/tools/particles.test.ts'] },
  { name: '2.5D and cards', paths: ['src/space/', 'src/three/'], tests: ['tests/tools/cardSeek.test.ts', 'tests/tools/parent.test.ts'] },
  { name: 'mattes', paths: ['src/core/matte.ts', 'src/core/MatteSet.ts', 'src/filters/Matte.ts', 'src/filters/LumaWipe.ts', 'src/core/Transitions.ts', 'examples/_checks/mattes.html'], tests: ['tests/tools/mattes.test.ts', 'tests/tools/blendModes.test.ts'] },
  { name: 'light', paths: ['src/space/', 'src/sequences/Composition.ts', 'examples/_checks/light.html'], tests: ['tests/tools/light.test.ts'] },
  { name: 'blend modes', paths: ['src/core/blend.ts', 'src/filters/blendModes.ts', 'src/space/Layer3D.ts', 'examples/_checks/blend-modes.html', 'tests/support/blendReference.ts'], tests: ['tests/tools/blendModes.test.ts'] },
  { name: 'depth of field', paths: ['src/space/', 'src/filters/DiscBlur.ts', 'src/core/inspect.ts', 'src/sequences/Composition.ts', 'examples/_checks/depth-of-field.html'], tests: ['tests/tools/depthOfField.test.ts'] },
  { name: 'audio', paths: ['src/audio/', 'src/core/AudioMixer.ts', 'src/core/inspectAudio.ts'], tests: ['tests/tools/audioReact.test.ts', 'tests/tools/musicLab.test.ts'] },
  { name: 'playground', paths: ['examples/playground', 'examples/_checks/sandbox-runner.html'], tests: ['tests/tools/playground.test.ts', 'tests/tools/playgroundSandbox.test.ts', 'tests/tools/playgroundMcp.test.ts'] },
  { name: 'chat template', paths: ['ai/chat-template.html', 'ai/CHAT.md'], tests: ['tests/tools/chatTemplate.test.ts', 'tests/tools/playground.test.ts'] },
  { name: 'player and presenter', paths: ['src/Controller.ts', 'src/Presenter.ts', 'src/core/stops.ts', 'src/loader.css', 'src/core/loader.ts'], tests: ['tests/tools/controllerLayout.test.ts', 'tests/tools/presenter.test.ts', 'tests/tools/loader.test.ts'] },
  { name: 'export and frames', paths: ['src/core/Renderer.ts', 'src/core/renderRange.ts', 'src/core/motionBlur.ts', 'src/core/onion.ts', 'src/core/frames.ts', 'src/core/poster.ts'], tests: ['tests/tools/renderRange.test.ts', 'tests/tools/motionBlur.test.ts', 'tests/tools/onion.test.ts', 'tests/tools/poster.test.ts', 'tests/tools/lastFrame.test.ts'] },
  { name: 'site and landing', paths: ['site/', 'index.html', 'scripts/sync-site.mjs', 'scripts/site-parts.mjs', 'scripts/stage-site.mjs'], tests: ['tests/tools/siteShell.test.ts', 'tests/tools/landing.test.ts', 'tests/tools/guideDemo.test.ts'] },
];

/** Changes that need no browser test: documents and generated texts (the unit tests, which always run, read them). */
const NO_BROWSER = [/\.md$/, /^llms(-full)?\.txt$/, /^docs\//, /^CHANGELOG/, /^tests\/(?!tools\/|support\/)/, /^examples\/gallery\/(_notes|posters)\//, /^\.superpowers\//, /^README/];

/** → { full, files }: `full` when something unknown changed; else the browser test files to run (none for documents only). */
export function testsFor(changed) {
  const files = new Set();
  for (const f of [...new Set(changed)]) {
    if (/^tests\/tools\/.+\.test\.ts$/.test(f)) { files.add(f); continue; }              // a browser test that changed runs itself
    if (NO_BROWSER.some(re => re.test(f))) continue;
    const hit = AREAS.filter(a => a.paths.some(p => f === p || f.startsWith(p)));
    if (!hit.length) return { full: true, files: [] };                                    // unknown (or the build, or the test tools): everything
    for (const a of hit) for (const t of a.tests) files.add(t);
  }
  return { full: false, files: [...files] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), dry = args.includes('--dry');
  const base = args.find(a => !a.startsWith('--')) ?? 'HEAD';
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);
  const changed = [...new Set([...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])];
  if (!changed.length) { console.log(`test:changed: nothing differs from ${base}`); process.exit(0); }
  const plan = testsFor(changed);
  console.log(`test:changed: ${changed.length} changed file(s) → ${plan.full ? 'a file this table does not know changed: running EVERYTHING' : `${plan.files.length} browser test file(s)`}`);
  if (dry) { console.log(plan.full ? '(dry run) would run everything' : `(dry run) would run the unit tests and:\n  ${plan.files.join('\n  ') || '(no browser test)'}`); process.exit(0); }
  const run = (args, env = {}) => spawnSync('npx', ['vitest', 'run', ...args], { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
  if (plan.full) process.exit(run([]));
  let status = run([], { SKIP_BROWSER_TESTS: '1' });                                        // the fast tests: always
  if (plan.files.length) status = run(plan.files) || status;
  process.exit(status);
}
